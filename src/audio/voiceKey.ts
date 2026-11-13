/** Clip id of a spoken line: "<speaker>_<FNV-1a hash of the exact text>". Shared by the game and scripts/voice-lines.ts,
 *  so a line is voiced whenever a clip was recorded for exactly that speaker and text. */
export function voiceId(speaker: string, text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${speaker}_${(h >>> 0).toString(16).padStart(8, '0')}`;
}
