"""
Pre-conversion complexity detector for Word → PDF.

Scans the DOCX zip for elements LibreOffice renders with reduced fidelity:
native Word charts, SmartArt diagrams, embedded OLE objects, and drawing
canvases with nested shapes.

Does NOT modify the file. Only reports what it found.

Output format on stdout:
    __RESULT__{"hasCharts":true,"chartCount":3,...}
"""
import sys
import json
import zipfile

MARKER = '__RESULT__'


def log(msg):
    sys.stderr.write(f"[complexity] {msg}\n")


def _emit(payload):
    sys.stdout.write(f"{MARKER}{json.dumps(payload)}\n")
    sys.stdout.flush()


def detect(docx_path):
    result = {
        'hasCharts': False,
        'hasDiagrams': False,
        'hasOleObjects': False,
        'hasDrawingCanvas': False,
        'chartCount': 0,
        'diagramCount': 0,
        'oleCount': 0,
        'warnings': [],
    }

    try:
        with zipfile.ZipFile(docx_path) as zf:
            names = zf.namelist()
    except Exception as e:
        result['error'] = f'cannot open docx: {e}'
        return result

    charts = [n for n in names if n.startswith('word/charts/chart') and n.endswith('.xml')]
    diagrams = [n for n in names if n.startswith('word/diagrams/') and n.endswith('.xml')]
    ole = [n for n in names if n.startswith('word/embeddings/')]

    result['chartCount'] = len(charts)
    result['diagramCount'] = len(diagrams)
    result['oleCount'] = len(ole)
    result['hasCharts'] = len(charts) > 0
    result['hasDiagrams'] = len(diagrams) > 0
    result['hasOleObjects'] = len(ole) > 0

    # Drawing canvas — inspect document.xml
    try:
        with zipfile.ZipFile(docx_path) as zf:
            doc_xml = zf.read('word/document.xml').decode('utf-8', errors='ignore')
        lower = doc_xml.lower()
        if '<wpc:canvas' in lower or '<wpg:wgp' in lower or '<wp:canvas' in lower:
            result['hasDrawingCanvas'] = True
    except Exception:
        pass

    if result['hasCharts']:
        n = result['chartCount']
        result['warnings'].append(
            f"{n} chart{'s' if n != 1 else ''} detected. Custom colors, "
            "gradients, 3D effects, and embedded data tables may render "
            "differently from Word."
        )
    if result['hasDiagrams']:
        n = result['diagramCount']
        result['warnings'].append(
            f"{n} SmartArt diagram{'s' if n != 1 else ''} detected. "
            "SmartArt layouts cannot be reproduced exactly — a cached "
            "image may be used instead."
        )
    if result['hasOleObjects']:
        n = result['oleCount']
        result['warnings'].append(
            f"{n} embedded object{'s' if n != 1 else ''} detected. "
            "Only the cached preview image will appear in the output."
        )
    if result['hasDrawingCanvas']:
        result['warnings'].append(
            "Drawing canvas with nested shapes detected. Some nested "
            "elements may not render."
        )

    return result


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: detect_docx_complexity.py <input.docx>\n")
        _emit({
            'hasCharts': False, 'hasDiagrams': False, 'hasOleObjects': False,
            'hasDrawingCanvas': False, 'warnings': [],
            'error': 'no input path provided',
        })
        sys.exit(1)
    try:
        _emit(detect(sys.argv[1]))
        sys.exit(0)
    except Exception as e:
        log(f"FATAL: {e}")
        _emit({
            'hasCharts': False, 'hasDiagrams': False, 'hasOleObjects': False,
            'hasDrawingCanvas': False, 'warnings': [], 'error': str(e),
        })
        sys.exit(0)