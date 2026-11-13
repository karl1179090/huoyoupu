"""Explicit, disposable HTTPS API fixture preparation; never run on production.

Reuses deployment-http-check.py's stdlib HTTPS/cookie/CSRF/idempotency flow.
No network activity occurs on import. Credentials are never printed.
"""
import argparse
import datetime
import http.cookiejar
import ipaddress
import json
import os
from pathlib import Path
import secrets
import ssl
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Api:
    def __init__(self, origin, ca_file):
        self.origin = origin
        self.csrf = None
        self.client = urllib.request.build_opener(
            NoRedirect(),
            urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=ca_file)),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
        )

    def call(self, method, path, payload=None, expected=200, write=False):
        headers = {'Origin': self.origin}
        if self.csrf:
            headers['x-csrf-token'] = self.csrf
        if write:
            headers['idempotency-key'] = str(uuid.uuid4())
        data = None if payload is None else json.dumps(payload).encode()
        if data is not None:
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(self.origin + path, data=data, headers=headers, method=method)
        try:
            response = self.client.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            # Never include auth payload, response body, cookie, or token in errors.
            raise RuntimeError(f'{method} {path}: unexpected HTTP {error.code}') from None
        with response:
            if response.status != expected:
                raise RuntimeError(f'{method} {path}: unexpected HTTP {response.status}')
            if expected == 204:
                return None
            return json.load(response)

    def get(self, path):
        return self.call('GET', '/api/v1' + path)

    def post(self, path, body, expected=201):
        return self.call('POST', '/api/v1' + path, body, expected, write=True)

    def login(self, credentials, role):
        self.csrf = self.get('/auth/session')['csrfToken']
        session = self.call('POST', '/api/v1/auth/login', credentials)
        self.csrf = session['csrfToken']
        if session.get('user', {}).get('role') != role:
            raise RuntimeError('Unexpected fixture account role')

    def logout(self):
        self.call('POST', '/api/v1/auth/logout', expected=204)
        self.csrf = None


def private_file(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('Input credentials must be an owned private regular file (0600 or stricter)')
    document = json.loads(path.read_text())
    admin = document.get('admin', document)
    if not all(isinstance(admin.get(key), str) and admin[key] for key in ('loginName', 'password')):
        raise ValueError('Admin input requires loginName and password')
    return {key: admin[key] for key in ('loginName', 'password')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--ca-file', required=True)
    parser.add_argument('--admin-file', type=Path, required=True)
    parser.add_argument('--output-file', type=Path, required=True)
    parser.add_argument('--fixture-project', required=True, help='Must start with huoyoupu-test-')
    parser.add_argument('--allow-disposable-fixture-writes', action='store_true')
    args = parser.parse_args()
    if not args.allow_disposable_fixture_writes or not args.fixture_project.startswith('huoyoupu-test-'):
        raise ValueError('Explicit disposable fixture project/write opt-in required')
    target = urllib.parse.urlsplit(args.origin)
    if (target.scheme != 'https' or target.username or target.password or target.path
            or target.query or target.fragment or not target.port or target.port < 1024):
        raise ValueError('Require HTTPS origin only, with an explicit high port')
    address = ipaddress.ip_address(target.hostname)
    if not (address.is_private and not address.is_unspecified and not address.is_multicast):
        raise ValueError('Require a literal private fixture IP, never a public/unspecified target')
    if os.environ.get('NODE_TLS_REJECT_UNAUTHORIZED') == '0':
        raise ValueError('Global TLS bypass must not be enabled')
    output = args.output_file.absolute()
    repository = Path(__file__).resolve().parents[1]
    if output.resolve().is_relative_to(repository):
        raise ValueError('Credentials output must be outside repository')
    parent = output.parent.lstat()
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.getuid() or parent.st_mode & 0o077:
        raise ValueError('Output parent must be an owned private directory (0700)')
    if output.exists() or output.is_symlink():
        raise ValueError('Refusing to overwrite credentials output')
    admin = private_file(args.admin_file)
    api = Api(args.origin, args.ca_file)
    if api.call('GET', '/health').get('status') != 'ok':
        raise RuntimeError('Fixture health failed')
    api.login(admin, 'admin')
    token = uuid.uuid4().hex[:12]
    employee = {'loginName': 'smoke_' + token, 'password': secrets.token_urlsafe(32)}
    try:
        api.post('/users', {**employee, 'role': 'employee'})
        customer = api.post('/customers', {'code': 'SMK-C-' + token, 'name': '虚构部署验收客户'})
        address_row = api.post('/customers/' + customer['id'] + '/addresses', {
            'contactName': '虚构收货人', 'address': '虚构验收地址，不配送', 'isDefault': True,
        })
        product = api.post('/products', {'code': 'SMK-P-' + token, 'name': '虚构部署验收商品',
                                       'baseUnit': {'name': '瓶', 'defaultSalePrice': '5.000000'}})
        warehouse = api.post('/warehouses', {'code': 'SMK-W-' + token, 'name': '虚构隔离验收仓'})
        received_at = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)).isoformat()
        api.post('/receipts', {'kind': 'opening', 'warehouseId': warehouse['id'], 'receivedAt': received_at,
                              'lines': [{'productId': product['id'], 'unitId': product['baseUnitId'],
                                         'quantity': 10, 'unitCost': '2.000000'}]})
        draft = api.post('/orders', {'customerId': customer['id'], 'addressId': address_row['id'],
                                    'lines': [{'clientLineId': 'smoke-line', 'productId': product['id'],
                                               'warehouseId': warehouse['id'], 'unitId': product['baseUnitId'],
                                               'quantity': 2, 'unitPrice': '5.000000', 'allocationMode': 'auto'}],
                                    'discountAmount': '0.00', 'roundOffAmount': '0.00'})
        confirmed = api.post('/orders/' + draft['id'] + '/confirm', {'expectedVersion': draft['version']}, 200)
        revised = api.post('/orders/' + draft['id'] + '/revisions', {
            'expectedVersion': confirmed['version'], 'reason': '虚构部署验收改价，保留旧确认版本',
            'lineChanges': [{'op': 'set', 'lineId': confirmed['lines'][0]['id'], 'unitPrice': '6.000000'}],
        })
        historical = api.get('/orders/' + draft['id'] + '/revisions/' + confirmed['revisionId'])
        if (historical['isCurrentRevision'] or historical['status'] != 'confirmed'
                or historical['totalAmount'] != '10.00' or revised['totalAmount'] != '12.00'
                or revised['revisionId'] == confirmed['revisionId']):
            raise RuntimeError('Expected a real historical confirmed revision after amendment')
        query = urllib.parse.urlencode({'productId': product['id'], 'warehouseId': warehouse['id'],
                                        'positiveOnly': 'false', 'limit': 100})
        batches = api.get('/inventory/batches?' + query)['items']
        if len(batches) != 1 or batches[0]['quantityBase'] != 8 or batches[0]['costAmount'] != '16.00':
            raise RuntimeError('Expected one real remaining receipt batch')
        ledger = api.get('/customers/' + customer['id'] + '/ledger?limit=100')['items']
        # Customer is unique to this fixture: these are real commercial ledger entries, not fabricated refs.
        if not ledger or any(entry['customerId'] != customer['id'] for entry in ledger):
            raise RuntimeError('Expected real fixture commercial ledger entries')
        ids = {'orderId': draft['id'], 'revisionId': historical['revisionId'], 'productId': product['id'],
               'warehouseId': warehouse['id'], 'batchId': batches[0]['id'], 'customerId': customer['id'],
               'ledgerEntryId': ledger[0]['id']}
        employee_api = Api(args.origin, args.ca_file)
        employee_api.login(employee, 'employee')
        employee_api.get('/orders/' + draft['id'] + '/revisions/' + historical['revisionId'])
        employee_api.logout()
    finally:
        api.logout()
    # Exact C smoke schema; exclusive creation, no stdout secrets, no reusable production data.
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w') as stream:
        json.dump({'admin': admin, 'employee': employee, 'ids': ids}, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print('Disposable HTTPS fixture prepared; private credentials file written (contents withheld).')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Do not leak exception payloads, URLs with secrets, cookies or provider messages.
        print('Fixture preparation failed: ' + (str(error) if isinstance(error, (ValueError, RuntimeError))
                                               else type(error).__name__), file=sys.stderr)
        sys.exit(1)
