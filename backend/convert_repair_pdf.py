"""
Multi-tier PDF repair engine.

Runs three independent repair strategies in order, returning the first
successful result. Each engine handles a different class of corruption:

  Tier 1 — Ghostscript pdfwrite
    Rebuilds the file structure while preserving page content, fonts,
    and images as-is. Handles broken xref tables, missing EOF markers,
    truncated downloads, and generator quirks.

  Tier 2 — PyMuPDF
    Auto-repairs on open. Effective when Ghostscript's strict parser
    refuses the input but the page content is still intact.

  Tier 3 — pikepdf (QPDF)
    Reconstructs the object table from whatever structure it can find.
    Same engine BentoPDF uses in the browser, but server-side.

Usage:
    python3 convert_repair_pdf.py <in.pdf> <out.pdf> <payload.json>

payload.json:
{
  "originalPages": 12,
  "strategy": "auto"
}
"""
import sys
import os
import json
import subprocess
import shutil
import tempfile


def log(msg):
    sys.stderr.write(f"[repair] {msg}\n")


def _count_pages_pymupdf(path):
    """Return page count or 0 if unreadable."""
    try:
        try:
            import fitz
        except ImportError:
            import pymupdf as fitz
        doc = fitz.open(path)
        count = len(doc)
        doc.close()
        return count
    except Exception:
        return 0


# =========================================================================
# Tier 1 — Ghostscript
# =========================================================================
def try_ghostscript(input_path, output_path):
    gs = shutil.which('gs')
    if not gs:
        log("Tier 1 (Ghostscript): not installed")
        return None

    # /prepress preserves quality — no downsampling, no recompression.
    # The only thing that changes is the file structure.
    args = [
        gs,
        '-dSAFER',
        '-dNOPAUSE',
        '-dBATCH',
        '-dQUIET',
        '-sDEVICE=pdfwrite',
        '-dPDFSETTINGS=/prepress',
        '-dPDFSTOPONERROR=false',   # log errors but continue
        '-dAutoRotatePages=/None',
        '-dCompatibilityLevel=1.7',
        '-dPreserveMarkedContent=true',
        '-dPreserveAnnots=true',
        '-dPreserveHalftoneInfo=false',
        '-dCompressFonts=true',
        '-dSubsetFonts=false',      # keep all glyphs — repair priority
        '-dEmbedAllFonts=true',
        '-dDetectDuplicateImages=true',
        f'-sOutputFile={output_path}',
        input_path,
    ]
    try:
        result = subprocess.run(
            args, capture_output=True, timeout=180,
        )
    except subprocess.TimeoutExpired:
        log("Tier 1 (Ghostscript): timed out")
        return None

    if result.returncode != 0:
        log(f"Tier 1 (Ghostscript): exit code {result.returncode}")
        return None

    if not os.path.exists(output_path) or os.path.getsize(output_path) < 200:
        log("Tier 1 (Ghostscript): empty output")
        return None

    pages = _count_pages_pymupdf(output_path)
    if pages == 0:
        log("Tier 1 (Ghostscript): output unreadable")
        return None

    log(f"Tier 1 (Ghostscript): SUCCESS — {pages} pages recovered")
    return pages


# =========================================================================
# Tier 2 — PyMuPDF
# =========================================================================
def try_pymupdf(input_path, output_path):
    try:
        try:
            import fitz
        except ImportError:
            import pymupdf as fitz
    except ImportError:
        log("Tier 2 (PyMuPDF): not installed")
        return None

    try:
        # PyMuPDF auto-repairs on open. Any syntax errors in the xref,
        # object table, or stream lengths are silently corrected during
        # parsing — the file that comes out of save() is clean.
        doc = fitz.open(input_path)
        if len(doc) == 0:
            log("Tier 2 (PyMuPDF): zero pages")
            doc.close()
            return None

        # garbage=4 removes orphaned objects, deflate=True recompresses
        # streams, clean=True rebuilds the xref table.
        try:
            doc.save(
                output_path,
                garbage=4,
                deflate=True,
                clean=True,
                deflate_images=True,
                deflate_fonts=True,
            )
        except TypeError:
            doc.save(output_path, garbage=4, deflate=True, clean=True)

        pages = len(doc)
        doc.close()

        if not os.path.exists(output_path) or os.path.getsize(output_path) < 200:
            log("Tier 2 (PyMuPDF): empty output")
            return None

        log(f"Tier 2 (PyMuPDF): SUCCESS — {pages} pages recovered")
        return pages
    except Exception as e:
        log(f"Tier 2 (PyMuPDF): {e}")
        return None


# =========================================================================
# Tier 3 — pikepdf (QPDF)
# =========================================================================
def try_pikepdf(input_path, output_path):
    try:
        import pikepdf
    except ImportError:
        log("Tier 3 (pikepdf): not installed")
        return None

    try:
        # pikepdf (QPDF) reconstructs the object table from whatever
        # structure it can find. It has loose parsing rules that often
        # succeed where stricter parsers fail.
        with pikepdf.open(input_path, allow_overwriting_input=False) as pdf:
            pdf.save(
                output_path,
                linearize=False,
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
                normalize_content=False,
            )
        pages = _count_pages_pymupdf(output_path)
        if pages == 0:
            log("Tier 3 (pikepdf): output unreadable")
            return None
        log(f"Tier 3 (pikepdf): SUCCESS — {pages} pages recovered")
        return pages
    except Exception as e:
        log(f"Tier 3 (pikepdf): {e}")
        return None


# =========================================================================
# Orchestrator
# =========================================================================
def repair_pdf(input_path, output_path, payload):
    original_pages = int(payload.get('originalPages', 0))
    log(f"Input: {os.path.getsize(input_path)} bytes, "
        f"{original_pages or '?'} original page(s)")

    # Try each tier in order; first success wins.
    tiers = [
        ('ghostscript', try_ghostscript),
        ('pymupdf', try_pymupdf),
        ('pikepdf', try_pikepdf),
    ]

    result = None
    engine_used = None

    for name, fn in tiers:
        # Clean any partial output from a previous failed tier
        try:
            if os.path.exists(output_path):
                os.remove(output_path)
        except Exception:
            pass

        pages = fn(input_path, output_path)
        if pages is not None and pages > 0:
            result = pages
            engine_used = name
            break

    if result is None:
        # No tier succeeded — write a machine-readable failure marker
        log("All tiers failed")
        sys.stdout.write(json.dumps({
            'success': False,
            'engine': None,
            'pages': 0,
            'originalPages': original_pages,
        }))
        sys.exit(2)

    sys.stdout.write(json.dumps({
        'success': True,
        'engine': engine_used,
        'pages': result,
        'originalPages': original_pages,
    }))
    return 0


if __name__ == '__main__':
    if len(sys.argv) < 4:
        log("Usage: convert_repair_pdf.py <in.pdf> <out.pdf> <payload.json>")
        sys.exit(1)
    try:
        with open(sys.argv[3], 'r', encoding='utf-8') as f:
            payload = json.load(f)
        sys.exit(repair_pdf(sys.argv[1], sys.argv[2], payload))
    except Exception as exc:
        log(f"FATAL: {exc}")
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)