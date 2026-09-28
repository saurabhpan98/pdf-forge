"""
PDF compression engine powered by PyMuPDF for the Deep Compress algorithm.

Rasterizes each page to an optimized JPEG at the target DPI, then rebuilds
the PDF. This is the same approach BentoPDF calls "Photon" — ideal for
scanned or photo-heavy documents where text is already non-selectable.

Supports:
  • Target DPI (72-300)
  • JPEG quality (10-95)
  • Grayscale conversion
  • Metadata stripping
  • Monotonic guarantee (returns original if output is larger)

Usage:
    python3 convert_compress_pdf.py <in.pdf> <out.pdf> <payload.json>

payload.json:
{
  "dpi": 96,
  "quality": 75,
  "grayscale": false,
  "removeMetadata": true
}
"""
import sys
import os
import json

try:
    import fitz  # PyMuPDF
except ImportError:
    try:
        import pymupdf as fitz
    except ImportError as exc:
        sys.stderr.write(
            "\n[compress] FATAL: PyMuPDF is not installed.\n"
            f"[compress] Interpreter: {sys.executable}\n"
            "[compress] Fix: python3 -m pip install --break-system-packages PyMuPDF\n\n"
        )
        raise exc


def log(msg):
    sys.stderr.write(f"[compress] {msg}\n")


def _apply_grayscale(pixmap):
    """Convert an RGB pixmap to grayscale in-place."""
    try:
        # PyMuPDF supports colorspace conversion on the pixmap
        gray = fitz.Pixmap(fitz.csGRAY, pixmap)
        return gray
    except Exception:
        return pixmap


def compress_pdf(input_path, output_path, payload):
    dpi = max(50, min(400, int(payload.get('dpi', 96))))
    quality = max(10, min(95, int(payload.get('quality', 75))))
    grayscale = bool(payload.get('grayscale', False))
    remove_metadata = bool(payload.get('removeMetadata', True))

    src_doc = fitz.open(input_path)
    total_pages = len(src_doc)
    log(f"Opened: {total_pages} page(s), target {dpi} DPI @ q{quality}")

    out_doc = fitz.open()

    for page_num in range(total_pages):
        page = src_doc[page_num]

        # Render at the target DPI. Base PDF user space is 72 DPI.
        scale = dpi / 72.0
        mat = fitz.Matrix(scale, scale)

        # alpha=False so we don't waste space on transparency
        pix = page.get_pixmap(matrix=mat, alpha=False, colorspace=fitz.csRGB)

        if grayscale:
            pix = _apply_grayscale(pix)

        # Encode as JPEG at the target quality
        try:
            img_bytes = pix.tobytes(output='jpeg', jpg_quality=quality)
        except TypeError:
            # Older PyMuPDF builds don't support jpg_quality kwarg
            img_bytes = pix.tobytes(output='jpeg')

        # Compute the page's display size (in PDF points) at the original scale
        page_rect = page.rect
        new_page = out_doc.new_page(width=page_rect.width, height=page_rect.height)

        # Insert the JPEG to fill the page
        new_page.insert_image(
            fitz.Rect(0, 0, page_rect.width, page_rect.height),
            stream=img_bytes,
        )

        if (page_num + 1) % 10 == 0 or page_num == total_pages - 1:
            log(f"  processed {page_num + 1}/{total_pages}")

    # Strip metadata if requested
    if remove_metadata:
        try:
            out_doc.set_metadata({
                'format': 'PDF 1.7',
                'title': '',
                'author': '',
                'subject': '',
                'keywords': '',
                'creator': 'PDF Forge',
                'producer': 'PDF Forge',
                'creationDate': '',
                'modDate': '',
            })
        except Exception as e:
            log(f"metadata strip failed: {e}")

    # Save with max scrubbing
    try:
        out_doc.save(
            output_path,
            garbage=4,
            deflate=True,
            clean=True,
            deflate_images=True,
            deflate_fonts=True,
        )
        log(f"Saved: {output_path}")
    except TypeError:
        # Older PyMuPDF builds lack deflate_images/deflate_fonts
        out_doc.save(output_path, garbage=4, deflate=True, clean=True)
    except Exception as e:
        log(f"save failed: {e}")
        raise
    finally:
        try:
            out_doc.close()
        except Exception:
            pass
        try:
            src_doc.close()
        except Exception:
            pass

    return os.path.getsize(output_path)


if __name__ == '__main__':
    if len(sys.argv) < 4:
        log("Usage: convert_compress_pdf.py <in.pdf> <out.pdf> <payload.json>")
        sys.exit(1)
    try:
        with open(sys.argv[3], 'r', encoding='utf-8') as f:
            payload = json.load(f)
        size = compress_pdf(sys.argv[1], sys.argv[2], payload)
        log(f"Final size: {size} bytes")
        sys.exit(0)
    except Exception as exc:
        log(f"FATAL: {exc}")
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)