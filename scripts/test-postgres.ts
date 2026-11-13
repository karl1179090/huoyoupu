import {mkdtemp, rm, mkdir} from 'node:fs/promises';
import {tmpdir, userInfo} from 'node:os';
import {join} from 'node:path';
import {spawn, execFileSync} from 'node:child_process';
import {existsSync, readdirSync} from 'node:fs';

function findPgBin(): string {
  const candidates = [process.env.PG_BIN, '/opt/homebrew/opt/postgresql@18/bin', '/usr/local/opt/postgresql@18/bin'];
  if (existsSync('/usr/lib/postgresql')) {
    for (const version of readdirSync('/usr/lib/postgresql').sort().reverse()) candidates.push(`/usr/lib/postgresql/${version}/bin`);
  }
  for (const directory of candidates) if (directory && existsSync(join(directory, 'initdb'))) return directory;
  try { return execFileSync('pg_config', ['--bindir'], {encoding: 'utf8'}).trim(); }
  catch { throw new Error('PostgreSQL binaries unavailable: install PostgreSQL 18 or set PG_BIN'); }
}

async function runTests(): Promise<number> {
  const selected = process.argv.slice(2);
  const files = selected.length ? selected : execFileSync('rg', ['--files', 'packages/database/test', 'apps/api/test', 'docs/verification'], {encoding: 'utf8'}).trim().split('\n').filter(file => file.startsWith('packages/database/test/') ? file.endsWith('.test.ts') : file.endsWith('.db.test.ts'));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--conditions=development', '--import', 'tsx', '--test', ...files], {stdio: 'inherit', env: process.env});
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}

if (process.env.TEST_DATABASE_URL) process.exitCode = await runTests();
else {
  const pgBin = findPgBin();
  process.env.PG_BIN ??= pgBin;
  const root = await mkdtemp(join(tmpdir(), 'huoyoupu-pg-'));
  const data = join(root, 'data');
  const socket = join(root, 'socket');
  await mkdir(socket);
  let started = false;
  try {
    execFileSync(join(pgBin, 'initdb'), ['-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8'], {stdio: 'pipe'});
    // No TCP listener: only this private temporary Unix socket can reach the server.
    execFileSync(join(pgBin, 'pg_ctl'), ['-D', data, '-l', join(root, 'server.log'), '-o', `-F -h '' -k ${socket}`, '-w', 'start'], {stdio: 'pipe'});
    started = true;
    const url = new URL(`postgresql://${encodeURIComponent(userInfo().username)}@localhost/postgres`);
    url.searchParams.set('host', socket);
    process.env.TEST_DATABASE_URL = url.toString();
    process.exitCode = await runTests();
  } finally {
    if (started) execFileSync(join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], {stdio: 'pipe'});
    await rm(root, {recursive: true, force: true});
  }
}
