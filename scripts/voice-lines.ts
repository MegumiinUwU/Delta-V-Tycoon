// Voice script: every line a character can say, with its clip id. Run: npx tsx scripts/voice-lines.ts
// Writes scripts/art/voice_lines.json, which scripts/art/voice_kokoro.py turns into public/assets/voice/*.mp3.
import { writeFileSync } from 'node:fs';
import { voiceId } from '../src/audio/voiceKey';
import { getCatalog } from '../src/core/catalog';
import { fmtM } from '../src/core/format';

const cat = getCatalog();
const lines = new Map<string, { id: string; speaker: string; text: string; from: string }>();
// The guest crew only have their own short chime (src/audio/sound.ts VOICE_FILES) and are never given a synthetic
// voice, so their lines are not listed: the recorder has no voice for them and would stop.
const CHIME_ONLY = new Set(['miku', 'teto', 'neru']);
const add = (speaker: string, text: string, from: string) => {
  if (CHIME_ONLY.has(speaker)) return;
  const id = voiceId(speaker, text);
  const old = lines.get(id);
  if (old && old.text !== text) throw new Error(`hash collision: ${id}`);
  if (!old) lines.set(id, { id, speaker, text, from });
};

// Dialog. "{budget}" is filled exactly as the Budget Council screen does, once per scenario and difficulty.
for (const [key, list] of Object.entries(cat.dialog)) {
  list.forEach((l, i) => {
    if (!l.text.includes('{budget}')) { add(l.speaker, l.text, `dialog.${key}[${i}]`); return; }
    for (const sc of cat.scenarios) for (const d of cat.difficulties)
      add(l.speaker, l.text.replace('{budget}', fmtM(sc.budgetM * d.budgetMult)), `dialog.${key}[${i}] ${sc.id}/${d.id}`);
  });
}
// Signature lines of every character.
for (const c of cat.characters)
  for (const [k, text] of Object.entries(c.lines)) add(c.id, text, `characters.${c.id}.${k}`);
// Event results are spoken by whoever holds the owning role: solo, the first character of that role (listed first, so
// they are recorded first); online, any playable character.
const crew = cat.characters.filter((c) => c.playable);
for (const everyone of [false, true])
  for (const ev of cat.events)
    for (const o of ev.options)
      for (const text of [o.explanation, o.badExplanation])
        if (text) for (const c of everyone ? crew : crew.filter((x) => x.role === ev.ownerRole).slice(0, 1)) add(c.id, text, `events.${ev.id}.${o.id}`);

const out = new URL('./art/voice_lines.json', import.meta.url);
writeFileSync(out, JSON.stringify([...lines.values()], null, 1) + '\n');
const per = new Map<string, number>();
for (const l of lines.values()) per.set(l.speaker, (per.get(l.speaker) ?? 0) + 1);
console.log(`${lines.size} lines →`, [...per].map(([s, n]) => `${s} ${n}`).join(', '));
