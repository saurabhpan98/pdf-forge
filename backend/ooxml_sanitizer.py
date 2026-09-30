"""
OOXML schema sanitizer.

Word enforces the ECMA-376 XSD schema strictly. Google Docs, Office Online,
and LibreOffice are lenient and silently accept invalid XML. This script
fixes the schema violations Word rejects:

  1. Duplicate children. A <w:tcPr> can contain at most one <w:tcMar>;
     pdf2docx sometimes emits two, which Word rejects outright. This is
     the most common cause of "opens in Google Docs, fails in Word."
  2. Element ordering. OOXML uses xs:sequence for the children of every
     complex type. If children appear out of order, Word rejects the file.
  3. Table grid consistency. <w:tblGrid> column count must equal the sum
     of gridSpan values across rows.
  4. Missing <w:p> in table cells. Every <w:tc> must contain at least
     one <w:p> as a direct child.
  5. <w:sectPr> required children. <w:pgSz> must be present.
  6. Attribute value constraints. e.g. <w:jc> inside <w:tblPr> allows
     start/center/end/left/right, not "both".

Usage:
    python3 ooxml_sanitizer.py <file.docx>

Operates in place. Safe to re-run.
"""
import sys
import os
import zipfile
import shutil
from lxml import etree

# ---------------------------------------------------------------------------
# Namespace
# ---------------------------------------------------------------------------
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
W14 = 'http://schemas.microsoft.com/office/word/2010/wordml'
MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'


def _q(tag):
    return f'{{{W}}}{tag}'


# ---------------------------------------------------------------------------
# Element orderings from ECMA-376 Part 1
# ---------------------------------------------------------------------------
ORDER_PPR = [
    'pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr',
    'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs',
    'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct',
    'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd',
    'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents',
    'suppressOverlap', 'jc', 'textDirection', 'textAlignment',
    'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr',
    'pPrChange',
]

ORDER_RPR = [
    'rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps',
    'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint',
    'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing',
    'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect',
    'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang',
    'eastAsianLayout', 'specVanish', 'oMath', 'rPrChange',
]

ORDER_TBLPR = [
    'tblStyle', 'tblpPr', 'tblOverlap', 'bidiVisual', 'tblStyleRowBandSize',
    'tblStyleColBandSize', 'tblW', 'jc', 'tblCellSpacing', 'tblInd',
    'tblBorders', 'shd', 'tblLayout', 'tblCellMar', 'tblLook', 'tblCaption',
    'tblDescription', 'tblPrChange',
]

ORDER_TCPR = [
    'cnfStyle', 'tcW', 'gridSpan', 'hMerge', 'vMerge', 'tcBorders', 'shd',
    'noWrap', 'tcMar', 'textDirection', 'tcFitText', 'vAlign', 'hideMark',
    'headers', 'cellIns', 'cellDel', 'cellMerge', 'tcPrChange',
]

ORDER_TRPR = [
    'cnfStyle', 'divId', 'gridBefore', 'gridAfter', 'wBefore', 'wAfter',
    'cantSplit', 'trHeight', 'tblHeader', 'tblCellSpacing', 'jc', 'hidden',
    'ins', 'del', 'trPrChange',
]

ORDER_SECTPR = [
    'headerReference', 'footerReference', 'footnotePr', 'endnotePr', 'type',
    'pgSz', 'pgMar', 'paperSrc', 'pgBorders', 'lnNumType', 'pgNumType',
    'cols', 'formProt', 'vAlign', 'noEndnote', 'titlePg', 'textDirection',
    'bidi', 'rtlGutter', 'docGrid', 'printerSettings', 'sectPrChange',
]

ORDERINGS = {
    'pPr': ORDER_PPR,
    'rPr': ORDER_RPR,
    'tblPr': ORDER_TBLPR,
    'tcPr': ORDER_TCPR,
    'trPr': ORDER_TRPR,
    'sectPr': ORDER_SECTPR,
}

# Tags that may legitimately repeat inside their parent.
# Keyed by (parent_tag, child_tag) -> True if multiple occurrences are allowed.
# For every other combination, duplicates are schema violations.
REPEATABLE = {
    # sectPr allows up to 3 headerReference and 3 footerReference (by type)
    ('sectPr', 'headerReference'): True,
    ('sectPr', 'footerReference'): True,
    # tblPr's tblStyleRowBandSize/tblStyleColBandSize are single.
    # trPr's ins/del — can technically appear more than once in tracked changes,
    # but pdf2docx never produces them.
    # pPr's rPr can only appear once.
    # Everything else is maxOccurs=1.
}


# ---------------------------------------------------------------------------
# Attribute constraints
# ---------------------------------------------------------------------------
JC_VALUES_PARAGRAPH = {
    'start', 'center', 'end', 'left', 'right', 'both', 'mediumKashida',
    'distribute', 'numTab', 'highKashida', 'lowKashida', 'thaiDistribute',
}
JC_VALUES_TABLE = {'start', 'center', 'end', 'left', 'right'}


# ---------------------------------------------------------------------------
# Fix 1: deduplicate children (the critical fix for pdf2docx)
# ---------------------------------------------------------------------------
def _deduplicate_children(elem, parent_local):
    """
    Remove duplicate children whose tag appears more than once.

    Most OOXML property children are maxOccurs=1 in the schema. pdf2docx
    sometimes emits two <w:tcMar> elements inside one <w:tcPr>, which Word
    rejects as a schema violation while lenient readers silently accept.

    For known-repeatable tags (headerReference, footerReference in sectPr),
    we deduplicate on (tag, w:type) so only same-type duplicates get
    removed, not legitimate distinct entries.
    """
    removed = 0

    # Group children by tag
    seen_tags = {}
    for child in list(elem):
        tag = child.tag

        # Determine if this tag is allowed to repeat in this parent
        child_local = etree.QName(child).localname
        repeatable = REPEATABLE.get((parent_local, child_local), False)

        if repeatable:
            # Deduplicate by (tag, w:type attribute)
            type_val = child.get(_q('type'), '')
            key = (tag, type_val)
        else:
            key = (tag,)

        if key in seen_tags:
            elem.remove(child)
            removed += 1
        else:
            seen_tags[key] = child

    return removed


def _dedupe_all(root):
    """Walk the tree and deduplicate children of every known container."""
    removed = 0
    for elem in root.iter():
        local = etree.QName(elem).localname
        if local in ORDERINGS:
            removed += _deduplicate_children(elem, local)
    return removed


# ---------------------------------------------------------------------------
# Fix 2: reorder children
# ---------------------------------------------------------------------------
def _reorder_children(elem, order):
    order_index = {_q(tag): i for i, tag in enumerate(order)}

    children = list(elem)
    if not children:
        return 0

    known = []
    unknown = []
    for child in children:
        if child.tag in order_index:
            known.append(child)
        else:
            unknown.append(child)

    if not known:
        return 0

    known_sorted = sorted(known, key=lambda c: order_index[c.tag])

    if known == known_sorted:
        return 0

    for child in children:
        elem.remove(child)

    for child in known_sorted:
        elem.append(child)
    for child in unknown:
        elem.append(child)

    return 1


def _reorder_all(root):
    changes = 0
    for child in root.iter():
        local = etree.QName(child).localname
        if local in ORDERINGS:
            changes += _reorder_children(child, ORDERINGS[local])
    return changes


# ---------------------------------------------------------------------------
# Fix 7: normalize vMerge across rows
#
# pdf2docx emits <w:vMerge w:val="restart"/> on every row of a merged
# column instead of only the first. Word then renders each row as a new
# cell block, which visually looks like the table is doubled.
#
# The correct structure is:
#   Row 1:  <w:vMerge w:val="restart"/>
#   Row 2:  <w:vMerge/>
#   Row 3:  <w:vMerge/>
#
# This function walks each table column-by-column and demotes duplicate
# "restart" markers to the continuation form.
# ---------------------------------------------------------------------------
def _normalize_vmerge(root):
    changes = 0

    for tbl in root.iter(_q('tbl')):
        # Build a column-aware view of the grid. Each physical column may
        # be spanned by gridSpan, so we track positions rather than raw
        # cell indexes.
        for grid_col in range(1000):  # safety bound
            # Track whether the previous row had a vMerge continuation
            # marker for this column
            previous_was_merged = False
            # True if we found at least one cell at this column in this table
            column_exists = False
            # Track how many total cells we've seen at this column
            cells_at_column = 0

            for tr in tbl.findall(_q('tr')):
                # Walk cells in this row, tracking the cumulative column offset
                col_offset = 0
                cell_at_column = None
                for tc in tr.findall(_q('tc')):
                    tcPr = tc.find(_q('tcPr'))
                    span = 1
                    if tcPr is not None:
                        gs = tcPr.find(_q('gridSpan'))
                        if gs is not None:
                            val = gs.get(_q('val'))
                            try:
                                span = max(1, int(val)) if val else 1
                            except (TypeError, ValueError):
                                span = 1

                    if col_offset <= grid_col < col_offset + span:
                        cell_at_column = tc
                        break

                    col_offset += span

                if cell_at_column is None:
                    continue

                column_exists = True
                cells_at_column += 1

                tcPr = cell_at_column.find(_q('tcPr'))
                if tcPr is None:
                    previous_was_merged = False
                    continue

                vmerge = tcPr.find(_q('vMerge'))
                if vmerge is None:
                    previous_was_merged = False
                    continue

                val = vmerge.get(_q('val'))

                if val == 'restart':
                    if previous_was_merged:
                        # Demote to continuation
                        vmerge.attrib.pop(_q('val'), None)
                        changes += 1
                    # Regardless, this row starts a merged block
                    previous_was_merged = True
                elif val is None or val == 'continue':
                    # Explicit continuation
                    previous_was_merged = True
                else:
                    previous_was_merged = False

            if not column_exists:
                break  # No more columns in this table

    return changes


# ---------------------------------------------------------------------------
# Fix 3: table grid consistency
# ---------------------------------------------------------------------------
def _fix_table_grids(root):
    changes = 0
    for tbl in root.iter(_q('tbl')):
        tblPr = tbl.find(_q('tblPr'))
        if tblPr is None:
            tblPr = etree.Element(_q('tblPr'))
            tbl.insert(0, tblPr)
            changes += 1

        tblGrid = tbl.find(_q('tblGrid'))
        if tblGrid is None:
            tblGrid = etree.Element(_q('tblGrid'))
            tblPr_index = list(tbl).index(tblPr)
            tbl.insert(tblPr_index + 1, tblGrid)
            changes += 1

        max_cols = 0
        for tr in tbl.findall(_q('tr')):
            col_count = 0
            for tc in tr.findall(_q('tc')):
                if not tc.findall(_q('p')):
                    p = etree.SubElement(tc, _q('p'))
                    changes += 1

                tcPr = tc.find(_q('tcPr'))
                span = 1
                if tcPr is not None:
                    gs = tcPr.find(_q('gridSpan'))
                    if gs is not None:
                        val = gs.get(_q('val'))
                        try:
                            span = int(val) if val else 1
                        except (TypeError, ValueError):
                            span = 1
                col_count += span
            if col_count > max_cols:
                max_cols = col_count

        existing_cols = tblGrid.findall(_q('gridCol'))
        if len(existing_cols) < max_cols:
            for _ in range(max_cols - len(existing_cols)):
                gc = etree.SubElement(tblGrid, _q('gridCol'))
                gc.set(_q('w'), '2400')
                changes += 1
        elif len(existing_cols) > max_cols:
            for extra in existing_cols[max_cols:]:
                tblGrid.remove(extra)
                changes += 1

    return changes


# ---------------------------------------------------------------------------
# Fix 4: section properties
# ---------------------------------------------------------------------------
def _fix_sections(root):
    changes = 0
    for sectPr in root.iter(_q('sectPr')):
        if sectPr.find(_q('pgSz')) is None:
            pgsz = etree.Element(_q('pgSz'))
            pgsz.set(_q('w'), '12240')
            pgsz.set(_q('h'), '15840')
            sectPr.insert(0, pgsz)
            changes += 1
    return changes


# ---------------------------------------------------------------------------
# Fix 6: normalize newer-schema start/end to legacy left/right
#
# ECMA-376 1st edition (2006) — which Word 2007 validates against —
# does not include <w:start> and <w:end>. These elements and attributes
# were introduced in the 2008 revision for RTL support. When Word 2007
# encounters them it throws "Unspecified error" and refuses to open the
# file. Google Docs, Office Online, and modern Word versions accept them
# because they use the newer schema.
#
# pdf2docx emits the newer form. We rewrite it to the legacy form, which
# every version of Word understands.
# ---------------------------------------------------------------------------

# Containers whose children include start/end (newer) or left/right (legacy)
BORDER_AND_MARGIN_CONTAINERS = {
    'tcMar', 'tblCellMar',
    'tcBorders', 'tblBorders', 'pBdr', 'pgBorders',
}

# Elements whose attributes include start/end (newer) or left/right (legacy)
ATTR_LEVEL_ELEMENTS = {
    'ind', 'tblInd',
}


def _normalize_start_end(root):
    """
    Rewrite newer-schema <w:start>/<w:end> elements and attributes into the
    2006-compatible <w:left>/<w:right> form.
    """
    changes = 0

    for elem in root.iter():
        local = etree.QName(elem).localname

        # ---- Element renaming inside border/margin containers ----
        if local in BORDER_AND_MARGIN_CONTAINERS:
            for child in list(elem):
                child_local = etree.QName(child).localname
                if child_local == 'start':
                    child.tag = _q('left')
                    changes += 1
                elif child_local == 'end':
                    child.tag = _q('right')
                    changes += 1

        # ---- Attribute renaming on <w:ind> and <w:tblInd> ----
        if local in ATTR_LEVEL_ELEMENTS:
            start_attr = _q('start')
            end_attr = _q('end')
            left_attr = _q('left')
            right_attr = _q('right')

            if start_attr in elem.attrib:
                if left_attr not in elem.attrib:
                    elem.attrib[left_attr] = elem.attrib.pop(start_attr)
                else:
                    del elem.attrib[start_attr]
                changes += 1

            if end_attr in elem.attrib:
                if right_attr not in elem.attrib:
                    elem.attrib[right_attr] = elem.attrib.pop(end_attr)
                else:
                    del elem.attrib[end_attr]
                changes += 1

    return changes

# ---------------------------------------------------------------------------
# Fix 5: attribute value constraints
# ---------------------------------------------------------------------------
def _fix_attribute_values(root):
    changes = 0

    for tblPr in root.iter(_q('tblPr')):
        jc = tblPr.find(_q('jc'))
        if jc is not None:
            val = jc.get(_q('val'))
            if val and val not in JC_VALUES_TABLE:
                jc.set(_q('val'), 'left')
                changes += 1

    for pPr in root.iter(_q('pPr')):
        jc = pPr.find(_q('jc'))
        if jc is not None:
            val = jc.get(_q('val'))
            if val and val not in JC_VALUES_PARAGRAPH:
                jc.set(_q('val'), 'left')
                changes += 1

    for tblW in root.iter(_q('tblW')):
        if tblW.get(_q('w')) is None:
            tblW.set(_q('w'), '0')
            changes += 1
        if tblW.get(_q('type')) is None:
            tblW.set(_q('type'), 'auto')
            changes += 1

    for tl in root.iter(_q('tblLayout')):
        if tl.get(_q('type')) is None:
            tl.set(_q('type'), 'autofit')
            changes += 1

    for gs in root.iter(_q('gridSpan')):
        val = gs.get(_q('val'))
        try:
            if val is None or int(val) < 1:
                gs.set(_q('val'), '1')
                changes += 1
        except (TypeError, ValueError):
            gs.set(_q('val'), '1')
            changes += 1

    return changes


# ---------------------------------------------------------------------------
# XML helpers
# ---------------------------------------------------------------------------
def _parse_xml(data):
    parser = etree.XMLParser(
        remove_blank_text=False,
        resolve_entities=False,
        recover=False,
    )
    return etree.fromstring(data, parser=parser)


def _serialize_xml(root):
    return etree.tostring(
        root,
        xml_declaration=True,
        encoding='UTF-8',
        standalone=True,
    )


# ---------------------------------------------------------------------------
# Parts to sanitize
# ---------------------------------------------------------------------------
PARTS_TO_SANITIZE = [
    'word/document.xml',
    'word/header1.xml', 'word/header2.xml', 'word/header3.xml',
    'word/footer1.xml', 'word/footer2.xml', 'word/footer3.xml',
    'word/footnotes.xml',
    'word/endnotes.xml',
    'word/comments.xml',
]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def sanitize(path):
    if not os.path.exists(path):
        print(f"[sanitize] file not found: {path}", file=sys.stderr)
        return False

    temp_path = path + '.sanitize.tmp'
    total_changes = 0
    parts_changed = 0

    try:
        with zipfile.ZipFile(path, 'r') as zin:
            with zipfile.ZipFile(temp_path, 'w', zipfile.ZIP_DEFLATED) as zout:
                for item in zin.infolist():
                    data = zin.read(item.filename)

                    if item.filename in PARTS_TO_SANITIZE:
                        try:
                            root = _parse_xml(data)
                            changes = 0
                            # ORDER MATTERS:
                            #   dedupe first — removes duplicates that would
                            #   otherwise confuse the reorder step
                            #   reorder second — puts remaining children in
                            #   schema sequence
                            changes += _dedupe_all(root)
                            changes += _reorder_all(root)
                            changes += _normalize_start_end(root)
                            changes += _normalize_vmerge(root)
                            changes += _fix_table_grids(root)
                            changes += _fix_sections(root)
                            changes += _fix_attribute_values(root)

                            if changes > 0:
                                data = _serialize_xml(root)
                                total_changes += changes
                                parts_changed += 1
                                print(
                                    f"[sanitize] {item.filename}: "
                                    f"{changes} fix(es)",
                                    file=sys.stderr,
                                )
                        except etree.XMLSyntaxError as e:
                            print(
                                f"[sanitize] XML parse failed for "
                                f"{item.filename}: {e}",
                                file=sys.stderr,
                            )
                        except Exception as e:
                            print(
                                f"[sanitize] sanitization failed for "
                                f"{item.filename}: {e}",
                                file=sys.stderr,
                            )

                    zout.writestr(item, data)

        shutil.move(temp_path, path)

        # Verify the file is still a valid zip with well-formed XML
        try:
            with zipfile.ZipFile(path, 'r') as zf:
                for name in zf.namelist():
                    if name.endswith('.xml'):
                        _parse_xml(zf.read(name))
        except Exception as e:
            print(f"[sanitize] VERIFICATION FAILED: {e}", file=sys.stderr)
            return False

        print(
            f"[sanitize] Applied {total_changes} fix(es) across "
            f"{parts_changed} part(s)",
            file=sys.stderr,
        )
        return True
    except Exception as e:
        print(f"[sanitize] FATAL: {e}", file=sys.stderr)
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception:
            pass
        return False


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: ooxml_sanitizer.py <file.docx>\n")
        sys.exit(1)
    sys.exit(0 if sanitize(sys.argv[1]) else 1)