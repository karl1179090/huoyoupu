import { readFile, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';

const baseline = new URL('../../../docs/contracts/api-contract.openapi.json', import.meta.url);
const document = JSON.parse(await readFile(baseline, 'utf8'));
const artifacts = [
  ['../src/generated/openapi.json', `${JSON.stringify(document, null, 2)}\n`],
  ['../src/generated/types.ts', astToString(await openapiTS(document, { defaultNonNullable: false }))],
];
for (const [path, expected] of artifacts) {
  const destination = new URL(path, import.meta.url);
  if (process.argv.includes('--check')) {
    const actual = await readFile(destination, 'utf8');
    if (actual !== expected) throw new Error(`Contract drift: ${destination.pathname}; run npm run generate -w @huoyoupu/contracts`);
  } else {
    await writeFile(destination, expected);
  }
}
