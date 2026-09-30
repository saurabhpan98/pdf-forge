"""
Rasterize a PDF: render every page to a JPEG at a target DPI, then
reassemble into a new PDF with the same page dimensions.

Used in High-Fidelity mode. It does not improve LibreOffice's chart
rendering — it preserves exactly what LibreOffice produced, so the
output at least looks consistent. Text becomes non-selectable.

Usage:
    python3 rasterize_pdf.py <in.pdf> <out.pdf> [dpi] [quality]
"""
import sys
import os

try:
    import fitz
except ImportError:
    import pymupdf as fitz


def log(msg):
    sys.stderr.write(f"[rasterize] {msg}\n")


def rasterize(input_path, output_path, dpi=200, quality=88):
    dpi = max(72, min(400, int(dpi)))
    quality = max(50, min(95, int(quality)))

    src = fitz.open(input_path)
    out = fitz.open()

    scale = dpi / 72.0
    mat = fitz.Matrix(scale, scale)

    total = len(src)
    for i, page in enumerate(src):
        pix = page.get_pixmap(matrix=mat, alpha=False, colorspace=fitz.csRGB)
        try:
            img_bytes = pix.tobytes(output='jpeg', jpg_quality=quality)
        except TypeError:
            img_bytes = pix.tobytes(output='jpeg')

        rect = page.rect
        new_page = out.new_page(width=rect.width, height=rect.height)
        new_page.insert_image(
            fitz.Rect(0, 0, rect.width, rect.height),
            stream=img_bytes,
        )

        if (i + 1) % 10 == 0 or i == total - 1:
            log(f"  rasterized {i + 1}/{total}")

    try:
        out.save(
            output_path,
            garbage=4,
            deflate=True,
            clean=True,
            deflate_images=True,
        )
    except TypeError:
        out.save(output_path, garbage=4, deflate=True, clean=True)
    finally:
        out.close()
        src.close()

    log(f"Saved: {output_path} ({os.path.getsize(output_path)} bytes)")
    return os.path.getsize(output_path)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.stderr.write("Usage: rasterize_pdf.py <in.pdf> <out.pdf> [dpi] [quality]\n")
        sys.exit(1)
    try:
        dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 200
        quality = int(sys.argv[4]) if len(sys.argv) > 4 else 88
        rasterize(sys.argv[1], sys.argv[2], dpi, quality)
        sys.exit(0)
    except Exception as exc:
        log(f"FATAL: {exc}")
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)