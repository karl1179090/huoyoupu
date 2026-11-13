import assert from 'node:assert/strict';
import test from 'node:test';
import { generateMnemonic, normalizeMnemonicOverride } from '../src/modules/catalog/mnemonic.js';

test('phrase dictionary preserves digit/English order and normalizes punctuation/case', () => {
  assert.equal(generateMnemonic('500ml酱油'), '500mljy');
  assert.equal(generateMnemonic(' 500ML，酱油！ '), '500mljy');
  assert.equal(generateMnemonic('250ml酱油'), '250mljy');
  assert.equal(generateMnemonic('ABC123洗衣液'), 'abc123xyy');
  assert.equal(generateMnemonic('001瓶A2'), '001pa2');
  assert.equal(generateMnemonic('重庆火锅底料'), 'cqhgdl');
  assert.equal(generateMnemonic('雪碧'), generateMnemonic('香槟'));
});

test('manual initials normalize independently of the dictionary and can be cleared', () => {
  assert.equal(normalizeMnemonicOverride(' CQ-500 '), 'cq500');
  assert.equal(normalizeMnemonicOverride(null), null);
  assert.equal(normalizeMnemonicOverride(undefined), null);
  assert.throws(() => normalizeMnemonicOverride('---'));
});
