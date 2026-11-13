import {execFileSync, spawn} from 'node:child_process';
const files = execFileSync('rg', ['--files', 'apps/api/test', 'packages/money/test', 'packages/contracts/test'], {encoding: 'utf8'})
  .trim().split('\n').filter(file => file.endsWith('.test.ts') && !file.endsWith('.db.test.ts'));
process.exitCode = await new Promise<number>((resolve, reject) => {
  const child = spawn(process.execPath, ['--conditions=development', '--import', 'tsx', '--test', ...files], {stdio: 'inherit'});
  child.once('error', reject);
  child.once('exit', code => resolve(code ?? 1));
});
