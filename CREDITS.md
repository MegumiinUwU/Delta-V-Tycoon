# Credits

Every asset in the game, who made it and how. Generative tools are disclosed as required by the NASA Space Apps code of ethics.

## Art (all on the ENDESGA 32 palette by ENDESGA, via lospec.com)

| Assets | Made by | How |
| --- | --- | --- |
| `public/assets/characters/` (53 files, except the guest crew below): crew portraits, idle and spacesuit sprites | Team (character art) with Claude (Anthropic) | Pixel-by-pixel Python script from the written character sheets |
| `public/assets/characters/*_(teto\|miku\|neru)_*.png` (15): guest crew Kasane Teto, Hatsune Miku, Akita Neru | Team (chibi sprites) | The team's own chibi pixel art, recovered to its native pixels (`scripts/art/source/`) and placed by `scripts/art/exact_crew.py`; not on the ENDESGA palette. Hatsune Miku © Crypton Future Media, INC. (piapro.net, Piapro Character License); Kasane Teto © TWINDRILL; Akita Neru is a fan-created character |
| `public/assets/items/` (52), `public/assets/icons/` (20), UI kit tiles | Team asset artist | Drawn by the artist; recovered to exact pixels and palette by `scripts/art/recover_previews.py`; UI tiles redrawn by `scripts/art/ui_kit.py` |
| `public/assets/bg/`, `planets/`, `lv/`, `fx/`, `sc/`, `events/`, `scenarios/`, `ui/logo_deltav.png`, `ui/favicon.png`, `ui/og_image.png` | Team with Claude (Anthropic) | Procedural pixel art, `scripts/art/env_art.py`: code shapes, ordered dithering, palette only, no image-generation model. Earth coastlines are hand-traced coarse outlines of Africa, Arabia and Europe |

## Audio

| Assets | Made by | How |
| --- | --- | --- |
| `public/assets/audio/voice_miku.wav`, `voice_teto.wav`, `voice_neru.wav` | Team with Claude (Anthropic) | Original hover voices sung by a small formant synthesiser in `scripts/audio/crew_voices.py` (no samples, no voicebanks, no AI model) |
| `public/assets/audio/sfx_*.mp3` (9) | Team with Claude (Anthropic) | Synthesised from square/sine waves and noise in `scripts/art/sfx.py` |
| `public/assets/voice/*.mp3` (318 character voice lines) | Team with Claude (Anthropic) | **AI-generated speech**: Kokoro-82M (Apache-2.0, [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)), an open text-to-speech model, run locally on the CPU through kokoro-onnx (MIT) by `scripts/art/voice_kokoro.py`. One stock Kokoro voice per character (the cast is in that script); no real person's voice was recorded or cloned. The lines are the game's own text (`scripts/art/voice_lines.json`) |
| `public/assets/audio/music_menu.mp3`, `music_ops.mp3` | Team with Claude (Anthropic) | Chiptune loops synthesised in `scripts/art/music_chip.py` (no samples, no AI model). An ACE-Step 1.5 (MIT, AI music model) version can be generated with `scripts/art/music_acestep.py`; if it replaces these files, this row must say so |

## Fonts

- **Press Start 2P** by CodeMan38 — SIL Open Font License 1.1 (via @fontsource/press-start-2p)
- **VT323** by Peter Hull — SIL Open Font License 1.1 (via @fontsource/vt323)

## Code and libraries

React, React DOM, Zustand, Recharts, Firebase JS SDK, lz-string, Vite, Vitest, TypeScript — see `package.json`; all under their own open-source licences.

## Tools

Claude Code (Anthropic) · Claude Code Game Studios skills (MIT, github.com/Donchitos/Claude-Code-Game-Studios) · ACE-Step 1.5 (MIT) · Kokoro-82M (Apache-2.0) with kokoro-onnx (MIT) · Python, Pillow, NumPy · ffmpeg.

No agency logos are used anywhere in the game.
