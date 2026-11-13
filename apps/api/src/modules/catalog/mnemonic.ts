import { pinyin } from 'pinyin-pro';

/** Phrase-aware pinyin initials; non-Chinese ASCII digits and letters keep their order. */
export function generateMnemonic(name: string): string {
  return pinyin(name, { pattern: 'first', toneType: 'none', type: 'array', nonZh: 'consecutive' })
    .join('').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeMnemonicOverride(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!normalized) throw new Error('Mnemonic override must contain ASCII letters or digits');
  return normalized;
}
