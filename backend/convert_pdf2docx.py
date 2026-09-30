"""
PDF → DOCX conversion engine.

Primary engine: pdf2docx — performs computer-vision layout analysis to
detect paragraphs, headings, tables, images, alignment, and multi-column
structure. This is the same library that powers BentoPDF and many
commercial converters.

Fallback engine: the original block-based converter, preserved as
convert_pdf2docx_legacy.py. Used only when pdf2docx fails to produce
a usable DOCX.

Every successful output is passed through enhance_docx_output.py for
post-processing — explicit styles, cleaned trailing paragraphs, and
explicit alignment on every paragraph.

Emits a marker-prefixed JSON result on stdout:
    __RESULT__{"success":true,"engine":"pdf2docx","enhanced":true,...}
"""
import sys
import os
import json
import subprocess

MARKER = '__RESULT__'


def log(msg):
    sys.stderr.write(f"[pdf2docx] {msg}\n")


def _emit(payload):
    sys.stdout.write(f"{MARKER}{json.dumps(payload)}\n")
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Primary engine — pdf2docx
# ---------------------------------------------------------------------------
def _try_pdf2docx(input_path, output_path):
    try:
        from pdf2docx import Converter
    except ImportError:
        log("pdf2docx not installed")
        return None

    try:
        if os.path.exists(output_path):
            os.remove(output_path)
    except Exception:
        pass

    try:
        cv = Converter(input_path)
        try:
            # Default settings preserve layout best. Any tweaks here risk
            # regressing quality on documents pdf2docx already handles.
            cv.convert(output_path)
        finally:
            cv.close()
    except Exception as e:
        log(f"pdf2docx failed: {e}")
        return None

    if not os.path.exists(output_path):
        log("pdf2docx produced no output file")
        return None

    size = os.path.getsize(output_path)
    # An empty DOCX is roughly 1.5 KB. Anything smaller is a failure.
    if size < 2000:
        log(f"pdf2docx output too small ({size} bytes)")
        return None

    return {'sizeBytes': size}


# ---------------------------------------------------------------------------
# Fallback engine — legacy block-based converter
# ---------------------------------------------------------------------------
def _try_legacy(input_path, output_path):
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          'convert_pdf2docx_legacy.py')
    if not os.path.exists(script):
        log("legacy fallback script not found")
        return None

    try:
        if os.path.exists(output_path):
            os.remove(output_path)
    except Exception:
        pass

    try:
        r = subprocess.run(
            ['python3', script, input_path, output_path],
            capture_output=True, timeout=180,
        )
    except subprocess.TimeoutExpired:
        log("legacy engine timed out")
        return None
    except Exception as e:
        log(f"legacy engine exception: {e}")
        return None

    if r.returncode != 0:
        stderr = r.stderr.decode('utf-8', 'ignore')
        log(f"legacy engine failed: {stderr[:200]}")
        return None

    if not os.path.exists(output_path):
        return None

    return {'sizeBytes': os.path.getsize(output_path)}


# ---------------------------------------------------------------------------
# Post-processing
# ---------------------------------------------------------------------------
def _enhance(output_path):
    """
    Post-processing pipeline, in order:
      1. enhance_docx_output.py  — alignment, empty paragraphs, borders
      2. ooxml_sanitizer.py      — ECMA-376 element ordering and constraints
      3. LibreOffice round-trip  — final re-serialization through LO's
                                    OOXML writer for guaranteed Word
                                    compatibility without losing structure
    """
    import tempfile
    import shutil

    ok = True

    # ---- Stage 1: high-level cleanup ----
    script_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), 'enhance_docx_output.py'
    )
    if os.path.exists(script_path):
        try:
            r = subprocess.run(
                ['python3', script_path, output_path],
                capture_output=True, timeout=60,
            )
            if r.stderr:
                for line in r.stderr.decode('utf-8', 'ignore').split('\n'):
                    if line.strip():
                        log(line.strip())
        except Exception as e:
            log(f"enhance stage failed: {e}")
            ok = False

    # ---- Stage 2: schema sanitization ----
    script_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), 'ooxml_sanitizer.py'
    )
    if os.path.exists(script_path):
        try:
            r = subprocess.run(
                ['python3', script_path, output_path],
                capture_output=True, timeout=120,
            )
            if r.stderr:
                for line in r.stderr.decode('utf-8', 'ignore').split('\n'):
                    if line.strip():
                        log(line.strip())
        except Exception as e:
            log(f"sanitizer stage failed: {e}")
            ok = False

    # ---- Stage 3: LibreOffice round-trip ----
    # Ask LibreOffice to read the DOCX and write it back. Its OOXML writer
    # produces Word-compliant XML in the correct schema order while
    # preserving paragraphs, runs, tables, images, headers, footers, and
    # section properties. This is the standard "make it Word-openable"
    # step used by many production converters.
    try:
        temp_dir = tempfile.mkdtemp(prefix='lo_roundtrip_')
        user_profile = os.path.join(temp_dir, 'profile')

        # LibreOffice appends the original base name and changes the
        # extension, so we point --outdir at a fresh directory and pick
        # up the file that appears there.
        base = os.path.splitext(os.path.basename(output_path))[0]

        lo_args = [
            f'-env:UserInstallation=file://{user_profile}',
            '--headless',
            '--invisible',
            '--nodefault',
            '--nofirststartwizard',
            '--nolockcheck',
            '--nologo',
            '--norestore',
            '--convert-to',
            'docx:MS Word 2007 XML',
            '--outdir',
            temp_dir,
            output_path,
        ]

        try:
            r = subprocess.run(
                ['soffice'] + lo_args,
                capture_output=True,
                timeout=120,
            )
            if r.stderr:
                stderr = r.stderr.decode('utf-8', 'ignore')
                # Suppress LibreOffice's routine warnings
                for line in stderr.split('\n'):
                    line = line.strip()
                    if line and 'javaldx' not in line.lower():
                        log(f"soffice: {line}")
        except subprocess.TimeoutExpired:
            log("LibreOffice round-trip timed out — using pre-round-trip file")
        except Exception as e:
            log(f"LibreOffice round-trip failed: {e}")

        # Find the file LibreOffice wrote
        converted = os.path.join(temp_dir, base + '.docx')
        if os.path.exists(converted) and os.path.getsize(converted) > 2000:
            os.replace(converted, output_path)
            log(f"LibreOffice round-trip succeeded "
                f"({os.path.getsize(output_path)} bytes)")
        else:
            log("LibreOffice round-trip produced no usable file — "
                "keeping pre-round-trip version")

        shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception as e:
        log(f"round-trip cleanup failed: {e}")

    return ok


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------
def convert(input_path, output_path):
    result = {
        'success': False,
        'engine': None,
        'enhanced': False,
        'sizeBytes': 0,
    }

    log(f"Input: {os.path.getsize(input_path)} bytes")

    # 1. Primary
    primary = _try_pdf2docx(input_path, output_path)
    if primary:
        result['engine'] = 'pdf2docx'
        result['sizeBytes'] = primary['sizeBytes']
        log(f"pdf2docx success ({primary['sizeBytes']} bytes)")
    else:
        # 2. Fallback
        log("falling back to legacy engine")
        fallback = _try_legacy(input_path, output_path)
        if not fallback:
            log("both engines failed")
            return result
        result['engine'] = 'legacy'
        result['sizeBytes'] = fallback['sizeBytes']
        log(f"legacy success ({fallback['sizeBytes']} bytes)")

    # 3. Enhance
    result['enhanced'] = _enhance(output_path)

    result['success'] = True
    return result


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.stderr.write("Usage: convert_pdf2docx.py <in.pdf> <out.docx>\n")
        _emit({'success': False, 'error': 'no input path provided'})
        sys.exit(1)
    try:
        result = convert(sys.argv[1], sys.argv[2])
        _emit(result)
        sys.exit(0 if result['success'] else 1)
    except Exception as exc:
        log(f"FATAL: {exc}")
        import traceback
        traceback.print_exc(file=sys.stderr)
        _emit({'success': False, 'error': str(exc)})
        sys.exit(1)