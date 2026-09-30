"""
Post-conversion integrity check for Word → PDF.

Emits a JSON result on a marker line so PyMuPDF's own stdout warnings
(which appear on damaged or non-standard PDFs) cannot corrupt the output.

Output format on stdout:
    __RESULT__{"valid":true,"pageCount":5,...}
"""
import sys
import json
import os

MARKER = '__RESULT__'


def log(msg):
    sys.stderr.write(f"[validate] {msg}\n")


def _emit(payload):
    """Write the result on a single marker-prefixed line."""
    sys.stdout.write(f"{MARKER}{json.dumps(payload)}\n")
    sys.stdout.flush()


def validate_pdf(pdf_path):
    # 1. Existence and minimum size
    if not os.path.exists(pdf_path):
        return {'valid': False, 'error': 'output file was not created'}

    size = os.path.getsize(pdf_path)
    if size < 1024:
        return {'valid': False, 'error': f'output too small ({size} bytes)'}

    # 2. Open with PyMuPDF
    try:
        try:
            import fitz
        except ImportError:
            import pymupdf as fitz
    except ImportError:
        log("PyMuPDF not available — skipping deep validation")
        return {
            'valid': True,
            'pageCount': 0,
            'sizeBytes': size,
            'textExtractable': False,
            'note': 'PyMuPDF not installed; validation limited to size check',
        }

    # Silence PyMuPDF's stdout warnings — they would otherwise pollute our
    # marker-based output on damaged or unusual PDFs.
    try:
        fitz.TOOLS.mupdf_display_errors(False)
    except Exception:
        try:
            fitz.TOOLS.reset_mupdf_warnings()
        except Exception:
            pass

    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        return {'valid': False, 'error': f'cannot open output: {e}'}

    try:
        pages = len(doc)
        if pages == 0:
            return {'valid': False, 'error': 'output has zero pages'}

        text_found = False
        for page in doc:
            try:
                if page.get_text().strip():
                    text_found = True
                    break
            except Exception:
                continue

        return {
            'valid': True,
            'pageCount': pages,
            'sizeBytes': size,
            'textExtractable': text_found,
        }
    finally:
        try:
            doc.close()
        except Exception:
            pass


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: validate_converted_pdf.py <output.pdf>\n")
        _emit({'valid': False, 'error': 'no input provided'})
        sys.exit(1)
    try:
        result = validate_pdf(sys.argv[1])
        _emit(result)
        sys.exit(0 if result.get('valid') else 1)
    except Exception as e:
        log(f"FATAL: {e}")
        _emit({'valid': False, 'error': str(e)})
        sys.exit(1)