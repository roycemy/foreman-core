"""String-aware brand tokenizer for inline JS. Replaces brand literals inside JS strings with
BRAND.name / BRAND.upper concatenations that are valid for the enclosing quote type."""
import re
REGEX_PREV = set('(,=:[!&|?{};+-*%<>~^')
KW_BEFORE_REGEX = ('return', 'typeof', 'case', 'in', 'of', 'void', 'delete', 'throw', 'new', 'else', 'do')

def segments(code):
    """Yield (kind, text) where kind in code|sq|dq|tpl|regex|comment. Template literals yield
    tpl chunks and nested code inside ${...}."""
    out = []; i = 0; n = len(code); buf = []; stack = ['code']; brace = [0]
    def flush(kind):
        if buf: out.append((kind, ''.join(buf))); buf.clear()
    def prev_sig():
        # previous significant char in emitted code
        for kind, t in reversed(out + ([('code', ''.join(buf))] if stack[-1] == 'code' else [])):
            if kind in ('comment',): continue
            s = t.rstrip()
            if s:
                return kind, s
        return 'code', ''
    while i < n:
        st = stack[-1]
        c = code[i]
        if st == 'code':
            if c in '\'"':
                flush('code'); q = c; j = i + 1
                while j < n and code[j] != q:
                    if code[j] == '\\': j += 2; continue
                    if code[j] == '\n': break
                    j += 1
                out.append(('sq' if q == "'" else 'dq', code[i:j + 1])); i = j + 1; continue
            if c == '`':
                flush('code'); stack.append('tpl'); buf.append(c); i += 1; continue
            if c == '/' and i + 1 < n and code[i + 1] == '/':
                flush('code'); j = code.find('\n', i); j = n if j < 0 else j
                out.append(('comment', code[i:j])); i = j; continue
            if c == '/' and i + 1 < n and code[i + 1] == '*':
                flush('code'); j = code.find('*/', i + 2); j = n if j < 0 else j + 2
                out.append(('comment', code[i:j])); i = j; continue
            if c == '/':
                kind, s = prev_sig()
                last = s[-1:] if s else ''
                isre = (not s) or (kind == 'code' and (last in REGEX_PREV or any(re.search(r'(^|[^\w$])' + k + r'$', s) for k in KW_BEFORE_REGEX)))
                if kind in ('sq', 'dq', 'regex'): isre = False
                if kind == 'tpl': isre = False
                if isre:
                    flush('code'); j = i + 1; cls = False
                    while j < n:
                        ch = code[j]
                        if ch == '\\': j += 2; continue
                        if ch == '[': cls = True
                        elif ch == ']': cls = False
                        elif ch == '/' and not cls: break
                        elif ch == '\n': break
                        j += 1
                    j += 1
                    while j < n and code[j].isalpha(): j += 1
                    out.append(('regex', code[i:j])); i = j; continue
            if c == '{' and len(stack) > 1: brace[-1] += 1
            if c == '}' and len(stack) > 1:
                if brace[-1] == 0:
                    flush('code'); stack.pop(); brace.pop(); buf.append('}'); i += 1; continue
                brace[-1] -= 1
            buf.append(c); i += 1; continue
        if st == 'tpl':
            if c == '\\': buf.append(code[i:i + 2]); i += 2; continue
            if c == '`':
                buf.append(c); flush('tpl'); stack.pop(); i += 1; continue
            if c == '$' and i + 1 < n and code[i + 1] == '{':
                buf.append('${'); flush('tpl'); stack.append('code'); brace.append(0); i += 2; continue
            buf.append(c); i += 1; continue
    flush(stack[-1] if stack[-1] != 'code' else 'code')
    return out

def brandify(code, terms):
    """terms: list of (literal, expr) e.g. ('Black Box','BRAND.name')."""
    res = []; count = 0
    for kind, t in segments(code):
        if kind in ('sq', 'dq', 'tpl'):
            for lit, expr in terms:
                if lit in t:
                    count += t.count(lit)
                    if kind == 'tpl': t = t.replace(lit, '${' + expr + '}')
                    elif kind == 'sq': t = t.replace(lit, "'+" + expr + "+'")
                    else: t = t.replace(lit, '"+' + expr + '+"')
        res.append(t)
    return ''.join(res), count

if __name__ == '__main__':
    tests = ["a='Black Box rocks';", 'b="x Black Box"', "c=`<h2>Black Box</h2>${f('Black Box')}`", "d=s.replace(/[&<>\"']/g,c=>({'&':'x'}[c]));e='Black Box'",
             "x=a/2;y='Black Box'", "t=`BLACK BOX ${a?`in Black Box`:''}`"]
    for t in tests:
        print(brandify(t, [('BLACK BOX', 'BRAND.upper'), ('Black Box', 'BRAND.name')]))
