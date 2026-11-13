"""Fallback chiptune music loops (music_menu, music_ops), synthesised from scratch — no samples, no AI model.
Used until/unless the ACE-Step 1.5 tracks (scripts/art/music_acestep.py) replace them.
Run: python scripts/art/music_chip.py   (numpy + ffmpeg)
"""
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parents[2] / 'public' / 'assets' / 'audio'


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def osc(kind, f, n, duty=0.5, phase0=0.0):
    ph = (phase0 + np.arange(n) * f / SR) % 1.0
    if kind == 'sq':
        return np.where(ph < duty, 1.0, -1.0)
    if kind == 'tri':
        return 4 * np.abs(ph - 0.5) - 1
    if kind == 'saw':
        return 2 * ph - 1
    return np.sin(2 * np.pi * ph)


def adsr(n, a=0.01, d=0.08, s=0.6, r=0.05):
    e = np.full(n, s)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = min(na, n); e[:na] = np.linspace(0, 1, na)
    nd = min(nd, max(0, n - na)); e[na:na + nd] = np.linspace(1, s, nd)
    nr = min(nr, n); e[n - nr:] *= np.linspace(1, 0, nr)
    return e


def render(bpm, bars, chords, lead_pattern, bass_kind='tri', lead_kind='sq', lead_duty=0.25, pad=True, drums='calm', seed=0):
    beat = 60 / bpm
    step = beat / 4                       # 16th notes
    total = int(bars * 16 * step * SR)
    mix = np.zeros(total)
    rng = np.random.default_rng(seed)
    for bar in range(bars):
        root, quality = chords[bar % len(chords)]
        triad = [root, root + (3 if quality == 'm' else 4), root + 7]
        t0 = int(bar * 16 * step * SR)
        nbar = int(16 * step * SR)
        # pad: soft detuned triad, whole bar
        if pad:
            for k, nn in enumerate(triad):
                for det in (-0.12, 0.12):
                    mix[t0:t0 + nbar] += 0.05 * osc('tri', midi(nn + 12) * 2 ** (det / 12), nbar) * adsr(nbar, a=0.25, d=0.2, s=0.8, r=0.3)
        # bass: root on 1 and 3, fifth on the 'and' of 4
        for pos, nn, ln in ((0, root - 12, 6), (8, root - 12, 6), (14, root - 5, 2)):
            a = t0 + int(pos * step * SR); n = int(ln * step * SR)
            mix[a:a + n] += 0.22 * osc(bass_kind, midi(nn), n) * adsr(n, a=0.005, d=0.1, s=0.7, r=0.04)
        # lead arpeggio from the pattern (indices into triad + octave)
        for i, p in enumerate(lead_pattern):
            if p is None:
                continue
            a = t0 + int(i * step * SR); n = int(step * SR * 0.9)
            nn = triad[p % 3] + 12 * (p // 3) + 12
            mix[a:a + n] += 0.07 * osc(lead_kind, midi(nn), n, lead_duty) * adsr(n, a=0.003, d=0.05, s=0.4, r=0.03)
        # drums
        for i in range(16):
            a = t0 + int(i * step * SR)
            if i in (0, 8) or (drums == 'drive' and i in (6, 10)):
                n = int(0.12 * SR); tt = np.arange(n) / SR
                kick = np.sin(2 * np.pi * (55 + 90 * np.exp(-tt * 40)) * tt) * np.exp(-tt * 18)
                mix[a:a + n] += 0.35 * kick
            if i in (4, 12):
                n = int(0.1 * SR)
                mix[a:a + n] += 0.12 * rng.uniform(-1, 1, n) * np.exp(-np.arange(n) / SR * 30)
            if i % 2 == 0 and drums == 'drive' or (drums == 'calm' and i % 4 == 2):
                n = int(0.03 * SR)
                mix[a:a + n] += 0.04 * rng.uniform(-1, 1, n) * np.exp(-np.arange(n) / SR * 120)
    # simple feedback echo for space
    d = int(beat * 0.75 * SR)
    wet = np.zeros_like(mix)
    wet[d:] = mix[:-d] * 0.28
    wet[2 * d:] += mix[:-2 * d] * 0.12
    return mix + wet


def write(name, x):
    x = x / max(1e-9, np.max(np.abs(x))) * 0.8
    st = np.stack([x, np.roll(x, int(0.011 * SR))], 1)    # slight stereo width
    with tempfile.TemporaryDirectory() as td:
        w = Path(td) / 'm.wav'
        with wave.open(str(w), 'wb') as f:
            f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR)
            f.writeframes((st * 32767).astype(np.int16).tobytes())
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(w), '-af', 'loudnorm=I=-20:TP=-2',
                        '-codec:a', 'libmp3lame', '-b:a', '112k', str(OUT / f'{name}.mp3')], check=True)


C, D, E, F, G, A, B = 60, 62, 64, 65, 67, 69, 71
menu = render(92, 16, [(C, ''), (A - 12, 'm'), (F - 12, ''), (G - 12, '')] * 2 + [(F - 12, ''), (G - 12, ''), (E - 12, 'm'), (A - 12, 'm')] * 2,
              [0, None, 1, 2, 3, None, 2, 1, 0, None, 1, 2, 4, None, 3, 2], seed=1)
ops = render(104, 16, [(A - 12, 'm'), (F - 12, ''), (C, ''), (G - 12, '')] * 4,
             [0, 2, 1, 2, 0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, None], bass_kind='sq', lead_duty=0.125, drums='drive', seed=2)
write('music_menu', menu)
write('music_ops', ops)
print('music:', [(p.name, p.stat().st_size // 1024) for p in OUT.glob('music_*.mp3')])
