"""Original placeholder hover chime for Hatsune Miku's avatar (synthesised here, free to use).

Replace it with a licensed voice clip by dropping public/assets/audio/voice_miku.mp3 — the game prefers the .mp3
and falls back to this .wav. Run: python scripts/audio/voice_placeholder.py
"""
import math
import struct
import wave
from pathlib import Path

RATE = 22050
OUT = Path(__file__).resolve().parents[2] / 'public' / 'assets' / 'audio' / 'voice_miku.wav'


def note(freq, dur, vib=6.0, depth=0.012):
    n = int(RATE * dur)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / RATE
        f = freq * (1 + depth * math.sin(2 * math.pi * vib * t))
        phase += 2 * math.pi * f / RATE
        # bright, voice-like timbre: fundamental + soft 2nd/3rd harmonics
        s = math.sin(phase) + 0.35 * math.sin(2 * phase) + 0.15 * math.sin(3 * phase)
        env = min(1.0, t / 0.012) * math.exp(-3.2 * t / dur)   # quick attack, gentle decay
        out.append(s * env)
    return out


def main():
    samples = note(1318.5, 0.16) + [0.0] * int(RATE * 0.03) + note(1760.0, 0.26)   # E6 then A6: "mi-ku"
    peak = max(abs(s) for s in samples) or 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(s / peak * 0.6 * 32767)) for s in samples))
    print(f'wrote {OUT} ({len(samples) / RATE:.2f} s)')


if __name__ == '__main__':
    main()
