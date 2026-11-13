import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE_URL = 'http://127.0.0.1:3000/api/v1';
const CREDS_PATH = '/tmp/huoyoupu-dev-mTw6IP/credentials.json';
const ORIGIN = 'http://localhost:5173';

describe('Settings Domain & Live API Workflow Integration Tests (Company & Users)', () => {
  let adminCookie = '';
  let adminCsrf = '';

  test('0. Setup: Authenticate Admin via session challenge and login', async () => {
    assert.ok(fs.existsSync(CREDS_PATH), `Credentials file must exist at ${CREDS_PATH}`);
    const rawCreds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));

    const adminSessionRes = await fetch(`${BASE_URL}/auth/session`, {
      headers: { Origin: ORIGIN },
    });
    const adminSession = await adminSessionRes.json();
    const adminInitCookie = adminSessionRes.headers.get('set-cookie')?.split(';')[0] || '';

    const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminSession.csrfToken,
        Cookie: adminInitCookie,
      },
      body: JSON.stringify({
        loginName: rawCreds.admin.loginName,
        password: rawCreds.admin.password,
      }),
    });
    assert.equal(adminLoginRes.status, 200);
    const adminData = await adminLoginRes.json();
    adminCsrf = adminData.csrfToken;
    adminCookie = adminLoginRes.headers.get('set-cookie')?.split(';')[0] || '';
  });

  test('1. Company Settings: Get company, patch with expectedVersion and verify version bump', async () => {
    // 1. Get company
    const getRes = await fetch(`${BASE_URL}/company`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(getRes.status, 200);
    const company = await getRes.json();
    const initialVersion = company.version;

    // 2. Patch company
    const updateRes = await fetch(`${BASE_URL}/company`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': `comp-update-${Date.now()}`,
      },
      body: JSON.stringify({
        expectedVersion: initialVersion,
        name: `货友铺连锁进销存-${Date.now().toString().slice(-4)}`,
        phone: '021-88889999',
        address: '上海市徐汇区漕河泾发货物流中心',
      }),
    });
    assert.equal(updateRes.status, 200);
    const updated = await updateRes.json();
    assert.equal(updated.version, initialVersion + 1, 'Version must increment on successful update');

    // 3. Version conflict test: sending outdated version returns 409
    const conflictRes = await fetch(`${BASE_URL}/company`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': `comp-conflict-${Date.now()}`,
      },
      body: JSON.stringify({
        expectedVersion: initialVersion, // outdated!
        name: '冲突测试',
      }),
    });
    assert.equal(conflictRes.status, 409, 'Expected version mismatch should return 409 conflict');
  });

  test('2. Users Management: List users, create user with valid password, toggle active state', async () => {
    // 1. List users
    const listRes = await fetch(`${BASE_URL}/users?limit=50`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(listRes.status, 200);
    const usersList = await listRes.json();
    assert.ok(Array.isArray(usersList.items));

    // 2. Create user with short password (< 12 chars) -> must be rejected
    const badPwRes = await fetch(`${BASE_URL}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': `user-bad-${Date.now()}`,
      },
      body: JSON.stringify({
        loginName: `emp_short_${Date.now().toString().slice(-4)}`,
        password: 'short',
        role: 'employee',
      }),
    });
    // Let's check status
    assert.ok(badPwRes.status >= 400, `Expected rejection, got status: ${badPwRes.status}`);

    // 3. Create user with valid password (>= 12 chars)
    const newLoginName = `emp_test_${Date.now().toString().slice(-4)}`;
    const createRes = await fetch(`${BASE_URL}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': `user-create-${Date.now()}`,
      },
      body: JSON.stringify({
        loginName: newLoginName,
        password: 'SecurePassword123456!',
        role: 'employee',
      }),
    });
    assert.equal(createRes.status, 201);
    const createdUser = await createRes.json();
    assert.equal(createdUser.loginName, newLoginName);
    assert.equal(createdUser.active, true);
    assert.equal(createdUser.role, 'employee');

    // 4. Toggle active state to false
    const toggleRes = await fetch(`${BASE_URL}/users/${createdUser.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': `user-toggle-${Date.now()}`,
      },
      body: JSON.stringify({
        expectedVersion: createdUser.version,
        active: false,
      }),
    });
    assert.equal(toggleRes.status, 200);
    const deactivatedUser = await toggleRes.json();
    assert.equal(deactivatedUser.active, false);
    assert.equal(deactivatedUser.version, createdUser.version + 1);
  });

  test('3. C8 Requirement: Clearing company phone and address with empty strings persists and increments version', async () => {
    // 1. Get current company
    const getRes = await fetch(`${BASE_URL}/company`, {
      headers: { Origin: ORIGIN, Cookie: adminCookie },
    });
    assert.equal(getRes.status, 200);
    const curr = await getRes.json();

    // 2. Clear phone and address by sending explicit empty strings ""
    const clearRes = await fetch(`${BASE_URL}/company`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': `clear-phone-${Date.now()}`,
      },
      body: JSON.stringify({
        expectedVersion: curr.version,
        phone: '',
        address: '',
      }),
    });
    assert.equal(clearRes.status, 200);
    const cleared = await clearRes.json();
    assert.equal(cleared.phone, '', 'Phone must be cleared to empty string');
    assert.equal(cleared.address, '', 'Address must be cleared to empty string');
    assert.equal(cleared.version, curr.version + 1, 'Version must increment on successful field clear');

    // 3. Restore valid values for remaining tests
    const restoreRes = await fetch(`${BASE_URL}/company`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': adminCsrf,
        Cookie: adminCookie,
        'Idempotency-Key': `restore-phone-${Date.now()}`,
      },
      body: JSON.stringify({
        expectedVersion: cleared.version,
        phone: '021-88889999',
        address: '上海市徐汇区漕河泾发货物流中心',
      }),
    });
    assert.equal(restoreRes.status, 200);
  });
});
