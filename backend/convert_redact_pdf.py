"""
True PDF redaction engine powered by PyMuPDF.

Removes text, images, and vector graphics permanently from the PDF content
stream underneath user-drawn rectangles — not just painting a black box on
top. The removed content is not recoverable by extracting text, copy/paste,
or examining the file with a hex editor.

Usage:
    python3 convert_redact_pdf.py <input.pdf> <output.pdf> <payload.json>

payload.json format:
{
  "options": {
    "fillColor": [0, 0, 0],
    "scrubImages": true,
    "scrubGraphics": true
  },
  "redactions": [
    { "page": 1, "x0": 100, "y0": 200, "x1": 300, "y1": 240 },
    ...
  ]
}
"""
import sys
import os
import json

try:
    import fitz  # PyMuPDF (legacy import name)
except ImportError:
    try:
        import pymupdf as fitz  # PyMuPDF 1.24+ alias
    except ImportError as exc:
        sys.stderr.write(
            "\n[redact] FATAL: PyMuPDF is not installed in this interpreter.\n"
            f"[redact] Interpreter: {sys.executable}\n"
            "[redact] Fix: python3 -m pip install --break-system-packages PyMuPDF\n\n"
        )
        raise exc


def log(msg):
    sys.stderr.write(f"[redact] {msg}\n")


def _const(name, default):
    return getattr(fitz, name, default)


# Constant fallbacks in case a build renamed them
IMG_NONE    = _const('PDF_REDACT_IMAGE_NONE', 0)
IMG_REMOVE  = _const('PDF_REDACT_IMAGE_REMOVE', 1)
IMG_PIXELS  = _const('PDF_REDACT_IMAGE_PIXELS', 2)

LA_NONE           = _const('PDF_REDACT_LINE_ART_NONE', 0)
LA_REMOVE_TOUCHED = _const('PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED', 1)
LA_REMOVE_COVERED = _const('PDF_REDACT_LINE_ART_REMOVE_IF_COVERED', 2)

TXT_REMOVE = _const('PDF_REDACT_TEXT_REMOVE', 0)


def _apply_redactions(page, scrub_images, scrub_graphics):
    """
    Apply redactions with the richest option set the current PyMuPDF
    build supports. Degrades gracefully if the graphics= or text=
    keyword isn't recognised.
    """
    img_mode = IMG_PIXELS if scrub_images else IMG_NONE
    la_mode  = LA_REMOVE_COVERED if scrub_graphics else LA_NONE

    try:
        page.apply_redactions(images=img_mode, graphics=la_mode, text=TXT_REMOVE)
        return 'full'
    except (TypeError, ValueError):
        pass

    try:
        page.apply_redactions(images=img_mode, graphics=la_mode)
        return 'images+graphics'
    except (TypeError, ValueError):
        pass

    try:
        page.apply_redactions(images=img_mode)
        return 'images-only'
    except (TypeError, ValueError):
        pass

    page.apply_redactions()
    return 'default'


def perform_redactions(input_path, output_path, payload):
    options = payload.get('options', {}) or {}
    redactions = payload.get('redactions', []) or []

    fill_raw = options.get('fillColor', [0, 0, 0])
    try:
        fill_tuple = tuple(max(0.0, min(1.0, float(c))) for c in fill_raw[:3])
        if len(fill_tuple) < 3:
            fill_tuple = (0.0, 0.0, 0.0)
    except Exception:
        fill_tuple = (0.0, 0.0, 0.0)

    scrub_images   = bool(options.get('scrubImages', True))
    scrub_graphics = bool(options.get('scrubGraphics', True))

    doc = fitz.open(input_path)
    total_pages = len(doc)
    log(f"Opened PDF: {total_pages} page(s), {len(redactions)} rect(s) supplied")

    # Group rects by page
    by_page = {}
    for r in redactions:
        try:
            page_num = int(r.get('page', 1))
            x0 = float(r['x0']); y0 = float(r['y0'])
            x1 = float(r['x1']); y1 = float(r['y1'])
        except (KeyError, TypeError, ValueError):
            continue
        if x1 < x0: x0, x1 = x1, x0
        if y1 < y0: y0, y1 = y1, y0
        if x1 - x0 < 0.5 or y1 - y0 < 0.5:
            continue
        by_page.setdefault(page_num, []).append((x0, y0, x1, y1))

    applied_total = 0
    pages_touched = 0

    for page_num in sorted(by_page.keys()):
        if not (1 <= page_num <= total_pages):
            log(f"  page {page_num} out of range — skipped")
            continue

        page = doc[page_num - 1]
        page_rect = page.rect

        added_this_page = 0
        for (x0, y0, x1, y1) in by_page[page_num]:
            rect = fitz.Rect(x0, y0, x1, y1)
            rect.normalize()
            rect &= page_rect  # clamp to page bounds
            if rect.is_empty or rect.width < 0.5 or rect.height < 0.5:
                continue
            try:
                page.add_redact_annot(rect, fill=fill_tuple)
                added_this_page += 1
            except Exception as e:
                log(f"  add_redact_annot failed on page {page_num}: {e}")

        if added_this_page == 0:
            continue

        try:
            mode = _apply_redactions(page, scrub_images, scrub_graphics)
            applied_total += added_this_page
            pages_touched += 1
            log(f"  page {page_num}: applied {added_this_page} redaction(s) [{mode}]")
        except Exception as e:
            log(f"  apply_redactions FAILED on page {page_num}: {e}")

    # Save with maximum scrubbing so removed content truly disappears
    try:
        doc.save(
            output_path,
            garbage=4,
            deflate=True,
            clean=True,
        )
        log(f"Saved: {output_path} ({applied_total} redactions on {pages_touched} page(s))")
    except Exception as e:
        log(f"save failed: {e}")
        raise
    finally:
        try:
            doc.close()
        except Exception:
            pass

    return {
        'applied': applied_total,
        'pages': pages_touched,
    }


if __name__ == '__main__':
    if len(sys.argv) < 4:
        log("Usage: convert_redact_pdf.py <in.pdf> <out.pdf> <payload.json>")
        sys.exit(1)
    try:
        with open(sys.argv[3], 'r', encoding='utf-8') as f:
            payload = json.load(f)
        result = perform_redactions(sys.argv[1], sys.argv[2], payload)
        if result['applied'] == 0:
            log("WARNING: no redactions were applied.")
        sys.exit(0)
    except Exception as exc:
        log(f"FATAL: {exc}")
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)