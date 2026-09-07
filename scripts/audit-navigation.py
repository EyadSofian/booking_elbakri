#!/usr/bin/env python3
"""
Audits every internal navigation target in the web app.

Finds hrefs and router.push targets, then checks each one against the routes
Next.js actually builds. A link to a route that does not exist is a 404 waiting
to happen, and they are invisible until someone clicks.
"""
import re, os, sys, json, collections

WEB = 'apps/web/src'
APP = f'{WEB}/app'

def built_routes():
    """Every route the App Router will serve, from the page.tsx files on disk."""
    routes = set()
    for dirpath, _, files in os.walk(APP):
        if 'page.tsx' not in files:
            continue
        rel = os.path.relpath(dirpath, APP)
        route = '/' if rel == '.' else '/' + rel.replace(os.sep, '/')
        routes.add(route)
    return routes

def matches(target, routes):
    """A concrete path matches a route, allowing for [id] style segments."""
    t = [s for s in target.split('/') if s]
    for r in routes:
        segs = [s for s in r.split('/') if s]
        if len(segs) != len(t):
            continue
        if all(rs.startswith('[') or rs == ts for rs, ts in zip(segs, t)):
            return True
    return False

def sources():
    for dirpath, _, files in os.walk(WEB):
        for f in files:
            if f.endswith(('.tsx', '.ts')):
                yield os.path.join(dirpath, f)

LINK_PATTERNS = [
    re.compile(r'href=\{?["`\']([^"`\'{}$]+)["`\']'),
    # Route tables (nav-config, admin/master-data hubs) declare `href: '/x'`.
    re.compile(r'href:\s*["\']([^"\']+)["\']'),
    re.compile(r'router\.(?:push|replace)\(\s*["`\']([^"`\'{}$]+)["`\']'),
    re.compile(r'href=\{`(/[^`$]*)\$'),          # template literal prefix
    re.compile(r'router\.(?:push|replace)\(\s*`(/[^`$]*)\$'),
]

def main():
    routes = built_routes()
    found = collections.defaultdict(set)

    for path in sources():
        src = open(path, encoding='utf-8').read()
        for pat in LINK_PATTERNS:
            for m in pat.finditer(src):
                target = m.group(1)
                if not target.startswith('/'):
                    continue
                target = target.split('?')[0].split('#')[0]
                # A template prefix like `/trips/` stands for `/trips/[id]`.
                if target.endswith('/'):
                    target = target.rstrip('/') + '/x'
                found[target].add(os.path.relpath(path, WEB))

    broken = {t: sorted(f) for t, f in found.items() if not matches(t, routes)}

    # A literal path such as /trips/new "matches" /trips/[id], so the link looks
    # fine while actually rendering a detail page for a record that cannot
    # exist. These are dead controls that no simple existence check catches.
    shadowed = {}
    for target, files in found.items():
        if target in routes or target.endswith('/x'):
            continue
        segs = [s for s in target.split('/') if s]
        for r in routes:
            rs = [s for s in r.split('/') if s]
            if (len(rs) == len(segs) and any(x.startswith('[') for x in rs)
                    and all(a.startswith('[') or a == b for a, b in zip(rs, segs))):
                shadowed[target] = (r, sorted(files))
                break

    print(f'built routes      : {len(routes)}')
    print(f'distinct link targets: {len(found)}')
    print(f'BROKEN            : {len(broken)}')
    print()
    for target, files in sorted(broken.items()):
        print(f'  {target}')
        for f in files:
            print(f'      <- {f}')

    if shadowed:
        print()
        print(f'SHADOWED BY A DYNAMIC ROUTE: {len(shadowed)}')
        for target, (route, files) in sorted(shadowed.items()):
            print(f'  {target}  ->  {route}')
            for f in files:
                print(f'      <- {f}')

    return 1 if (broken or shadowed) else 0

if __name__ == '__main__':
    sys.exit(main())
