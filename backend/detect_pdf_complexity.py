"""
Pre-conversion complexity detector for PDF → Word.

Analyzes a PDF to predict how well pdf2docx will reconstruct it as a
Word document. Reports signals that correlate with fidelity loss:

  • Missing text layer (scanned document) — worst case, needs OCR
  • Multi-column layout — pdf2docx detects this but reconstruction is
    imperfect for complex cases
  • Table density — dense tabular data strains the layout analyzer
  • Font diversity — many unique fonts means more substitution risk
  • Image density — heavy image content can shift positioning
  • Vector graphics — complex drawings rarely convert cleanly
  • Interactive form fields — widgets usually become plain text boxes
  • Page count — longer documents accumulate small errors

Emits a marker-prefixed JSON result on stdout:
    __RESULT__{"accuracyTier":"high","hasTextLayer":true,...}
"""
import sys
import json
import os

MARKER = '__RESULT__'


def log(msg):
    sys.stderr.write(f"[pdf-complexity] {msg}\n")


def _emit(payload):
    sys.stdout.write(f"{MARKER}{json.dumps(payload)}\n")
    sys.stdout.flush()


def _analyze(pdf_path):
    result = {
        'hasTextLayer': False,
        'pageCount': 0,
        'textRatio': 0.0,          # fraction of pages with extractable text
        'tableCount': 0,
        'imageCount': 0,
        'uniqueFontCount': 0,
        'hasForms': False,
        'hasMultiColumn': False,
        'hasVectorGraphics': False,
        'accuracyTier': 'unknown',
        'reasons': [],
    }

    try:
        import fitz
    except ImportError:
        try:
            import pymupdf as fitz
        except ImportError:
            result['error'] = 'PyMuPDF not installed'
            return result

    # Suppress PyMuPDF's stdout chatter
    try:
        fitz.TOOLS.mupdf_display_errors(False)
    except Exception:
        pass

    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        result['error'] = f'cannot open PDF: {e}'
        return result

    try:
        result['pageCount'] = len(doc)

        pages_with_text = 0
        total_tables = 0
        total_images = 0
        total_drawings = 0
        fonts = set()
        has_forms = False
        multi_column_pages = 0

        # Sample up to 8 pages for speed on large documents
        sample_indices = list(range(len(doc)))
        if len(sample_indices) > 8:
            step = max(1, len(sample_indices) // 8)
            sample_indices = sample_indices[::step][:8]

        for idx in sample_indices:
            try:
                page = doc[idx]
            except Exception:
                continue

            # ---- Text presence ----
            try:
                text = page.get_text().strip()
                if len(text) > 20:
                    pages_with_text += 1
            except Exception:
                pass

            # ---- Tables ----
            try:
                tabs = page.find_tables()
                if tabs:
                    total_tables += len(tabs.tables) if hasattr(tabs, 'tables') else len(tabs)
            except Exception:
                pass

            # ---- Images ----
            try:
                imgs = page.get_images(full=True)
                total_images += len(imgs)
            except Exception:
                pass

            # ---- Vector graphics / drawings ----
            try:
                draw = page.get_drawings()
                total_drawings += len(draw) if draw else 0
            except Exception:
                pass

            # ---- Fonts ----
            try:
                for f in page.get_fonts(full=True):
                    # f[3] is the basefont name
                    name = (f[3] or '').strip()
                    if name:
                        fonts.add(name.lower())
            except Exception:
                pass

            # ---- Form widgets ----
            try:
                for w in page.widgets():
                    has_forms = True
                    break
            except Exception:
                pass

            # ---- Multi-column detection ----
            # Look for text blocks that form two distinct x-clusters on the
            # same y-band. This is a rough heuristic — pdf2docx uses a much
            # more sophisticated algorithm internally.
            try:
                blocks = page.get_text('dict').get('blocks', [])
                text_blocks = [
                    b for b in blocks
                    if b.get('type') == 0 and b.get('bbox')
                ]
                if len(text_blocks) >= 6:
                    # Group by y-band (~50pt tall rows)
                    bands = {}
                    for b in text_blocks:
                        y_center = (b['bbox'][1] + b['bbox'][3]) / 2
                        band_key = int(y_center // 50)
                        bands.setdefault(band_key, []).append(b['bbox'][0])
                    # A band with two well-separated x-starts indicates columns
                    for band_key, x_starts in bands.items():
                        x_starts.sort()
                        # Look for a gap > 100pt between consecutive x-starts
                        for i in range(1, len(x_starts)):
                            if x_starts[i] - x_starts[i-1] > 100:
                                multi_column_pages += 1
                                break
            except Exception:
                pass

        # ---- Compute statistics ----
        sampled = max(1, len(sample_indices))
        result['textRatio'] = pages_with_text / sampled
        result['hasTextLayer'] = result['textRatio'] >= 0.5
        result['tableCount'] = total_tables
        result['imageCount'] = total_images
        result['uniqueFontCount'] = len(fonts)
        result['hasForms'] = has_forms
        result['hasMultiColumn'] = multi_column_pages >= max(1, sampled // 2)
        result['hasVectorGraphics'] = total_drawings > 200

        # ---- Derive accuracy tier ----
        reasons = []

        # Worst case: scanned document with no text
        if not result['hasTextLayer']:
            result['accuracyTier'] = 'limited'
            reasons.append(
                "This PDF has no extractable text layer. It appears to be a "
                "scan. Run OCR first — otherwise the output DOCX will be empty "
                "or contain only images."
            )
            result['reasons'] = reasons
            return result

        # Score-based tiering
        complexity = 0
        if result['hasMultiColumn']:
            complexity += 2
            reasons.append(
                "Multi-column layout detected. Column boundaries may not "
                "reconstruct perfectly in Word."
            )
        if result['tableCount'] > 5:
            complexity += 2
            reasons.append(
                f"{result['tableCount']} tables detected. Dense tabular data "
                "may cause minor cell-merging or alignment differences."
            )
        elif result['tableCount'] > 0:
            complexity += 1
        if result['uniqueFontCount'] > 6:
            complexity += 2
            reasons.append(
                f"{result['uniqueFontCount']} unique fonts detected. Custom "
                "font families may be substituted on your machine."
            )
        elif result['uniqueFontCount'] > 3:
            complexity += 1
        if result['imageCount'] > 10:
            complexity += 1
            reasons.append(
                f"{result['imageCount']} images detected. Positioning may "
                "shift slightly during reconstruction."
            )
        if result['hasVectorGraphics']:
            complexity += 1
            reasons.append(
                "Heavy vector graphics detected. Some charts, diagrams, or "
                "shapes may render as static images in the output."
            )
        if result['hasForms']:
            complexity += 1
            reasons.append(
                "Interactive form fields detected. These typically convert "
                "to plain text boxes without fillable behavior."
            )

        if complexity >= 4:
            result['accuracyTier'] = 'approximate'
        elif complexity >= 2:
            result['accuracyTier'] = 'good'
        else:
            result['accuracyTier'] = 'high'

        result['reasons'] = reasons
        return result
    finally:
        try:
            doc.close()
        except Exception:
            pass


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: detect_pdf_complexity.py <input.pdf>\n")
        _emit({
            'accuracyTier': 'unknown',
            'hasTextLayer': False,
            'error': 'no input path provided',
            'reasons': [],
        })
        sys.exit(1)
    try:
        result = _analyze(sys.argv[1])
        _emit(result)
        sys.exit(0)
    except Exception as e:
        log(f"FATAL: {e}")
        _emit({
            'accuracyTier': 'unknown',
            'hasTextLayer': False,
            'error': str(e),
            'reasons': [],
        })
        sys.exit(0)