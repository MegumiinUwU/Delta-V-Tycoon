"""Chiptune sound effects for Delta-V Tycoon (A15.2 audio/sfx_*.mp3), synthesised from scratch (no samples).
Run: python scripts/art/sfx.py   (needs numpy + ffmpeg on PATH; writes public/assets/audio/)
"""
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parents[2] / 'public' / 'assets' / 'audio'


def t(d):
    return np.arange(int(SR * d)) / SR


def env(n, a=0.005, r=0.08, d=None):
    e = np.ones(n)
    na, nr = int(SR * a), int(SR * r)
    e[:na] = np.linspace(0, 1, max(1, na))
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def sq(f, d, duty=0.5):
    x = t(d)
    ph = np.cumsum(np.full(len(x), f) if np.isscalar(f) else f) / SR
    return np.where((ph % 1) < duty, 1.0, -1.0)


def sweep(f0, f1, d, duty=0.5):
    n = int(SR * d)
    f = np.geomspace(f0, f1, n)
    ph = np.cumsum(f) / SR
    return np.where((ph % 1) < duty, 1.0, -1.0)


def tri(f, d):
    x = t(d)
    return 2 * np.abs(2 * ((x * f) % 1) - 1) - 1


def noise(d, seed=0):
    return np.random.default_rng(seed).uniform(-1, 1, int(SR * d))


def notes(seq, wave_fn=sq, gap=0.0):
    parts = []
    for f, d in seq:
        s = wave_fn(f, d) if f else np.zeros(int(SR * d))
        parts.append(s * env(len(s), r=min(0.05, d / 2)))
        if gap:
            parts.append(np.zeros(int(SR * gap)))
    return np.concatenate(parts)


def lowpass(x, k=8):
    return np.convolve(x, np.ones(k) / k, mode='same')


def write(name, x, vol=0.35):
    x = np.clip(x / max(1e-9, np.max(np.abs(x))) * vol, -1, 1)
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        w = Path(td) / f'{name}.wav'
        with wave.open(str(w), 'wb') as f:
            f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR)
            f.writeframes((x * 32767).astype(np.int16).tobytes())
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(w), '-codec:a', 'libmp3lame', '-b:a', '96k',
                        str(OUT / f'{name}.mp3')], check=True)


C5, E5, G5, C6, E6, G6 = 523.25, 659.25, 783.99, 1046.5, 1318.5, 1568.0

write('sfx_click', sq(1200, 0.035, 0.25) * env(int(SR * 0.035), r=0.02), 0.25)
write('sfx_hover', sq(1800, 0.02, 0.125) * env(int(SR * 0.02), r=0.015), 0.12)
write('sfx_success', notes([(C5, .08), (E5, .08), (G5, .08), (C6, .22)], lambda f, d: sq(f, d, 0.25)), 0.3)
write('sfx_fail', notes([(392, .14), (311, .14), (233, .34)], lambda f, d: sq(f, d, 0.5)), 0.3)
write('sfx_warning', notes([(880, .09), (0, .05), (880, .09)], lambda f, d: sq(f, d, 0.5)), 0.25)
write('sfx_event', notes([(E6, .06), (C6, .06), (G6, .14)], lambda f, d: sq(f, d, 0.125)), 0.3)
write('sfx_signoff', notes([(G5, .06), (C6, .12)], lambda f, d: sq(f, d, 0.25)), 0.28)
write('sfx_coin', notes([(988, .06), (1319, .2)], lambda f, d: sq(f, d, 0.5)), 0.25)
# launch: rising engine rumble (filtered noise + low sweep)
d = 2.4
n = noise(d, 3)
rum = lowpass(n, 40) * np.linspace(0.3, 1, len(n)) + 0.3 * sweep(55, 140, d, 0.5)
rum *= env(len(rum), a=0.3, r=0.6)
write('sfx_launch', rum, 0.4)
print('sfx written:', sorted(p.name for p in OUT.glob('sfx_*.mp3')))
