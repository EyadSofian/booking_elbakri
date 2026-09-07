#!/usr/bin/env python3
"""
Generates the API reference from the controller sources.

Reading the decorators rather than hand-writing the reference means the document
cannot drift from the code: a route added without a permission guard, or a
permission renamed, shows up on the next run.
"""
import re, os, json, sys

ROOT = 'apps/api/src'
HTTP = ('Get', 'Post', 'Patch', 'Put', 'Delete')
OUT = '/private/tmp/claude-501/-Users-eyad-booking-system/092fb28b-f742-4f08-9fcf-be09133adc7d/scratchpad/routes.json'

# permission constant -> wire value, e.g. TRIPS_READ -> trips.read
_perm_src = open('packages/shared/src/domain/permissions.ts', encoding='utf-8').read()
_perm_block = _perm_src.split('export const PERMISSIONS')[1].split('} as const;')[0]
# Dotted values only: API_KEY_SCOPES uses colons and must not shadow these.
PERM = dict(re.findall(r"  ([A-Z_]+): '([a-z_]+(?:\.[a-z_]+)+)',", _perm_block))

def controllers():
    for dirpath, _, files in os.walk(ROOT):
        for f in sorted(files):
            if f.endswith('.controller.ts'):
                yield os.path.join(dirpath, f)

def parse(path):
    src = open(path, encoding='utf-8').read()
    m = re.search(r"@Controller\(\s*(?:'([^']*)'|\{[^}]*?path:\s*'([^']*)')", src, re.S)
    base = ((m.group(1) or m.group(2) or '') if m else '')
    tag = re.search(r"@ApiTags\('([^']+)'\)", src)

    routes = []
    # The HTTP decorator comes first; guards and docs follow it, then the handler.
    for match in re.finditer(
        r'@(' + '|'.join(HTTP) + r")\(\s*(?:'([^']*)')?\s*\)\s*\n((?:\s*@[A-Za-z]+\([\s\S]*?\)\s*\n)*)\s*(?:async\s+)?(?:private\s+)?([A-Za-z0-9_]+)\s*\(",
        src,
    ):
        verb, sub, decorators, fn = match.groups()
        decorators = decorators or ''
        # Decorators such as @Public() are written above the HTTP verb, so the
        # preceding lines count as part of this route's decoration too.
        above = src[max(0, match.start() - 400):match.start()]
        above = above[above.rfind('\n\n') + 1:] if '\n\n' in above else above
        decorators += above
        perms = [PERM.get(p, p) for p in re.findall(r"PERMISSIONS\.([A-Z_]+)", decorators)]
        summary = re.search(r"summary:\s*'([^']*)'", decorators)
        full = '/' + '/'.join(p for p in [base.strip('/'), (sub or '').strip('/')] if p)
        routes.append({
            'method': verb.upper(),
            'path': full,
            'handler': fn,
            'permissions': perms,
            'public': '@Public()' in decorators,
            'apiKey': '@AllowApiKey()' in decorators,
            'summary': summary.group(1) if summary else None,
        })
    return {'file': path, 'tag': (tag.group(1) if tag else base.strip('/') or 'root'),
            'base': base, 'routes': routes}

groups = [g for g in (parse(p) for p in controllers()) if g['routes']]
total = sum(len(g['routes']) for g in groups)
unguarded = [(g['tag'], r) for g in groups for r in g['routes']
             if not r['permissions'] and not r['public']]

print(f'controllers: {len(groups)}  routes: {total}  no explicit permission: {len(unguarded)}')
for tag, r in unguarded:
    print(f'   {r["method"]:6} {r["path"]:44} ({tag}.{r["handler"]})')

json.dump(groups, open(OUT, 'w'), indent=1)
