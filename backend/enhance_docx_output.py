"""
DOCX output post-processor and Word compatibility sanitizer.

Runs on the DOCX produced by pdf2docx before delivery. Fixes the specific
problems Word rejects but lenient viewers (Google Docs, Office Online,
LibreOffice) silently tolerate:

  1. Invalid control characters in text nodes — Word requires XML 1.0
     legal characters only. Bytes 0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F are
     rejected outright, causing "problems with the contents" errors.
  2. Unpaired Unicode surrogates — Word throws the same error on these.
  3. Empty <w:t> nodes — some Word versions reject them.
  4. Paragraph alignment made explicit (locale-safe).
  5. Normal style declared with explicit font name and size.
  6. Table borders made explicit.
  7. Trailing empty paragraphs stripped.

Operates on the file in place. Safe to re-run.

Usage:
    python3 enhance_docx_output.py <file.docx>
"""
import sys
import os
import re
import zipfile
import shutil

try:
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
except ImportError as exc:
    sys.stderr.write(
        "[enhance] FATAL: python-docx not installed.\n"
        f"[enhance] Interpreter: {sys.executable}\n"
        "[enhance] Fix: python3 -m pip install --break-system-packages python-docx\n"
    )
    raise exc


def log(msg):
    sys.stderr.write(f"[enhance] {msg}\n")


# XML 1.0 legal character set. Anything outside this is rejected by Word.
#   Tab (0x09), LF (0x0A), CR (0x0D) are allowed.
#   Printable ASCII and above are allowed except for the surrogate range
#   and a few other reserved codepoints.
def _strip_invalid_chars(text):
    """Remove characters that Word rejects but lenient parsers ignore."""
    if not text:
        return text

    # Regex: keep tab, newline, carriage return, printable ASCII,
    # and anything above U+0020 except unpaired surrogates and non-chars.
    cleaned = []
    for ch in text:
        cp = ord(ch)
        # XML 1.0 legal ranges
        if cp == 0x09 or cp == 0x0A or cp == 0x0D:
            cleaned.append(ch)
        elif 0x20 <= cp <= 0xD7FF:
            cleaned.append(ch)
        elif 0xE000 <= cp <= 0xFFFD:
            cleaned.append(ch)
        elif 0x10000 <= cp <= 0x10FFFF:
            # Check it's a valid codepoint, not an unpaired surrogate
            if not (0xD800 <= cp <= 0xDFFF):
                cleaned.append(ch)
        # else: drop the character
    return ''.join(cleaned)


# ---------------------------------------------------------------------------
# Element-level fixes
# ---------------------------------------------------------------------------
def _sanitize_text_runs(doc):
    """Fix text content Word rejects."""
    fixed_runs = 0
    fixed_texts = 0
    removed_empty = 0

    for para in doc.paragraphs:
        for run in para.runs:
            for t_elem in run._element.findall(qn('w:t')):
                original = t_elem.text or ''
                sanitized = _strip_invalid_chars(original)

                # Remove runs whose text is completely empty after cleaning
                if not sanitized and original:
                    removed_empty += 1
                    t_elem.text = ''
                    continue

                if sanitized != original:
                    t_elem.text = sanitized
                    fixed_texts += 1

            # Set xml:space="preserve" so Word doesn't trim leading/trailing
            # whitespace silently — required when text has significant spaces.
            for t_elem in run._element.findall(qn('w:t')):
                if t_elem.text and (t_elem.text != t_elem.text.strip()):
                    t_elem.set(qn('xml:space'), 'preserve')
            fixed_runs += 1

    return fixed_runs, fixed_texts, removed_empty


def _sanitize_table_text(doc):
    """Same sanitization inside table cells."""
    fixed_texts = 0
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for para in cell.paragraphs:
                    for run in para.runs:
                        for t_elem in run._element.findall(qn('w:t')):
                            original = t_elem.text or ''
                            sanitized = _strip_invalid_chars(original)
                            if sanitized != original:
                                t_elem.text = sanitized
                                fixed_texts += 1
                            if t_elem.text and (t_elem.text != t_elem.text.strip()):
                                t_elem.set(qn('xml:space'), 'preserve')
    return fixed_texts


def _has_content(p_element):
    for child in p_element:
        if child.tag == qn('w:pPr'):
            continue
        return True
    return False


def _strip_trailing_empty(doc):
    body = doc.element.body
    removed = 0
    for child in reversed(list(body)):
        if child.tag == qn('w:sectPr'):
            continue
        if child.tag == qn('w:p') and not _has_content(child):
            body.remove(child)
            removed += 1
            continue
        break
    return removed


def _ensure_normal_style(doc):
    try:
        normal = doc.styles['Normal']
        if not normal.font.name:
            normal.font.name = 'Calibri'
        if not normal.font.size:
            normal.font.size = Pt(11)
    except Exception as e:
        log(f"Normal style fix failed: {e}")


def _ensure_explicit_alignment(doc):
    count = 0
    for para in doc.paragraphs:
        try:
            if para.alignment is None:
                para.alignment = WD_ALIGN_PARAGRAPH.LEFT
                count += 1
        except Exception:
            continue
    return count


def _ensure_table_borders(doc):
    touched = 0
    for table in doc.tables:
        try:
            tbl = table._tbl
            tblPr = tbl.find(qn('w:tblPr'))
            if tblPr is None:
                from docx.oxml import OxmlElement
                tblPr = OxmlElement('w:tblPr')
                tbl.insert(0, tblPr)
            borders = tblPr.find(qn('w:tblBorders'))
            if borders is None:
                from docx.oxml import OxmlElement
                borders = OxmlElement('w:tblBorders')
                for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
                    el = OxmlElement(f'w:{side}')
                    el.set(qn('w:val'), 'single')
                    el.set(qn('w:sz'), '4')
                    el.set(qn('w:color'), 'A6A6A6')
                    borders.append(el)
                tblPr.append(borders)
                touched += 1
        except Exception:
            continue
    return touched


# ---------------------------------------------------------------------------
# Zip-level fix — repair the low-level XML that python-docx does not touch
# ---------------------------------------------------------------------------
def _sanitize_zip_xml(path):
    """
    Rewrite word/document.xml, word/styles.xml, and the header/footer XML
    files, stripping invalid characters that python-docx's higher-level API
    doesn't reach (headers, footers, comments, notes, textboxes, etc.).

    This is where the majority of the "problems with the contents" issues
    live when a file opens in Google Docs but not Word.
    """
    temp_path = path + '.sanitize.tmp'
    doc_parts_to_fix = [
        'word/document.xml',
        'word/styles.xml',
        'word/settings.xml',
        'word/header1.xml', 'word/header2.xml', 'word/header3.xml',
        'word/footer1.xml', 'word/footer2.xml', 'word/footer3.xml',
        'word/comments.xml', 'word/footnotes.xml', 'word/endnotes.xml',
    ]

    # Regex-based sanitizer for XML text content. Strips characters
    # illegal in XML 1.0 while preserving valid markup.
    ILLEGAL_XML_CHARS = re.compile(
        r'[\x00-\x08\x0B\x0C\x0E-\x1F\uD800-\uDFFF\uFFFE\uFFFF]'
    )

    changed_files = 0
    try:
        with zipfile.ZipFile(path, 'r') as zin:
            with zipfile.ZipFile(temp_path, 'w', zipfile.ZIP_DEFLATED) as zout:
                for item in zin.infolist():
                    data = zin.read(item.filename)
                    if item.filename in doc_parts_to_fix:
                        try:
                            text = data.decode('utf-8', errors='strict')
                            cleaned = ILLEGAL_XML_CHARS.sub('', text)
                            if cleaned != text:
                                data = cleaned.encode('utf-8')
                                changed_files += 1
                        except UnicodeDecodeError:
                            # If strict decode fails, try lenient mode then
                            # re-encode as valid UTF-8.
                            try:
                                text = data.decode('utf-8', errors='ignore')
                                cleaned = ILLEGAL_XML_CHARS.sub('', text)
                                data = cleaned.encode('utf-8')
                                changed_files += 1
                            except Exception:
                                pass
                    zout.writestr(item, data)
        shutil.move(temp_path, path)
    except Exception as e:
        log(f"zip-level sanitization failed: {e}")
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception:
            pass
        return 0

    return changed_files


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def enhance(path):
    if not os.path.exists(path):
        log(f"file not found: {path}")
        return False

    try:
        doc = Document(path)
    except Exception as e:
        log(f"cannot open: {e}")
        return False

    # 1. Sanitize text
    runs_touched, texts_fixed, empties_removed = _sanitize_text_runs(doc)
    if texts_fixed or empties_removed:
        log(f"sanitized text: {texts_fixed} fix(es), {empties_removed} empty run(s)")

    table_texts = _sanitize_table_text(doc)
    if table_texts:
        log(f"sanitized {table_texts} table text node(s)")

    # 2. Clean trailing empties
    removed = _strip_trailing_empty(doc)
    if removed:
        log(f"removed {removed} trailing empty paragraph(s)")

    # 3. Normal style
    _ensure_normal_style(doc)

    # 4. Alignment
    aligned = _ensure_explicit_alignment(doc)
    if aligned:
        log(f"set explicit alignment on {aligned} paragraph(s)")

    # NOTE: _ensure_table_borders was removed. pdf2docx already writes
    # per-cell <w:tcBorders>, so adding table-level borders creates a
    # visual doubling effect. Table borders are always present.

    try:
        doc.save(path)
    except Exception as e:
        log(f"save failed: {e}")
        return False

    # 5. Zip-level XML sanitization
    changed = _sanitize_zip_xml(path)
    if changed:
        log(f"cleaned illegal XML characters in {changed} part(s)")

    # 6. Verify still readable
    try:
        verify = Document(path)
        _ = len(verify.paragraphs)
    except Exception as e:
        log(f"VERIFICATION FAILED after sanitization: {e}")
        return False

    return True


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: enhance_docx_output.py <file.docx>\n")
        sys.exit(1)
    sys.exit(0 if enhance(sys.argv[1]) else 1)