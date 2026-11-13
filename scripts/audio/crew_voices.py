"""Original hover "voices" for the guest crew: Hatsune Miku, Kasane Teto, Akita Neru.

A tiny formant synthesiser written here sings each name: a harmonic voice source shaped by vowel formants, plus noise
bursts for "t"/"k", a nasal hum for "m"/"n" and a tap for "r". No samples, no voicebanks, no AI model, so the files are
free to ship. The three are deliberately far apart so you can tell them apart with your eyes closed:

  Miku  high (A5-E6), bright and clean, hard digital note steps, then a sparkly bell chime     "mi-KU!" + ding
  Teto  middle (G4-D5), buzzy and punchy, three bouncy hops, the last one wobbles like a drill  "te-to-TE!"
  Neru  low (D4-A3), dark and breathy, slow falling slur, a bored sigh and two phone-key blips  "neee-ru... hh" + bip bip

Every file starts sounding on its first millisecond (no leading silence), so the hover feels instant.
Writes public/assets/audio/voice_<id>.wav (22.05 kHz, 16-bit mono).
Run: python scripts/audio/crew_voices.py   (needs numpy)
"""
import wave
from pathlib import Path

import numpy as np

SR = 22050
OUT = Path(__file__).resolve().parents[2] / 'public' / 'assets' / 'audio'
RNG = np.random.default_rng(39)  # fixed seed: the same files every run

# vowel formants (Hz) and bandwidths
VOWELS = {
    'i': ([310, 2790, 3310], [60, 110, 160]),
    'u': ([370, 950, 2670], [70, 90, 150]),
    'e': ([430, 2480, 3070], [70, 110, 160]),
    'o': ([480, 860, 2830], [80, 90, 150]),
    'm': ([260, 1100, 2500], [60, 300, 400]),   # nasal murmur
}


def midi(n):
    return 440.0 * 2 ** ((np.asarray(n, float) - 69) / 12)


def ts(d):
    return np.arange(int(SR * d)) / SR


def gap(d):
    return np.zeros(int(SR * d))


def bandnoise(n, lo, hi):
    spec = np.fft.rfft(RNG.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    spec[(f < lo) | (f > hi)] = 0
    x = np.fft.irfft(spec, n)
    return x / (np.abs(x).max() or 1)


def env(n, attack=0.004, release=0.04, decay=0.0):
    e = np.ones(n)
    a, r = max(1, int(SR * attack)), max(1, int(SR * release))
    e[:a] = np.linspace(0, 1, a)
    e[-r:] *= np.linspace(1, 0, r) ** 1.5
    return e * np.exp(-decay * np.arange(n) / SR)


def sing(f0, v1, v2, tilt=0.6, shift=1.0, breath=0.0, buzz=0.0):
    """Voiced sound on pitch curve f0 (Hz per sample), gliding from vowel v1 to v2.
    tilt: harmonic roll-off (lower = brighter); shift: formant scale (higher = smaller, brighter voice);
    breath: share of airy noise; buzz: extra odd harmonics for a reedy, punchy edge."""
    n = len(f0)
    mix = np.clip(np.linspace(-0.4, 1.4, n), 0, 1)[:, None] if v1 != v2 else np.zeros((n, 1))
    fa, ba = map(np.array, VOWELS[v1])
    fb, bb = map(np.array, VOWELS[v2])
    fs = (fa * (1 - mix) + fb * mix) * shift
    bws = ba * (1 - mix) + bb * mix
    ph = 2 * np.pi * np.cumsum(f0) / SR
    out = np.zeros(n)
    for k in range(1, 48):
        fk = k * f0
        if fk.min() > SR / 2 - 400:
            break
        g = sum((0.9 ** i) / (1 + ((fk - fs[:, i]) / bws[:, i]) ** 2) for i in range(3)) + 0.02
        g = g * (fk < SR / 2 - 400) / k ** tilt * (1 + buzz * (k % 2))
        out += g * np.sin(k * ph)
    out /= np.abs(out).max() or 1
    if breath:
        air = bandnoise(n, 1200 * shift, 4500) * (0.6 + 0.4 * np.abs(np.sin(ph / 2)))
        out = (1 - breath) * out + breath * air
    return out


def syllable(cons, vowel, f0, voice, **kw):
    v = sing(f0, 'm' if cons in 'mn' else vowel, vowel, **voice) * env(len(f0), **kw)
    if cons in 'mn':
        hum = int(SR * 0.045)
        v[:hum] *= np.linspace(0.4, 1, hum)
    if cons == 'r':
        tap = int(SR * 0.03)
        v[:tap] *= np.concatenate([np.linspace(1, 0.1, tap // 2), np.linspace(0.1, 1, tap - tap // 2)])
    if cons in 'tk':
        lo, hi = (3500, 9500) if cons == 't' else (1400, 3800)
        click = bandnoise(int(SR * 0.014), lo, hi) * np.exp(-np.linspace(0, 5, int(SR * 0.014))) * 0.45
        return np.concatenate([click, v])
    return v


def notes(seq, dur, steps=True):
    """Pitch curve through MIDI notes; steps=True jumps between them (digital), False slurs."""
    n = int(SR * dur)
    x = np.linspace(0, len(seq) - 1, n)
    curve = np.array(seq, float)[np.round(x).astype(int)] if steps else np.interp(x, range(len(seq)), seq)
    return midi(curve)


def vibrato(f0, rate, cents, delay=0.06):
    t = np.arange(len(f0)) / SR
    return f0 * 2 ** (cents / 1200 * np.sin(2 * np.pi * rate * t) * np.clip((t - delay) / 0.05, 0, 1))


def bell(freq, dur, amp):
    t = ts(dur)
    return amp * (np.sin(2 * np.pi * freq * t) + 0.4 * np.sin(2 * np.pi * freq * 2.76 * t)) * np.exp(-t * 9) \
        * np.minimum(1, t / 0.002)


def blip(freq, dur, amp):
    t = ts(dur)
    return amp * np.sign(np.sin(2 * np.pi * freq * t)) * env(len(t), 0.002, 0.01)


def miku():
    v = dict(tilt=0.45, shift=1.15)                      # bright, small, clean
    a = syllable('m', 'i', notes([81], 0.11), v, release=0.02)                          # A5
    b = syllable('k', 'u', vibrato(notes([85, 88], 0.30), 7, 35), v, release=0.10, decay=2.5)  # C#6 -> E6 (hard step)
    ding = np.concatenate([gap(0.06), bell(2637, 0.30, 0.35)])                           # E7 sparkle
    body = np.concatenate([a, gap(0.015), b])
    out = np.zeros(max(len(body), len(ding) + len(a)))
    out[:len(body)] += body
    out[len(a):len(a) + len(ding)] += ding
    return out


def teto():
    v = dict(tilt=0.8, shift=0.98, buzz=0.9)             # reedy, punchy, mid-range
    a = syllable('t', 'e', notes([67], 0.085), v, release=0.02)                          # G4
    b = syllable('t', 'o', notes([74], 0.085), v, release=0.02)                          # D5 hop up
    f = notes([71], 0.22)
    drill = f * 2 ** (0.9 / 12 * np.sin(2 * np.pi * 13 * np.arange(len(f)) / SR))       # fast wobble ("drill")
    c = syllable('t', 'e', drill, v, release=0.07, decay=1.5)                            # B4
    return np.concatenate([a, gap(0.035), b, gap(0.035), c])


def neru():
    v = dict(tilt=1.05, shift=0.92, breath=0.14)         # dark, airy, lower
    a = syllable('n', 'e', vibrato(notes([62, 61], 0.30, steps=False), 3.5, 15, 0.12), v, attack=0.02, release=0.05)
    b = syllable('r', 'u', notes([60, 55], 0.30, steps=False), v, release=0.16, decay=3)     # slurs down to G3
    sigh = bandnoise(int(SR * 0.22), 400, 2200) * np.sin(np.linspace(0, np.pi, int(SR * 0.22))) * 0.18
    phone = np.concatenate([blip(1336, 0.045, 0.16), gap(0.05), blip(1477, 0.045, 0.16)])   # two keypad blips
    return np.concatenate([a, b, gap(0.02), sigh, gap(0.05), phone])


def write(name, x, level=0.65):
    x = level * x / np.abs(x).max()
    x[: int(SR * 0.002)] *= np.linspace(0, 1, int(SR * 0.002))   # no click at the start
    x = np.concatenate([x, gap(0.02)])
    path = OUT / f'voice_{name}.wav'
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())
    print(f'wrote {path.name}  {len(x) / SR:.2f} s')


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    write('miku', miku())
    write('teto', teto())
    write('neru', neru(), level=0.6)
