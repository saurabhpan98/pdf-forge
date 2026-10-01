"""
High-fidelity PDF → Excel conversion with strict strategy priority.

KEY INSIGHT: Line-based table detection must be tried FIRST and its
results used if it succeeds. Text-based detection is a fallback only —
it guesses column boundaries from character density and routinely
over-splits real text (e.g. "Column header" → "Column" + "der"), or
misidentifies title text as a table.

Extraction tiers (strict priority):

  Tier 1 — pdfplumber: lines vertical + lines horizontal
      Uses actual drawn borders. Highest fidelity for tables with
      visible grid lines. This is the correct strategy for 80%+ of
      real-world business PDFs.

  Tier 2 — pdfplumber: lines vertical + text horizontal
      Uses visible vertical lines for column positions and text
      baselines for row positions. Handles tables with horizontal
      rules only.

  Tier 3 — PyMuPDF find_tables
      A completely different detector that succeeds where pdfplumber
      refuses. Uses its own grid reconstruction algorithm.

  Tier 4 — pdfplumber: text vertical + lines horizontal
      Fallback for borderless tables. Only used if tiers 1–3 all
      fail on a page.

  Tier 5 — Whitespace column splitting
      Last resort for pages with no tables at all. Guarantees the
      sheet is never empty when the page has text.

Modes:
  • 'tables' — Use tiers 1–4. Fall back to tier 5 only if the whole
    document had no tables. (RECOMMENDED, default)
  • 'mixed'  — Tiers 1–4 for tables, tier 5 for pages without tables.
  • 'text'   — Tier 5 only. One line per row, one sheet per page.
"""
import sys
import os
import re
import json

try:
    import pdfplumber
except ImportError as exc:
    sys.stderr.write("[xlsx] FATAL: pdfplumber is not installed.\n")
    raise exc

try:
    import fitz  # PyMuPDF
except ImportError:
    try:
        import pymupdf as fitz
    except ImportError:
        fitz = None

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

MARKER = '__RESULT__'


def log(msg):
    sys.stderr.write(f"[xlsx] {msg}\n")


def _emit(payload):
    sys.stdout.write(f"{MARKER}{json.dumps(payload)}\n")
    sys.stdout.flush()


# ===========================================================================
# Numeric parsing
# ===========================================================================
_CURRENCY_SYMBOLS = ['$', '€', '£', '₹', '¥', '₩']
_NUM_RE = re.compile(r'^-?\d+(\.\d+)?([eE][+-]?\d+)?$')


def parse_cell_value(raw):
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None

    negative = False
    if s.startswith('(') and s.endswith(')'):
        negative = True
        s = s[1:-1].strip()
    if s.startswith('-'):
        negative = True
        s = s[1:].strip()

    for sym in _CURRENCY_SYMBOLS:
        if s.startswith(sym):
            s = s[len(sym):].strip()
            break

    is_percent = False
    if s.endswith('%'):
        is_percent = True
        s = s[:-1].strip()

    if ',' in s and '.' in s:
        if s.rfind(',') > s.rfind('.'):
            s = s.replace('.', '').replace(',', '.')
        else:
            s = s.replace(',', '')
    elif ',' in s:
        parts = s.split(',')
        if all(len(p) == 3 for p in parts[1:]) and len(parts[0]) <= 3:
            s = ''.join(parts)
        else:
            s = s.replace(',', '.')

    if _NUM_RE.match(s):
        try:
            n = float(s)
            if is_percent:
                n = n / 100.0
            if negative:
                n = -n
            if n == int(n) and abs(n) < 1e15:
                return int(n)
            return n
        except ValueError:
            pass

    return raw


# ===========================================================================
# Quality filtering — rejects false-positive tables
# ===========================================================================
def _table_quality(data, strategy_kind):
    """
    Return a quality score for a candidate table. Returns 0 to reject.

    Rules:
      • Must have at least 2 rows and 2 columns
      • Must have at least 4 filled cells
      • At least 2 columns must have 2+ filled cells (real tabular data
        has repeating structure — titles do not)
      • Not more than 40% of cells are long prose (> 60 chars)
      • Not more than 20% of cells are single characters (fragments)
      • Line-based detection gets a priority multiplier
    """
    if not data or len(data) < 2:
        return 0

    num_cols = max((len(r) for r in data if r), default=0)
    if num_cols < 2:
        return 0

    col_counts = [0] * num_cols
    total_cells = 0
    prose_cells = 0
    single_char_cells = 0

    for row in data:
        if not row:
            continue
        for c_idx, cell in enumerate(row):
            if c_idx >= num_cols:
                continue
            if cell is None:
                continue
            text = str(cell).strip()
            if not text:
                continue
            col_counts[c_idx] += 1
            total_cells += 1
            if len(text) > 60:
                prose_cells += 1
            if len(text) == 1:
                single_char_cells += 1

    if total_cells < 4:
        return 0

    populated_cols = sum(1 for c in col_counts if c >= 2)
    if populated_cols < 2:
        return 0

    if prose_cells / total_cells > 0.4:
        return 0

    if single_char_cells / total_cells > 0.2:
        return 0

    score = total_cells
    if strategy_kind == 'lines':
        # Line-based detection is far more reliable. Boost its score
        # so it beats any text-based candidate.
        score *= 3.0

    return score


# ===========================================================================
# Row merging
# ===========================================================================
def merge_continued_rows(rows, num_cols):
    if not rows:
        return rows
    merged = [list(rows[0])]
    for row in rows[1:]:
        prev = merged[-1]
        non_empty_count = sum(1 for c in row if c and str(c).strip())
        is_continuation = False

        if non_empty_count == 1:
            try:
                col_idx = next(i for i, c in enumerate(row) if c and str(c).strip())
                prev_cell = prev[col_idx] if col_idx < len(prev) else None
                if prev_cell and str(prev_cell).strip():
                    is_continuation = True
            except StopIteration:
                pass

        if not is_continuation and non_empty_count > 1:
            matches = 0
            for i, cell in enumerate(row):
                if not cell or not str(cell).strip():
                    continue
                cell_text = str(cell).strip()
                prev_text = str(prev[i]).strip() if i < len(prev) and prev[i] else ''
                if not prev_text:
                    continue
                if (cell_text[:1].islower() and
                        not prev_text.endswith(('.', ':', ';', '!', '?'))):
                    matches += 1
            if matches == non_empty_count:
                is_continuation = True

        if is_continuation:
            for i, cell in enumerate(row):
                if cell and str(cell).strip():
                    prev_text = str(prev[i]).strip() if i < len(prev) and prev[i] else ''
                    sep = ' ' if prev_text and not prev_text.endswith('-') else ''
                    prev[i] = prev_text + sep + str(cell).strip()
        else:
            merged.append(list(row))
    return merged


# ===========================================================================
# Merged cell detection
# ===========================================================================
def detect_merged_cells(table_obj):
    """Detect horizontal merges by comparing cell widths to the min
    column width in the same table. Returns (row_idx, col_idx, span)."""
    merges = []
    if not hasattr(table_obj, 'rows') or not table_obj.rows:
        return merges

    try:
        widths = []
        for row in table_obj.rows:
            for cell in row.cells:
                if cell is not None:
                    widths.append(round(cell[2] - cell[0], 1))
    except Exception:
        return merges

    if not widths:
        return merges

    widths_sorted = sorted(widths)
    # Use the 25th percentile as the "one column" width
    baseline = widths_sorted[max(0, len(widths_sorted) // 4)]
    if baseline <= 0:
        return merges

    used = set()
    for r_idx, row in enumerate(table_obj.rows):
        try:
            for c_idx, cell in enumerate(row.cells):
                if cell is None:
                    continue
                x0, _, x1, _ = cell
                w = x1 - x0
                span = max(1, round(w / baseline))
                if span <= 1:
                    continue
                covered = {(r_idx, c_idx + k) for k in range(span)}
                if covered & used:
                    continue
                merges.append((r_idx, c_idx, span))
                used |= covered
        except Exception:
            continue

    return merges


# ===========================================================================
# Column widths from PDF geometry
# ===========================================================================
def measure_column_widths(table_obj, num_cols):
    widths = [0.0] * num_cols
    counts = [0] * num_cols
    try:
        for row in table_obj.rows:
            for c_idx, cell in enumerate(row.cells):
                if cell is None or c_idx >= num_cols:
                    continue
                x0, _, x1, _ = cell
                widths[c_idx] += (x1 - x0)
                counts[c_idx] += 1
    except Exception:
        return None

    result = []
    for i in range(num_cols):
        if counts[i] > 0:
            avg_pt = widths[i] / counts[i]
            w_chars = max(8, min(80, avg_pt / 7.0))
            result.append(w_chars)
        else:
            result.append(12)
    return result


# ===========================================================================
# Header detection
# ===========================================================================
def detect_header_row_count(rows):
    count = 0
    for row in rows[:3]:
        non_empty = [c for c in row if c and str(c).strip()]
        if not non_empty:
            break
        all_short = all(len(str(c).strip()) < 30 for c in non_empty)
        no_numbers = all(
            parse_cell_value(c) is None or isinstance(parse_cell_value(c), str)
            for c in non_empty
        )
        if all_short and no_numbers:
            count += 1
        else:
            break
    return max(1, count) if rows else 0


# ===========================================================================
# TIER 1 & 2 — pdfplumber (line-based)
# ===========================================================================
# ORDER MATTERS. Line-based strategies are tried first. Text-based
# strategies are only used when line-based finds nothing.
_PDFPLUMBER_STRATEGIES = [
    {
        'vertical_strategy': 'lines',
        'horizontal_strategy': 'lines',
        'snap_tolerance': 3,
        'join_tolerance': 3,
        'edge_min_length': 3,
        'intersection_tolerance': 3,
        '_kind': 'lines',
        '_label': 'lines/lines',
    },
    {
        'vertical_strategy': 'lines',
        'horizontal_strategy': 'text',
        'snap_tolerance': 3,
        'join_tolerance': 3,
        'edge_min_length': 3,
        '_kind': 'lines',
        '_label': 'lines/text',
    },
    {
        'vertical_strategy': 'text',
        'horizontal_strategy': 'lines',
        'snap_tolerance': 3,
        'join_tolerance': 3,
        'edge_min_length': 3,
        '_kind': 'text',
        '_label': 'text/lines',
    },
    {
        'vertical_strategy': 'text',
        'horizontal_strategy': 'text',
        'snap_tolerance': 3,
        'join_tolerance': 3,
        'edge_min_length': 3,
        '_kind': 'text',
        '_label': 'text/text',
    },
]


def _extract_pdfplumber_tables(page):
    """
    Try each strategy in strict priority order. Stop at the first
    strategy that produces at least one valid table. Line-based
    strategies are prioritised by the order of the list; they also
    get a quality boost inside _table_quality.
    """
    for strategy in _PDFPLUMBER_STRATEGIES:
        kind = strategy['_kind']
        label = strategy['_label']
        settings = {k: v for k, v in strategy.items() if not k.startswith('_')}

        try:
            tables = page.find_tables(table_settings=settings)
        except Exception as e:
            log(f"  strategy {label} find_tables threw: {e}")
            continue

        tables = list(tables) if tables else []
        if not tables:
            continue

        extracted = []
        for table in tables:
            try:
                data = table.extract()
            except Exception as e:
                log(f"  strategy {label} extract threw: {e}")
                continue
            if not data:
                continue
            score = _table_quality(data, kind)
            if score > 0:
                extracted.append((table, data))

        if extracted:
            log(f"  strategy {label} produced {len(extracted)} valid table(s)")
            return extracted, label

    return [], None


# ===========================================================================
# TIER 3 — PyMuPDF find_tables
# ===========================================================================
class _FakeCell:
    __slots__ = ('x0', 'y0', 'x1', 'y1')
    def __init__(self, rect):
        self.x0, self.y0, self.x1, self.y1 = rect
    def __iter__(self):
        return iter((self.x0, self.y0, self.x1, self.y1))


class _FakeRow:
    __slots__ = ('cells',)
    def __init__(self, cells):
        self.cells = cells


class _FakeTable:
    __slots__ = ('rows', '_data')
    def __init__(self, data, rows):
        self.rows = rows
        self._data = data
    def extract(self):
        return self._data


def _extract_pymupdf_tables(pdf_path, page_index):
    if fitz is None:
        return []

    try:
        doc = fitz.open(pdf_path)
        page = doc[page_index]
        tabs = page.find_tables()
    except Exception as e:
        log(f"  PyMuPDF find_tables failed: {e}")
        return []

    results = []
    try:
        for table in tabs:
            data = table.extract()
            if not data:
                continue
            score = _table_quality(data, 'lines')
            if score == 0:
                continue
            try:
                rows_objs = []
                for row in table.rows:
                    cells_objs = [
                        _FakeCell(c) if c is not None else None
                        for c in row.cells
                    ]
                    rows_objs.append(_FakeRow(cells_objs))
                results.append((_FakeTable(data, rows_objs), data))
            except Exception:
                results.append((_FakeTable(data, []), data))
    except Exception as e:
        log(f"  PyMuPDF iteration failed: {e}")
    finally:
        try:
            doc.close()
        except Exception:
            pass

    return results


# ===========================================================================
# TIER 5 — whitespace text columns
# ===========================================================================
def _extract_text_columns(page):
    try:
        text = page.extract_text(layout=False) or ''
    except Exception:
        return []

    rows = []
    for line in text.split('\n'):
        cleaned = line.rstrip()
        if not cleaned.strip():
            continue
        parts = re.split(r'  +', cleaned)
        parts = [p.strip() for p in parts]
        if len(parts) >= 2:
            rows.append(parts)
        else:
            rows.append([cleaned.strip()])
    return rows


# ===========================================================================
# Workbook writer
# ===========================================================================
HEADER_FILL = PatternFill(start_color="E8EEF7", end_color="E8EEF7", fill_type="solid")
HEADER_FONT = Font(name="Calibri", size=10, bold=True, color="1F2937")
BODY_FONT = Font(name="Calibri", size=10)

THIN_BORDER = Border(
    left=Side(style='thin', color='D1D5DB'),
    right=Side(style='thin', color='D1D5DB'),
    top=Side(style='thin', color='D1D5DB'),
    bottom=Side(style='thin', color='D1D5DB'),
)


def _write_rows_to_sheet(ws, rows, start_row, merges=None, apply_header_style=True):
    if not rows:
        return start_row

    num_cols = max(len(r) for r in rows)
    normalized = [list(r) + [None] * (num_cols - len(r)) for r in rows]
    normalized = merge_continued_rows(normalized, num_cols)

    header_count = detect_header_row_count(normalized) if apply_header_style else 0

    for r_idx, row in enumerate(normalized):
        is_header = r_idx < header_count
        for c_idx, cell in enumerate(row):
            if cell is None or str(cell).strip() == '':
                continue
            parsed = parse_cell_value(cell)
            target = ws.cell(row=start_row + r_idx, column=c_idx + 1)
            target.value = parsed if parsed is not None else str(cell).strip()
            target.border = THIN_BORDER
            target.alignment = Alignment(
                vertical="center",
                wrap_text=True,
                horizontal="center" if is_header else "left",
            )
            target.font = HEADER_FONT if is_header else BODY_FONT
            if is_header:
                target.fill = HEADER_FILL

    if merges:
        applied = []
        for r_idx, c_idx, span in merges:
            if r_idx >= len(normalized):
                continue
            end_col = min(c_idx + span, num_cols)
            if end_col <= c_idx:
                continue
            sr, sc = start_row + r_idx, c_idx + 1
            er, ec = sr, end_col
            overlaps = False
            for (r1, c1, r2, c2) in applied:
                if not (er < r1 or sr > r2 or ec < c1 or sc > c2):
                    overlaps = True
                    break
            if overlaps:
                continue
            try:
                ws.merge_cells(start_row=sr, start_column=sc, end_row=er, end_column=ec)
                applied.append((sr, sc, er, ec))
            except Exception:
                pass

    return start_row + len(normalized)


def _polish_sheet(ws, header_count=1):
    if ws.max_row < 1:
        return
    try:
        freeze_row = max(2, header_count + 1)
        ws.freeze_panes = f"A{freeze_row}"
    except Exception:
        pass
    # auto_filter deliberately NOT set — it breaks Excel when combined
    # with merged cells.


def _unique_sheet_name(wb, desired):
    name = desired[:31]
    base = name
    suffix = 1
    while name in wb.sheetnames:
        name = f"{base[:28]}_{suffix}"
        suffix += 1
    return name


# ===========================================================================
# Main
# ===========================================================================
def build_workbook(pdf_path, output_path, options=None):
    options = options or {}
    mode = options.get('mode', 'tables')

    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    total_tables = 0
    total_rows = 0
    total_text_pages = 0

    last_ws = None
    last_col_count = 0
    last_header_text = None

    with pdfplumber.open(pdf_path) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            page_num = page_idx + 1

            if mode == 'text':
                rows = _extract_text_columns(page)
                if rows:
                    ws = wb.create_sheet(title=_unique_sheet_name(wb, f"Page {page_num}"))
                    _write_rows_to_sheet(ws, rows, 1, apply_header_style=False)
                    ws.column_dimensions['A'].width = 80
                    total_text_pages += 1
                    total_rows += len(rows)
                continue

            log(f"--- Page {page_num} ---")

            # Tiers 1 & 2
            tables, used_label = _extract_pdfplumber_tables(page)

            # Tier 3
            if not tables:
                log(f"  no pdfplumber tables, trying PyMuPDF")
                tables = _extract_pymupdf_tables(pdf_path, page_idx)
                if tables:
                    used_label = 'pymupdf'
                    log(f"  PyMuPDF produced {len(tables)} table(s)")

            if not tables:
                log(f"  page {page_num}: no tables found in any tier")
                if mode == 'mixed':
                    rows = _extract_text_columns(page)
                    if rows:
                        ws = wb.create_sheet(title=_unique_sheet_name(wb, f"Page {page_num} Text"))
                        _write_rows_to_sheet(ws, rows, 1, apply_header_style=False)
                        ws.column_dimensions['A'].width = 80
                        total_text_pages += 1
                        total_rows += len(rows)
                continue

            # Write each table
            for t_idx, (table_obj, data) in enumerate(tables):
                if not data:
                    continue

                first_row = data[0] if data else []
                first_row_text = ' '.join(str(c or '').strip() for c in first_row)
                col_count = len(first_row)

                is_continuation = (
                    last_ws is not None
                    and col_count == last_col_count
                    and last_header_text is not None
                    and first_row_text.strip().lower() == last_header_text.strip().lower()
                )

                if is_continuation:
                    data_body = data[1:]
                    start_row = last_ws.max_row + 1
                    _write_rows_to_sheet(last_ws, data_body, start_row)
                    total_rows += len(data_body)
                else:
                    sheet_title = f"Page {page_num}"
                    if len(tables) > 1:
                        sheet_title += f" T{t_idx + 1}"
                    sheet_title = _unique_sheet_name(wb, sheet_title)

                    ws = wb.create_sheet(title=sheet_title)
                    merges = detect_merged_cells(table_obj) if hasattr(table_obj, 'rows') else []
                    _write_rows_to_sheet(ws, data, 1, merges=merges)

                    col_widths = measure_column_widths(table_obj, len(first_row))
                    if col_widths:
                        for c_idx, w in enumerate(col_widths):
                            ws.column_dimensions[get_column_letter(c_idx + 1)].width = w

                    header_count = detect_header_row_count(data)
                    _polish_sheet(ws, header_count)

                    last_ws = ws
                    last_col_count = col_count
                    last_header_text = first_row_text
                    total_tables += 1
                    total_rows += len(data)

    # Ultimate fallback — if nothing at all was written, dump text
    if not wb.sheetnames:
        log("no tables found anywhere — falling back to text extraction")
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for page_idx, page in enumerate(pdf.pages):
                    rows = _extract_text_columns(page)
                    if rows:
                        ws = wb.create_sheet(title=_unique_sheet_name(wb, f"Page {page_idx + 1}"))
                        _write_rows_to_sheet(ws, rows, 1, apply_header_style=False)
                        ws.column_dimensions['A'].width = 80
                        total_text_pages += 1
                        total_rows += len(rows)
        except Exception as e:
            log(f"text fallback failed: {e}")

    if not wb.sheetnames:
        ws = wb.create_sheet(title="Empty")
        ws.cell(row=1, column=1, value="No extractable content was found in this PDF.")
        ws.cell(row=2, column=1, value="If this is a scanned document, run OCR PDF first.")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    wb.save(output_path)

    return {
        'tables': total_tables,
        'rows': total_rows,
        'sheets': len(wb.sheetnames),
        'textPages': total_text_pages,
        'mode': mode,
    }


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.stderr.write("Usage: convert_pdf2excel.py <input.pdf> <output.xlsx> [payload.json]\n")
        _emit({'success': False, 'error': 'missing arguments'})
        sys.exit(1)

    in_pdf = sys.argv[1]
    out_xlsx = sys.argv[2]

    options = {}
    if len(sys.argv) > 3 and os.path.exists(sys.argv[3]):
        try:
            with open(sys.argv[3], 'r', encoding='utf-8') as f:
                options = json.load(f)
        except Exception as e:
            log(f"payload parse failed: {e}")

    try:
        result = build_workbook(in_pdf, out_xlsx, options)
        result['success'] = True
        _emit(result)
        sys.exit(0)
    except Exception as e:
        log(f"FATAL: {e}")
        import traceback
        traceback.print_exc(file=sys.stderr)
        _emit({'success': False, 'error': str(e)})
        sys.exit(1)