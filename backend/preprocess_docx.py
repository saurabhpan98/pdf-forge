"""
DOCX preprocessor for Word → PDF conversion.

The single most common cause of "Word says N pages, LibreOffice says N+1"
is trailing empty paragraphs. Word suppresses them when computing the
page count in its status bar; LibreOffice renders them. If they push past
the boundary of the last page, they create a new page.

This preprocessor addresses that, and nothing else. It deliberately does
NOT:
  • strip leading empty paragraphs — that shifts content upward and can
    pull material from page 2 onto page 1
  • inject default spacing values — those differ from the document's own
    docDefaults and can compress or expand layout unpredictably

It DOES:
  • remove empty paragraphs at the very end of the body
  • for every paragraph, resolve the effective before/after/line/lineRule
    values from the style chain and, if any of them exist implicitly,
    write them explicitly. This makes both engines see the same values.

The output is a DOCX that LibreOffice renders with the same vertical
layout as Word for the common case.

Usage:
    python3 preprocess_docx.py <input.docx> <output.docx>
"""
import sys
import os

try:
    from docx import Document
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
except ImportError as exc:
    sys.stderr.write(
        "\n[preprocess] FATAL: python-docx is not installed.\n"
        f"[preprocess] Interpreter: {sys.executable}\n"
        "[preprocess] Fix: python3 -m pip install --break-system-packages python-docx\n\n"
    )
    raise exc


def log(msg):
    sys.stderr.write(f"[preprocess] {msg}\n")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _is_empty_paragraph(p_element):
    """True if a <w:p> has no runs, hyperlinks, drawings, or content."""
    for child in p_element:
        tag = child.tag
        # <w:pPr> is paragraph properties (metadata), not content
        if tag == qn('w:pPr'):
            continue
        # Anything else is real content
        return False
    return True


def _resolve_from_style_chain(paragraph, attr_qn):
    """
    Walk the style hierarchy to find the effective value of an attribute
    inside <w:spacing>. Returns the string value or None.

    Does NOT consult any fallback default — callers decide what to do
    when None is returned.
    """
    # 1. Paragraph-level
    pPr = paragraph._p.find(qn('w:pPr'))
    if pPr is not None:
        sp = pPr.find(qn('w:spacing'))
        if sp is not None:
            v = sp.get(attr_qn)
            if v is not None:
                return v

    # 2. Style chain
    style = paragraph.style
    seen = set()
    while style is not None:
        sid = getattr(style, 'style_id', None) or id(style)
        if sid in seen:
            break
        seen.add(sid)

        el = getattr(style, 'element', None)
        if el is not None:
            style_pPr = el.find(qn('w:pPr'))
            if style_pPr is not None:
                style_sp = style_pPr.find(qn('w:spacing'))
                if style_sp is not None:
                    v = style_sp.get(attr_qn)
                    if v is not None:
                        return v

        style = style.base_style

    return None


def _normalize_paragraph_spacing(paragraph):
    """
    Make inherited spacing explicit on this paragraph.

    Only sets an attribute if (a) it is not already set on the paragraph,
    and (b) it resolves to a value somewhere in the style chain. If nothing
    resolves, the paragraph is left untouched — this preserves the document
    author's intent and lets both engines fall back to docDefaults.

    Never injects a default value.
    """
    pPr = paragraph._p.get_or_add_pPr()
    spacing = pPr.find(qn('w:spacing'))

    # Fast path: does anything in the style chain provide a value?
    attrs = ('w:before', 'w:after', 'w:line', 'w:lineRule')
    provided = {}
    for attr in attrs:
        v = _resolve_from_style_chain(paragraph, qn(attr))
        if v is not None:
            provided[attr] = v

    if not provided:
        return False

    if spacing is None:
        spacing = OxmlElement('w:spacing')
        pPr.append(spacing)

    wrote_any = False
    for attr in attrs:
        attr_qn = qn(attr)
        if spacing.get(attr_qn) is None and attr in provided:
            spacing.set(attr_qn, provided[attr])
            wrote_any = True

    return wrote_any


def _strip_trailing_empty_paragraphs(body):
    """
    Remove empty <w:p> elements from the end of <w:body>. Stops at the
    first non-empty paragraph. Leaves <w:sectPr> intact.
    """
    removed = 0
    for child in reversed(list(body)):
        if child.tag == qn('w:sectPr'):
            # Section properties live at the very end — skip, keep going
            continue
        if child.tag == qn('w:p') and _is_empty_paragraph(child):
            body.remove(child)
            removed += 1
        else:
            break
    if removed:
        log(f"Removed {removed} trailing empty paragraph(s)")
    return removed


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def preprocess(input_path, output_path):
    doc = Document(input_path)
    body = doc.element.body

    # 1. Strip only trailing empties. Nothing at the start.
    _strip_trailing_empty_paragraphs(body)

    # 2. Make inherited spacing explicit — no defaults injected.
    touched = 0
    try:
        for para in doc.paragraphs:
            try:
                if _normalize_paragraph_spacing(para):
                    touched += 1
            except Exception:
                continue
    except Exception as e:
        log(f"Body paragraph scan error: {e}")

    try:
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    for para in cell.paragraphs:
                        try:
                            if _normalize_paragraph_spacing(para):
                                touched += 1
                        except Exception:
                            continue
    except Exception as e:
        log(f"Table paragraph scan error: {e}")

    log(f"Made spacing explicit on {touched} paragraph(s)")

    # 3. Save
    try:
        doc.save(output_path)
        return True
    except Exception as e:
        log(f"Save failed: {e}")
        return False


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.stderr.write("Usage: preprocess_docx.py <in.docx> <out.docx>\n")
        sys.exit(1)
    try:
        ok = preprocess(sys.argv[1], sys.argv[2])
        sys.exit(0 if ok else 1)
    except Exception as exc:
        log(f"FATAL: {exc}")
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)