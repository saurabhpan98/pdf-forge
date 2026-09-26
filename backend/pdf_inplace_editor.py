"""
pdf_inplace_editor.py

Professional in-place PDF text editing via direct content-stream manipulation.

Key idea: never paint anything. Find the exact Tj / TJ / ' / " operators that
produced the selected text, and rewrite their operands with the new text.
Backgrounds (solid, gradient, image, table stripes) are preserved because
they are never touched.

Falls back to the caller-supplied paint routine when:
  • the target text can't be located in the content stream
  • the original font cannot encode the new characters
  • the content stream is a scanned image (no text layer)

Public API:
    try_inplace_edits(page, doc, edits, font_cache) -> (handled_count, remaining_edits)

Author: PDF Forge
"""

import re
import math
try:
    import fitz  # PyMuPDF (legacy import name, still supported)
except ImportError:
    try:
        import pymupdf as fitz  # PyMuPDF 1.24+ alias
    except ImportError as exc:
        import sys
        sys.stderr.write(
            "\n[edit] FATAL: PyMuPDF is not installed in this Python interpreter.\n"
            f"[edit] Interpreter: {sys.executable}\n"
            "[edit] Fix with:  python3 -m pip install --break-system-packages PyMuPDF\n"
            "[edit] If a stray 'fitz' package is installed, remove it with:\n"
            "[edit]   python3 -m pip uninstall -y fitz\n\n"
        )
        raise exc


def log(msg):
    import sys
    sys.stderr.write(f"[inplace] {msg}\n")


# =========================================================================
# 1. Tokenizer
# =========================================================================

_WS = b'\x00\t\n\x0c\r '
_DELIM = b'()<>[]{}/%'


def _decode_literal(raw):
    """raw includes leading '(' and trailing ')'."""
    inner = raw[1:-1]
    out = bytearray()
    i, n = 0, len(inner)
    while i < n:
        c = inner[i]
        if c == 0x5C:  # backslash
            i += 1
            if i >= n:
                break
            e = inner[i]
            if e == 0x6E:   out.append(0x0A)
            elif e == 0x72: out.append(0x0D)
            elif e == 0x74: out.append(0x09)
            elif e == 0x62: out.append(0x08)
            elif e == 0x66: out.append(0x0C)
            elif e == 0x28: out.append(0x28)
            elif e == 0x29: out.append(0x29)
            elif e == 0x5C: out.append(0x5C)
            elif 0x30 <= e <= 0x37:
                oct_s = chr(e)
                j = 0
                while j < 2 and i + 1 < n and 0x30 <= inner[i + 1] <= 0x37:
                    i += 1
                    oct_s += chr(inner[i])
                    j += 1
                out.append(int(oct_s, 8) & 0xFF)
            elif e == 0x0A:
                pass  # line continuation
            else:
                out.append(e)
            i += 1
        else:
            out.append(c)
            i += 1
    return bytes(out)


def _decode_hex(raw):
    """raw includes leading '<' and trailing '>'."""
    inner = raw[1:-1]
    h = bytes(c for c in inner if c not in _WS).decode('latin-1')
    if len(h) % 2:
        h += '0'
    try:
        return bytes.fromhex(h)
    except ValueError:
        return b''


def _decode_name(raw):
    """raw is without the leading '/'."""
    out = bytearray()
    i, n = 0, len(raw)
    while i < n:
        c = raw[i]
        if c == 0x23 and i + 2 < n:
            try:
                out.append(int(raw[i + 1:i + 3], 16))
                i += 3
                continue
            except ValueError:
                pass
        out.append(c)
        i += 1
    return out.decode('latin-1', 'ignore')


def _tokenize_content(data):
    """Yield (kind, value) tuples. Kinds: num, name, str, op, bool, null,
    arr_start, arr_end, dict_start, dict_end."""
    i, n = 0, len(data)
    while i < n:
        c = data[i]
        if c in _WS:
            i += 1
            continue
        if c == 0x25:  # %
            while i < n and data[i] not in b'\r\n':
                i += 1
            continue
        if c == 0x28:  # (
            start = i
            i += 1
            depth = 1
            while i < n and depth:
                d = data[i]
                if d == 0x5C:
                    i += 2
                    continue
                if d == 0x28:
                    depth += 1
                elif d == 0x29:
                    depth -= 1
                i += 1
            yield ('str', _decode_literal(data[start:i]))
            continue
        if c == 0x3C:  # <
            if i + 1 < n and data[i + 1] == 0x3C:
                yield ('dict_start', None)
                i += 2
                continue
            start = i
            i += 1
            while i < n and data[i] != 0x3E:
                i += 1
            i += 1
            yield ('str', _decode_hex(data[start:i]))
            continue
        if c == 0x3E:  # >
            if i + 1 < n and data[i + 1] == 0x3E:
                yield ('dict_end', None)
                i += 2
                continue
            i += 1
            continue
        if c == 0x5B:  # [
            yield ('arr_start', None)
            i += 1
            continue
        if c == 0x5D:  # ]
            yield ('arr_end', None)
            i += 1
            continue
        if c == 0x2F:  # /
            start = i
            i += 1
            while i < n and data[i] not in _WS and data[i] not in _DELIM:
                i += 1
            yield ('name', _decode_name(data[start + 1:i]))
            continue
        if c in b'+-.0123456789':
            start = i
            i += 1
            while i < n and data[i] in b'+-.0123456789eE':
                i += 1
            raw = data[start:i]
            try:
                txt = raw.decode('ascii')
                if '.' in txt or 'e' in txt.lower():
                    yield ('num', float(txt))
                else:
                    yield ('num', int(txt))
            except (ValueError, UnicodeDecodeError):
                yield ('op', raw.decode('latin-1', 'ignore'))
            continue
        # Operator / boolean / null
        start = i
        while i < n and data[i] not in _WS and data[i] not in _DELIM:
            i += 1
        if i == start:
            i += 1
            continue
        word = data[start:i].decode('latin-1', 'ignore')
        if word == 'true':
            yield ('bool', True)
        elif word == 'false':
            yield ('bool', False)
        elif word == 'null':
            yield ('null', None)
        else:
            yield ('op', word)


# =========================================================================
# 2. Group tokens into operations
# =========================================================================

def _group_ops(tokens):
    """
    Return a list of (operands, op_name) tuples. Operands are (kind, value)
    tuples; nested arrays/dicts appear as ('array', [...]) / ('dict', [...]).
    """
    ops = []
    stack = [[]]
    for kind, value in tokens:
        if kind == 'arr_start':
            stack.append([])
        elif kind == 'arr_end':
            if len(stack) > 1:
                arr = stack.pop()
                stack[-1].append(('array', arr))
        elif kind == 'dict_start':
            stack.append([])
        elif kind == 'dict_end':
            if len(stack) > 1:
                d = stack.pop()
                stack[-1].append(('dict', d))
        elif kind == 'op' and len(stack) == 1:
            ops.append((list(stack[0]), value))
            stack[0] = []
        else:
            if stack:
                stack[-1].append((kind, value))
    return ops


# =========================================================================
# 3. Serialization (ops → bytes)
# =========================================================================

def _format_num(n):
    if isinstance(n, int):
        return str(n).encode('ascii')
    s = f'{n:.6f}'.rstrip('0').rstrip('.')
    if not s or s == '-0':
        s = '0'
    return s.encode('ascii')


def _encode_name(name):
    out = ['/']
    for ch in name:
        o = ord(ch)
        if ch in ' \t\n\r\f()<>[]{}/%#' or o < 0x21 or o > 0x7E:
            out.append(f'#{o:02X}')
        else:
            out.append(ch)
    return ''.join(out).encode('latin-1')


def _encode_literal(data):
    out = bytearray(b'(')
    for b in data:
        if b == 0x28: out.extend(b'\\(')
        elif b == 0x29: out.extend(b'\\)')
        elif b == 0x5C: out.extend(b'\\\\')
        elif b == 0x0A: out.extend(b'\\n')
        elif b == 0x0D: out.extend(b'\\r')
        elif b == 0x09: out.extend(b'\\t')
        elif b == 0x08: out.extend(b'\\b')
        elif b == 0x0C: out.extend(b'\\f')
        elif b < 0x20 or b > 0x7E:
            out.extend(b'\\%03o' % b)
        else:
            out.append(b)
    out.append(0x29)
    return bytes(out)


def _serialize_operand(op):
    kind, value = op
    if kind == 'num':
        return _format_num(value)
    if kind == 'name':
        return _encode_name(value)
    if kind == 'str':
        return _encode_literal(value)
    if kind == 'bool':
        return b'true' if value else b'false'
    if kind == 'null':
        return b'null'
    if kind == 'array':
        parts = [b'[']
        for item in value:
            parts.append(_serialize_operand(item))
            parts.append(b' ')
        parts.append(b']')
        return b''.join(parts)
    if kind == 'dict':
        parts = [b'<<']
        for item in value:
            parts.append(_serialize_operand(item))
            parts.append(b' ')
        parts.append(b'>>')
        return b''.join(parts)
    return b''


def _serialize_op(op):
    operands, name = op
    parts = []
    for o in operands:
        parts.append(_serialize_operand(o))
        parts.append(b' ')
    parts.append(name.encode('latin-1'))
    parts.append(b'\n')
    return b''.join(parts)


def _serialize_ops(ops):
    return b''.join(_serialize_op(op) for op in ops)


# =========================================================================
# 4. Matrix helpers  (PDF 6-tuple [a b c d e f])
# =========================================================================

def _mul(m1, m2):
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return [
        a1 * a2 + b1 * c2,
        a1 * b2 + b1 * d2,
        c1 * a2 + d1 * c2,
        c1 * b2 + d1 * d2,
        e1 * a2 + f1 * c2 + e2,
        e1 * b2 + f1 * d2 + f2,
    ]


def _apply(m, x, y):
    a, b, c, d, e, f = m
    return (a * x + c * y + e, b * x + d * y + f)


# =========================================================================
# 5. ToUnicode CMap reverse encoding
# =========================================================================

_RE_BFCHAR_BLOCK = re.compile(rb'beginbfchar(.*?)endbfchar', re.DOTALL)
_RE_BFRANGE_BLOCK = re.compile(rb'beginbfrange(.*?)endbfrange', re.DOTALL)
_RE_BFCHAR_PAIR = re.compile(rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>')
_RE_BFRANGE_TRIPLE = re.compile(rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>')
_RE_BFRANGE_ARR = re.compile(rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[(.*?)\]', re.DOTALL)
_RE_HEX_IN_ARR = re.compile(rb'<([0-9A-Fa-f]+)>')


def _parse_tounicode(cmap_bytes):
    """Return {code_int: unicode_str}."""
    result = {}

    for m in _RE_BFCHAR_BLOCK.finditer(cmap_bytes):
        body = m.group(1)
        for pair in _RE_BFCHAR_PAIR.finditer(body):
            src = int(pair.group(1), 16)
            dst_hex = pair.group(2).decode('ascii')
            try:
                dst = ''.join(
                    chr(int(dst_hex[i:i + 4], 16))
                    for i in range(0, len(dst_hex), 4)
                )
            except ValueError:
                continue
            result[src] = dst

    for m in _RE_BFRANGE_BLOCK.finditer(cmap_bytes):
        body = m.group(1)
        # Pattern 1: <lo> <hi> <dst_start>
        for t in _RE_BFRANGE_TRIPLE.finditer(body):
            try:
                lo = int(t.group(1), 16)
                hi = int(t.group(2), 16)
                dst0 = int(t.group(3), 16)
            except ValueError:
                continue
            for i in range(hi - lo + 1):
                result[lo + i] = chr(dst0 + i)
        # Pattern 2: <lo> <hi> [ <d1> <d2> ... ]
        for m2 in _RE_BFRANGE_ARR.finditer(body):
            try:
                lo = int(m2.group(1), 16)
            except ValueError:
                continue
            for i, hex_ in enumerate(_RE_HEX_IN_ARR.finditer(m2.group(3))):
                try:
                    result[lo + i] = chr(int(hex_.group(1), 16))
                except ValueError:
                    pass
    return result


def _get_tounicode_for_font(doc, font_xref):
    """Fetch and parse the ToUnicode CMap for a font xref. Returns dict or {}."""
    try:
        kind, value = doc.xref_get_key(font_xref, 'ToUnicode')
    except Exception:
        return {}
    if kind != 'xref':
        return {}
    try:
        tu_xref = int(str(value).split()[0])
    except (ValueError, IndexError):
        return {}
    try:
        cmap_bytes = doc.xref_stream(tu_xref)
    except Exception:
        return {}
    if not cmap_bytes:
        return {}
    return _parse_tounicode(cmap_bytes)


_WINANSI_ASCII_REVERSE = {chr(c): c for c in range(32, 127)}
# WinAnsiEncoding extra characters (0x80-0x9F range and 0xA0-0xFF)
_WINANSI_EXTRA = {
    '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86,
    '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C,
    'Ž': 0x8E, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
    '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B,
    'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F,
}
_WINANSI_REVERSE = dict(_WINANSI_ASCII_REVERSE)
_WINANSI_REVERSE.update(_WINANSI_EXTRA)
# Latin-1 supplement 0xA0-0xFF maps 1:1 to Unicode codepoints of the same value.
for _i in range(0xA0, 0x100):
    _WINANSI_REVERSE.setdefault(chr(_i), _i)


def _build_reverse_encoding(cmap):
    """Return {unicode_char: code_int} for single-character mappings only."""
    rev = {}
    for code, uni in cmap.items():
        if len(uni) == 1:
            rev.setdefault(uni, code)
    return rev


def _encode_text_with_reverse(text, reverse, code_width):
    """
    Encode text to bytes using the reverse map. Returns None if any char
    can't be encoded. code_width is 1 or 2.
    """
    out = bytearray()
    for ch in text:
        code = reverse.get(ch)
        if code is None:
            return None
        if code_width == 2:
            out.extend(code.to_bytes(2, 'big'))
        else:
            if code > 255:
                return None
            out.append(code)
    return bytes(out)


# =========================================================================
# 6. Text-run scanner
# =========================================================================

class _Run:
    __slots__ = (
        'op_index', 'op_name', 'font_name', 'font_size',
        'char_spacing', 'word_spacing', 'h_scale', 'rise',
        'tm', 'user_x', 'user_y', 'width_text_space',
        'strings', 'operands', 'is_array',
        'char_width_estimate',
    )


def _estimate_char_advance_em(code_byte):
    """Rough per-character advance in em units (0..1). Used only to estimate
    run extent for overlap matching; not used for encoding."""
    if code_byte == 32:  # space
        return 0.25
    if code_byte in (0x28, 0x29, 0x2E, 0x2C, 0x27, 0x22, 0x21, 0x69, 0x6A, 0x6C):
        return 0.28
    if code_byte in (0x6D, 0x77, 0x4D, 0x57):
        return 0.83
    if 0x30 <= code_byte <= 0x39:
        return 0.5
    if 0x41 <= code_byte <= 0x5A:
        return 0.66
    if 0x61 <= code_byte <= 0x7A:
        return 0.5
    return 0.5


def _estimate_run_width(strings, font_size, char_spacing, word_spacing, h_scale):
    """Text-space extent of a run (for overlap detection only)."""
    total = 0.0
    for kind, value in strings:
        if kind == 'str':
            for b in value:
                adv = _estimate_char_advance_em(b) * font_size
                total += adv + char_spacing
                if b == 32:
                    total += word_spacing
        elif kind == 'num':
            # TJ adjustment: -value/1000 * font_size
            total -= value / 1000.0 * font_size
    total *= h_scale
    return total


def _scan_text_runs(ops, page_height):
    """
    Walk the ops, tracking graphics + text state, returning a list of _Run
    objects. Positions are top-down (Y increases downward), matching
    PyMuPDF page coordinates and the frontend bbox format.
    """
    runs = []

    # Graphics state
    ctm = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
    ctm_stack = []

    # Text state
    ts_font = None
    ts_size = 0.0
    ts_char_sp = 0.0
    ts_word_sp = 0.0
    ts_h_scale = 1.0
    ts_leading = 0.0
    ts_rise = 0.0

    tm = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
    tlm = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]

    for op_idx, op in enumerate(ops):
        operands, name = op

        if name == 'q':
            ctm_stack.append(list(ctm))
        elif name == 'Q':
            if ctm_stack:
                ctm = ctm_stack.pop()
        elif name == 'cm':
            nums = [o[1] for o in operands[-6:] if o[0] == 'num']
            if len(nums) == 6:
                ctm = _mul([float(n) for n in nums], ctm)
        elif name == 'BT':
            tm = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
            tlm = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
        elif name == 'Tf':
            if len(operands) >= 2:
                f_tok, s_tok = operands[-2], operands[-1]
                if f_tok[0] == 'name' and s_tok[0] == 'num':
                    ts_font = f_tok[1]
                    ts_size = float(s_tok[1])
        elif name == 'Tc':
            if operands and operands[-1][0] == 'num':
                ts_char_sp = float(operands[-1][1])
        elif name == 'Tw':
            if operands and operands[-1][0] == 'num':
                ts_word_sp = float(operands[-1][1])
        elif name == 'Tz':
            if operands and operands[-1][0] == 'num':
                ts_h_scale = float(operands[-1][1]) / 100.0
        elif name == 'TL':
            if operands and operands[-1][0] == 'num':
                ts_leading = float(operands[-1][1])
        elif name == 'Ts':
            if operands and operands[-1][0] == 'num':
                ts_rise = float(operands[-1][1])
        elif name == 'Tm':
            nums = [o[1] for o in operands[-6:] if o[0] == 'num']
            if len(nums) == 6:
                tm = [float(n) for n in nums]
                tlm = list(tm)
        elif name == 'Td':
            nums = [o[1] for o in operands[-2:] if o[0] == 'num']
            if len(nums) == 2:
                tx, ty = float(nums[0]), float(nums[1])
                tlm = _mul([1.0, 0.0, 0.0, 1.0, tx, ty], tlm)
                tm = list(tlm)
        elif name == 'TD':
            nums = [o[1] for o in operands[-2:] if o[0] == 'num']
            if len(nums) == 2:
                tx, ty = float(nums[0]), float(nums[1])
                ts_leading = -ty
                tlm = _mul([1.0, 0.0, 0.0, 1.0, tx, ty], tlm)
                tm = list(tlm)
        elif name == 'T*':
            tlm = _mul([1.0, 0.0, 0.0, 1.0, 0.0, -ts_leading], tlm)
            tm = list(tlm)
        elif name in ('Tj', 'TJ', "'", '"'):
            str_operand = None
            if name == "'":
                tlm = _mul([1.0, 0.0, 0.0, 1.0, 0.0, -ts_leading], tlm)
                tm = list(tlm)
                str_operand = operands[-1] if operands else None
            elif name == '"':
                if len(operands) >= 3:
                    aw_tok, ac_tok, str_tok = operands[-3], operands[-2], operands[-1]
                    if aw_tok[0] == 'num':
                        ts_word_sp = float(aw_tok[1])
                    if ac_tok[0] == 'num':
                        ts_char_sp = float(ac_tok[1])
                    tlm = _mul([1.0, 0.0, 0.0, 1.0, 0.0, -ts_leading], tlm)
                    tm = list(tlm)
                    str_operand = str_tok
                else:
                    continue
            elif name == 'Tj':
                str_operand = operands[-1] if operands else None
            elif name == 'TJ':
                str_operand = operands[-1] if operands else None

            if str_operand is None:
                continue

            strings = []
            is_array = False
            if str_operand[0] == 'str':
                strings.append(str_operand)
            elif str_operand[0] == 'array':
                is_array = True
                for item in str_operand[1]:
                    if item[0] in ('str', 'num'):
                        strings.append(item)

            if not strings:
                continue

            # Concatenated text (for matching).
            concatenated = b''
            for k, v in strings:
                if k == 'str':
                    concatenated += v

            # User-space position (assume CTM identity; PDF user space is
            # bottom-up, so flip Y to top-down).
            user_x = tm[4]
            user_y_bottomup = tm[5]
            user_y_topdown = page_height - user_y_bottomup

            # Text-space width (approximation for overlap tests).
            width_text = _estimate_run_width(
                strings, ts_size, ts_char_sp, ts_word_sp, ts_h_scale
            )

            r = _Run()
            r.op_index = op_idx
            r.op_name = name
            r.font_name = ts_font
            r.font_size = ts_size
            r.char_spacing = ts_char_sp
            r.word_spacing = ts_word_sp
            r.h_scale = ts_h_scale
            r.rise = ts_rise
            r.tm = list(tm)
            r.user_x = user_x
            r.user_y = user_y_topdown
            r.width_text_space = width_text
            r.strings = strings
            r.operands = operands
            r.is_array = is_array
            r.char_width_estimate = width_text
            runs.append(r)

            # Advance the text matrix.
            tm = _mul([1.0, 0.0, 0.0, 1.0, width_text, 0.0], tm)

    return runs


# =========================================================================
# 7. Matching
# =========================================================================

def _match_runs_for_bbox(runs, bbox, slack=3.0):
    """Return runs whose origin lies within bbox (expanded by slack)."""
    if not bbox or len(bbox) != 4:
        return []
    x0, y0, x1, y1 = [float(v) for v in bbox]
    if x1 < x0: x0, x1 = x1, x0
    if y1 < y0: y0, y1 = y1, y0

    x0 -= slack
    y0 -= slack
    x1 += slack
    y1 += slack

    matched = []
    for r in runs:
        if x0 <= r.user_x <= x1 and y0 <= r.user_y <= y1:
            matched.append(r)
    return matched


# =========================================================================
# 8. Font resolution: resource name → font object + reverse encoding
# =========================================================================

def _resolve_font(doc, page, font_name, font_cache):
    """
    Return (font_obj, reverse_map, code_width) for the given resource name,
    or (None, None, 0) on failure.
    """
    if not font_name:
        return (None, None, 0)

    fonts = page.get_fonts(full=True)
    target_xref = None
    is_type0 = False
    for f in fonts:
        try:
            xref = f[0]
            subtype = (f[2] or '')
            basefont = (f[3] or '')
            name = (f[4] or '')
        except Exception:
            continue
        if name == font_name:
            target_xref = xref
            if 'type0' in subtype.lower():
                is_type0 = True
            break

    if target_xref is None:
        return (None, None, 0)

    font_obj = None
    # Try cache first (populated by pre_extract_page_fonts).
    if font_cache:
        for _k, entry in font_cache.items():
            if entry.get('xref') == target_xref:
                font_obj = entry.get('font_obj')
                break
    # If not cached, extract now.
    if font_obj is None:
        try:
            result = doc.extract_font(target_xref)
            if len(result) >= 4 and result[3]:
                font_obj = fitz.Font(fontbuffer=result[3])
        except Exception:
            font_obj = None

    # Reverse encoding via ToUnicode CMap.
    cmap = _get_tounicode_for_font(doc, target_xref)
    reverse = _build_reverse_encoding(cmap) if cmap else {}
    if not reverse:
        # Fall back to WinAnsiEncoding (single-byte codes).
        reverse = dict(_WINANSI_REVERSE)

    code_width = 2 if is_type0 else 1
    return (font_obj, reverse, code_width)


# =========================================================================
# 9. Rewriting the content stream
# =========================================================================

def _rebuild_tj_operand(new_bytes, is_array):
    """Return a new operand list for the Tj/TJ operator."""
    if is_array:
        return [('array', [('str', new_bytes)])]
    return [('str', new_bytes)]


def _apply_replacements_to_ops(ops, replacements):
    """
    replacements: dict {op_index: new_operand_list}.
    Returns a new ops list.
    """
    new_ops = []
    for i, op in enumerate(ops):
        if i in replacements:
            new_ops.append((replacements[i], op[1]))
        else:
            new_ops.append(op)
    return new_ops


# =========================================================================
# 10. Public entry: try_inplace_edits
# =========================================================================

def try_inplace_edits(page, doc, edits, font_cache):
    """
    Attempt to apply as many edits as possible via content-stream rewriting.

    Returns (handled_count, remaining_edits) where remaining_edits is the
    list of edits the caller must handle via paint-and-redraw.
    """
    if not edits:
        return (0, [])

    # Read the page's raw content stream(s).
    try:
        xrefs = list(page.get_contents())
    except Exception:
        return (0, list(edits))
    if not xrefs:
        return (0, list(edits))

    try:
        raw = b''.join((doc.xref_stream(x) or b'') for x in xrefs)
    except Exception:
        return (0, list(edits))

    # Parse.
    try:
        tokens = list(_tokenize_content(raw))
        ops = _group_ops(tokens)
    except Exception as e:
        log(f"parse failed: {e}")
        return (0, list(edits))

    page_height = page.rect.height

    # Scan text runs.
    try:
        runs = _scan_text_runs(ops, page_height)
    except Exception as e:
        log(f"scan failed: {e}")
        return (0, list(edits))

    # Group edits by proximity (each edit finds its own set of runs).
    replacements = {}  # {op_index: [operands]}
    handled = []
    remaining = []

    # Sort edits left-to-right, top-to-bottom so overlapping edits behave
    # predictably.
    sorted_edits = sorted(
        edits,
        key=lambda e: (
            int(e.get('page', 1)),
            float((e.get('bbox') or [0, 0, 0, 0])[1]),
            float((e.get('bbox') or [0, 0, 0, 0])[0]),
        ),
    )

    for e in sorted_edits:
        bbox = e.get('bbox')
        if not bbox or len(bbox) != 4:
            remaining.append(e)
            continue

        new_text = e.get('newText', '')
        if new_text is None:
            remaining.append(e)
            continue
        new_text = str(new_text)

        # Find matching runs.
        matched = _match_runs_for_bbox(runs, bbox)
        # Only consider runs whose operator has not been claimed yet.
        matched = [r for r in matched if r.op_index not in replacements]

        if not matched:
            remaining.append(e)
            continue

        # The first run gets the new text; the rest are blanked.
        first = matched[0]
        r_font, reverse, code_width = _resolve_font(
            doc, page, first.font_name, font_cache
        )

        encoded = None
        if new_text != '' and reverse:
            encoded = _encode_text_with_reverse(new_text, reverse, code_width)

        if new_text == '':
            # Pure deletion: blank the operand(s).
            blank = b'' if code_width == 1 else b''
            for r in matched:
                replacements[r.op_index] = _rebuild_tj_operand(blank, r.is_array)
            handled.append(e)
            continue

        if encoded is None:
            # Font can't encode the new text — let the fallback handle it.
            remaining.append(e)
            continue

        # Rewrite the first operand with the new text; blank the rest.
        replacements[first.op_index] = _rebuild_tj_operand(encoded, first.is_array)
        for r in matched[1:]:
            blank = b''
            replacements[r.op_index] = _rebuild_tj_operand(blank, r.is_array)
        handled.append(e)

    if not replacements:
        return (0, list(edits))

    # Serialize and write back.
    try:
        new_ops = _apply_replacements_to_ops(ops, replacements)
        new_bytes = _serialize_ops(new_ops)
    except Exception as e:
        log(f"serialize failed: {e}")
        return (0, list(edits))

    try:
        if len(xrefs) == 1:
            doc.update_stream(xrefs[0], new_bytes)
        else:
            new_xref = doc.get_new_xref()
            doc.update_object(new_xref, '<<>>')
            doc.update_stream(new_xref, new_bytes)
            page.set_contents(new_xref)
    except Exception as e:
        log(f"write failed: {e}")
        return (0, list(edits))

    log(
        f"page {page.number + 1}: handled {len(handled)}/{len(edits)} "
        f"in-place, {len(remaining)} to fallback"
    )
    return (len(handled), remaining)