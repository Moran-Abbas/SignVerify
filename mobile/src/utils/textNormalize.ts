/** Canonical text form for stable SHA-256 commitment (multilingual-safe). */
export const NO_TEXT_COMMITMENT_SENTINEL = '::SIGNVERIFY_NO_TEXT::';

export function normalizeDocumentText(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .normalize('NFKC')
    .replace(/\r\n/g, '\n')
    .replace(/[\u00AD\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
