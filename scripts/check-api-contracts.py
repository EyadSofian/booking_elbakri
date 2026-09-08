#!/usr/bin/env python3
"""
Checks that the API returns the fields the web app reads.

A page written against an assumed response shape typechecks perfectly and then
white-screens in production, because TypeScript cannot know what the server
actually sends. This walks the real API and asserts the fields each screen
depends on are present.

Usage:
    python3 scripts/check-api-contracts.py                       # against production
    API=http://localhost:4000 python3 scripts/check-api-contracts.py
"""
import json
import os
import sys
import urllib.error
import urllib.request

API = os.environ.get('API', 'https://elbakri-api-production.up.railway.app').rstrip('/')
EMAIL = os.environ.get('API_EMAIL', 'admin@elbakri.local')
PASSWORD = os.environ.get('API_PASSWORD', '')


def request(path, token=None, body=None):
    url = f'{API}/api/v1{path}'
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method='POST' if data else 'GET')
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    with urllib.request.urlopen(req, timeout=40) as response:
        return json.loads(response.read())


def sign_in():
    if not PASSWORD:
        print('Set API_PASSWORD to run the contract checks.', file=sys.stderr)
        sys.exit(2)
    return request('/auth/login', body={'email': EMAIL, 'password': PASSWORD})['accessToken']


# Each entry: the endpoint, where the record lives in the response, and the
# fields the UI reads from it. Listing a field here is a statement that a screen
# breaks without it.
CONTRACTS = [
    # path, extractor, required fields, the screen that depends on them
    ('/finance/overview', lambda d: d,
     ['openDocuments', 'totalPayable', 'totalPaid', 'totalOutstanding',
      'overdueOutstanding', 'overdueCount', 'counterpartyBalances'],
     'Finance overview'),

    ('/finance/reconciliation?pageSize=1', lambda d: (d['data'] or [{}])[0],
     ['reference', 'calculatedOutstanding', 'difference', 'mismatch',
      'restLooksLikeSum', 'legacyRestRaw', 'issue'],
     'Finance reconciliation'),

    ('/financial-documents?pageSize=1', lambda d: (d['data'] or [{}])[0],
     ['reference', 'status', 'currency', 'totalAmount', 'paidAmount',
      'outstanding', 'dueDate'],
     'Payables list'),

    ('/payments?pageSize=1', lambda d: (d['data'] or [{}])[0],
     ['reference', 'amount', 'currency', 'paymentDate', 'status', 'method'],
     'Payments list'),

    ('/settlements?pageSize=1', lambda d: (d['data'] or [{}])[0],
     ['reference', 'status', 'currency', 'totalAmount', 'description', 'partner'],
     'Settlements'),

    ('/reports', lambda d: d, ['reports'], 'Reports'),

    ('/settings', lambda d: (d or [{}])[0], ['key', 'value'], 'Settings'),

    ('/audit?pageSize=1', lambda d: (d['data'] or [{}])[0],
     ['action', 'entityType', 'createdAt', 'before', 'after'], 'Audit log'),

    ('/users?pageSize=1', lambda d: (d['data'] or [{}])[0],
     ['email', 'fullName', 'isActive', 'roles'], 'Users'),

    ('/alias-suggestions?pageSize=1', lambda d: (d['data'] or [{}])[0],
     ['rawValue', 'entityType', 'occurrences', 'status', 'suggestedId', 'score'],
     'Matching queue'),

    ('/data-quality/summary', lambda d: d,
     ['openTotal', 'byCategory', 'bySeverity'], 'Data quality'),

    ('/dashboard/summary', lambda d: d,
     ['arrivalsToday', 'departuresToday', 'openTripFiles', 'outstandingPayables'],
     'Dashboard'),

    ('/dashboard/alerts', lambda d: d,
     ['missingPickupTime', 'unassignedTransfers', 'overduePayables'],
     'Dashboard alerts'),

    ('/operations/today', lambda d: d, ['date', 'events', 'counts'], "Today's operations"),

    ('/hotel-directory/status', lambda d: d,
     ['source', 'configured', 'running', 'lastRun', 'pricingImported'],
     'Hotel sync panel'),

    ('/hotels?pageSize=1', lambda d: (d['data'] or [{}])[0],
     ['name', 'syncStatus', 'aliases'], 'Hotel directory'),

    ('/trips?pageSize=1', lambda d: (d['data'] or [{}])[0],
     ['reference', 'status', 'leadTraveler', 'partner', '_count'], 'Trip files'),

    ('/travelers?pageSize=1', lambda d: (d['data'] or [{}])[0],
     ['fullName', 'phoneRaw', 'nationality'], 'Travellers'),

    ('/imports?pageSize=1', lambda d: (d['data'] or [{}])[0],
     ['sourceFilename', 'status', 'rowsScanned', 'rowsMaster', 'rowsContinuation'],
     'Import Center'),
]

# Fields that must NEVER appear — the Rate Hub boundary, checked from this side.
FORBIDDEN_ON_HOTELS = ['price', 'rate', 'currency', 'package', 'commission', 'cost']

# Nested collections a detail screen reads. A list endpoint can be perfectly
# correct while the objects inside a detail response are missing derived fields
# — which is how the trip Finance tab came to show a balance of zero for
# everything, and the Visa tab an empty margin.
NESTED_CONTRACTS = [
    # detail path built from a list, collection, required fields, screen
    ('/trips', '/trips/{id}', 'financialDocuments',
     ['reference', 'totalAmount', 'paidAmount', 'outstanding', 'currency'],
     'Trip file · Finance tab'),
    ('/trips', '/trips/{id}', 'visaOrders',
     ['reference', 'status', 'margin'], 'Trip file · Visa tab'),
    ('/trips', '/trips/{id}', 'hotelBookings',
     ['reference', 'status', 'staySegments'], 'Trip file · Hotels tab'),
    ('/trips', '/trips/{id}', 'transferBookings',
     ['reference', 'status', 'legs'], 'Trip file · Transfers tab'),
    ('/travelers', '/travelers/{id}', 'tripsAsLead',
     ['reference', 'status', '_count'], 'Traveller · Overview'),
    ('/hotels', '/hotels/{id}', 'aliases', ['alias', 'status'], 'Hotel · Aliases'),
]


def check_nested(token, failures):
    """Walks into a detail response and checks the objects inside it."""
    checked = 0
    for list_path, detail_template, collection, required, screen in NESTED_CONTRACTS:
        try:
            rows = request(f'{list_path}?pageSize=40', token).get('data') or []
            found = None
            for row in rows:
                detail = request(detail_template.replace('{id}', row['id']), token)
                items = detail.get(collection) or []
                if items:
                    found = items[0]
                    break
            if found is None:
                print(f'  skip  {screen:28} no data to check')
                continue
            missing = [f for f in required if f not in found]
            checked += len(required)
            if missing:
                failures.append(f'{screen}: {collection}[] is missing {", ".join(missing)}')
                print(f'  FAIL  {screen:28} missing {missing}')
            else:
                print(f'  ok    {screen:28} {len(required)} fields')
        except Exception as err:  # noqa: BLE001
            failures.append(f'{screen}: {err}')
            print(f'  ERROR {screen:28} {err}')
    return checked


def main():
    token = sign_in()
    failures = []
    checked = 0

    for path, extract, required, screen in CONTRACTS:
        try:
            payload = request(path, token)
            record = extract(payload)
        except urllib.error.HTTPError as err:
            failures.append(f'{screen}: {path} returned HTTP {err.code}')
            continue
        except Exception as err:  # noqa: BLE001
            failures.append(f'{screen}: {path} failed — {err}')
            continue

        if not isinstance(record, dict):
            failures.append(f'{screen}: {path} did not return an object')
            continue

        missing = [f for f in required if f not in record]
        checked += len(required)
        if missing:
            failures.append(
                f'{screen}: {path} is missing {", ".join(missing)}\n'
                f'    returns: {", ".join(sorted(record.keys())[:18])}'
            )
            print(f'  FAIL  {screen:24} missing {missing}')
        else:
            print(f'  ok    {screen:24} {len(required)} fields')

    print()
    checked += check_nested(token, failures)
    print()

    # The hotel directory must not carry anything financial.
    try:
        hotel = (request('/hotels?pageSize=1', token)['data'] or [{}])[0]
        leaked = [
            k for k in hotel
            if any(f in k.lower() for f in FORBIDDEN_ON_HOTELS)
        ]
        if leaked:
            failures.append(f'Hotel directory exposes pricing-related fields: {leaked}')
            print(f'  FAIL  {"Hotel pricing boundary":24} {leaked}')
        else:
            print(f'  ok    {"Hotel pricing boundary":24} nothing financial')
    except Exception as err:  # noqa: BLE001
        failures.append(f'Hotel pricing boundary check failed — {err}')

    print()
    print(f'{checked} field assertions, {len(failures)} failures')
    for failure in failures:
        print(f'  - {failure}')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
