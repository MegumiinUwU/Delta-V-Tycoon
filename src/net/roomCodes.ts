// Room codes: 5 characters, no O/0/I/1/L (Part A §A13).
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;
export const BAD_CODE_MESSAGE = 'Check the code — it has 5 letters/numbers, no O, 0, I, 1 or L';

export function makeCode(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return s;
}

/** Uppercases and strips spaces; null if the result is not a valid code. */
export function normalizeCode(input: string): string | null {
  const s = input.toUpperCase().replace(/\s+/g, '');
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}
