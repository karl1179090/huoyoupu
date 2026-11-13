import {createTestDatabase} from '@huoyoupu/database/testing';
import {createApp,type AppOptions} from '../src/app.js';
import {initializeAdministrator} from '../src/modules/auth/service.js';
import {parseSchema} from '@huoyoupu/contracts';
import {randomUUID} from 'node:crypto';
export const origin = 'https://inventory.example.test';
export const password = 'fictional-test-password-2026';
export interface Credentials {cookie: string; csrf: string}
export async function apiFixture(options:Omit<AppOptions,'database'|'publicOrigin'>={}) {
  const database = await createTestDatabase();
  const admin = await initializeAdministrator(database.pool, {loginName: 'admin', password});
  const app = createApp({...options,database: database.pool, publicOrigin: origin});
  async function login(loginName = 'admin', loginPassword = password) {
    const challenge = await app.inject({method: 'GET', url: '/api/v1/auth/session'});
    const anonymousCookie = String(challenge.headers['set-cookie']).split(';')[0]!;
    const csrf = parseSchema('Session', challenge.json()).csrfToken;
    const response = await app.inject({method: 'POST', url: '/api/v1/auth/login', headers: {cookie: anonymousCookie, origin, 'x-csrf-token': csrf}, payload: {loginName, password: loginPassword}});
    if (response.statusCode !== 200) throw new Error(`Fixture login failed: ${response.statusCode} ${response.body}`);
    const session = parseSchema('Session', response.json());
    return {cookie: String(response.headers['set-cookie']).split(';')[0]!, csrf: session.csrfToken, user: session.user!, anonymousCookie, anonymousCsrf: csrf, response};
  }
  async function cleanup() {await app.close(); await database.cleanup();}
  return {...database, app, admin, login, cleanup};
}
export function writeHeaders(credentials: Credentials, key = randomUUID()) {
  return {cookie: credentials.cookie, origin, 'x-csrf-token': credentials.csrf, 'idempotency-key': key};
}
