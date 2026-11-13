# /// script
# requires-python = ">=3.10"
# dependencies = ["kokoro-onnx>=0.4.9", "numpy"]
# ///
"""Character voices for Delta-V Tycoon, spoken by Kokoro-82M (Apache-2.0, https://huggingface.co/hexgrad/Kokoro-82M),
an open text-to-speech model that runs locally on the CPU through kokoro-onnx (MIT).

    npx tsx scripts/voice-lines.ts          # 1. list every spoken line   -> scripts/art/voice_lines.json
    uv run scripts/art/voice_kokoro.py      # 2. record the missing clips -> public/assets/voice/<id>.mp3 + src/data/voice.json
(or just: npm run voice). Needs uv and ffmpeg on PATH. The model (about 340 MB) is downloaded once to ~/.cache/kokoro-onnx.

Options: --force (record everything again), --only nour,omar (these speakers only), --limit N, --phonemes (print, no audio).
The output is AI-generated speech from stock Kokoro voices (no real person's voice is cloned): it is disclosed in
README "Tools used" and CREDITS.md.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
LINES = ROOT / 'scripts' / 'art' / 'voice_lines.json'
OUT = ROOT / 'public' / 'assets' / 'voice'
MANIFEST = ROOT / 'src' / 'data' / 'voice.json'
CACHE = Path(os.environ.get('KOKORO_CACHE', Path.home() / '.cache' / 'kokoro-onnx'))
RELEASE = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/'
MODEL, VOICES = os.environ.get('KOKORO_MODEL', 'kokoro-v1.0.onnx'), 'voices-v1.0.bin'

# The cast: one stock Kokoro voice per character (af/am = American, bf/bm = British English), with a speaking pace.
CAST = {
    'hassan':  dict(voice='bm_george',  lang='en-gb', speed=0.95),   # flight director: measured, warm
    'priya':   dict(voice='af_aoede',   lang='en-us', speed=0.97),   # ground station operator: brisk
    'nour':    dict(voice='af_heart',   lang='en-us', speed=0.95),   # commander, former air-traffic controller
    'lucas':   dict(voice='bm_fable',   lang='en-gb', speed=0.98),   # commander, calm ex-test pilot
    'diaa':    dict(voice='am_michael', lang='en-us', speed=0.95),   # commander, seasoned leader
    'omar':    dict(voice='am_puck',    lang='en-us', speed=0.96),   # engineer, energetic
    'elena':   dict(voice='bf_emma',    lang='en-gb', speed=0.92),   # veteran engineer, dry
    'amara':   dict(voice='af_bella',   lang='en-us', speed=0.95),   # science lead, enthusiastic
    'hiroshi': dict(voice='am_echo',    lang='en-us', speed=0.96),   # science lead, gentle
    'kwame':   dict(voice='am_fenrir',  lang='en-us', speed=0.93),   # comms officer, steady
    'layla':   dict(voice='af_kore',    lang='en-us', speed=0.97),   # comms officer, precise
}


def money(m):
    v = float(m.group(1).replace(',', ''))
    if v >= 1000:
        return f'{v / 1000:g} billion dollars'
    return f'{v:g} million dollars'


def speakable(text):
    """Game text -> text a voice can read: units, symbols and jargon written out."""
    t = text
    t = re.sub(r'\$([\d,.]*\d)M\b', money, t)                  # "$144M" -> "144 million dollars"
    t = re.sub(r'\bNO-GO\b', 'no-go', t)
    t = re.sub(r'\bGO\b', 'go', t)
    t = re.sub(r'\bCML (\d)', r'C M L \1', t)
    t = re.sub(r'\bdelta-v\b', 'delta vee', t, flags=re.I)
    t = re.sub(r'(\d) m/s\b', r'\1 meters per second', t)
    t = re.sub(r'(\d)%', r'\1 percent', t)
    t = re.sub(r'\bDr\. ', 'Doctor ', t)
    t = re.sub(r'\s*\(([^)]*)\)', r', \1,', t)                 # asides in brackets become pauses
    t = re.sub(r'\s*—\s*', ', ', t).replace('…', '...')
    t = re.sub(r',\s*([.!?:])', r'\1', t)
    return re.sub(r'\s+', ' ', t).strip()


def fetch(name):
    path = CACHE / name
    if path.exists():
        return path
    CACHE.mkdir(parents=True, exist_ok=True)
    print(f'downloading {name} ...', flush=True)
    part = path.with_suffix(path.suffix + '.part')
    urllib.request.urlretrieve(RELEASE + name, part)
    part.rename(path)
    return path


def master(x, sr):
    """Trim silence, level every clip to the same loudness, add short fades. Returns float32 mono."""
    x = np.asarray(x, dtype=np.float32).reshape(-1)
    win = int(sr * 0.02)
    n = len(x) // win
    rms = np.sqrt((x[:n * win].reshape(n, win) ** 2).mean(axis=1) + 1e-12)
    loud = np.flatnonzero(rms > max(rms.max() * 0.03, 1e-4))
    if len(loud):
        x = x[max(0, loud[0] * win - int(sr * 0.04)):min(len(x), (loud[-1] + 1) * win + int(sr * 0.12))]
        level = np.sqrt((rms[loud] ** 2).mean())                 # loudness of the spoken parts only
        gain = 10 ** (-19 / 20) / level
        gain = min(gain, 10 ** (-1.5 / 20) / (np.abs(x).max() + 1e-9))
        x = x * gain
    f = int(sr * 0.008)
    x[:f] *= np.linspace(0, 1, f)
    x[-f:] *= np.linspace(1, 0, f)
    return x


def encode(x, sr, dst):
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / 'clip.wav'
        with wave.open(str(wav), 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sr)
            w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-ac', '1', '-codec:a', 'libmp3lame',
                        '-b:a', '48k', str(dst)], check=True)


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                         capture_output=True, text=True, check=True).stdout
    return round(float(out), 2)


def write_manifest(lines, known):
    clips = {l['id']: known[l['id']] for l in lines if l['id'] in known and (OUT / f"{l['id']}.mp3").exists()}
    MANIFEST.write_text(json.dumps({'clips': dict(sorted(clips.items()))}, indent=1) + '\n')
    return len(clips)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--only', default='')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--phonemes', action='store_true')
    args = ap.parse_args()

    lines = json.loads(LINES.read_text())
    missing = sorted({l['speaker'] for l in lines} - set(CAST))
    if missing:
        sys.exit(f'no voice cast for: {missing}')
    only = set(filter(None, args.only.split(',')))
    OUT.mkdir(parents=True, exist_ok=True)
    known = json.loads(MANIFEST.read_text()).get('clips', {}) if MANIFEST.exists() else {}

    wanted = {l['id'] for l in lines}
    for old in OUT.glob('*.mp3'):                                # lines that were rewritten or removed
        if old.stem not in wanted:
            old.unlink()
            print('removed', old.name)
    for l in lines:                                             # clips on disk the manifest does not know yet
        p = OUT / f"{l['id']}.mp3"
        if p.exists() and l['id'] not in known:
            known[l['id']] = probe(p)

    todo = [l for l in lines if (not only or l['speaker'] in only)
            and (args.force or args.phonemes or not (OUT / f"{l['id']}.mp3").exists())]
    if args.limit:
        todo = todo[:args.limit]
    if not todo:
        print(f'nothing to record; manifest lists {write_manifest(lines, known)} clips')
        return

    from kokoro_onnx import Kokoro
    kokoro = Kokoro(str(fetch(MODEL)), str(fetch(VOICES)))
    if args.phonemes:
        for l in todo:
            said = speakable(l['text'])
            print(f"{l['id']}\n  {said}\n  {kokoro.tokenizer.phonemize(said, CAST[l['speaker']]['lang'])}")
        return

    print(f'recording {len(todo)} of {len(lines)} lines', flush=True)
    for i, l in enumerate(todo, 1):
        cast = CAST[l['speaker']]
        samples, sr = kokoro.create(speakable(l['text']), voice=cast['voice'], speed=cast['speed'], lang=cast['lang'])
        x = master(samples, sr)
        encode(x, sr, OUT / f"{l['id']}.mp3")
        known[l['id']] = round(len(x) / sr, 2)
        print(f"[{i}/{len(todo)}] {l['id']} {known[l['id']]:5.2f}s  {l['text'][:60]}", flush=True)
        if i % 20 == 0:
            write_manifest(lines, known)
    print(f'done: manifest lists {write_manifest(lines, known)} of {len(lines)} lines')


if __name__ == '__main__':
    main()
