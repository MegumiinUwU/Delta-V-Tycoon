"""Generate the two background-music loops with ACE-Step 1.5 (MIT, https://github.com/ace-step/ACE-Step-1.5).

Run with ACE-Step's own environment (Python 3.12 + its deps), from the ACE-Step checkout:
    cd <ACE-Step-1.5> && uv run python <repo>/scripts/art/music_acestep.py <repo>/public/assets/audio
Low-VRAM setup (4 GB laptop GPU): 2B turbo DiT only (no 5 Hz LM planner), INT8 weights, CPU offload.
The output is AI-generated music: it is disclosed in README "Tools used" and CREDITS.md.
"""
import os
import subprocess
import sys
from pathlib import Path

out_dir = Path(sys.argv[1]).resolve()
work = out_dir / '_ace_tmp'
work.mkdir(parents=True, exist_ok=True)

from acestep.handler import AceStepHandler  # noqa: E402
from acestep.llm_inference import LLMHandler  # noqa: E402
from acestep.inference import GenerationConfig, GenerationParams, generate_music  # noqa: E402

TRACKS = {
    'music_menu': dict(
        caption=('calm hopeful retro synthwave instrumental for a space exploration game menu, warm analog pads, '
                 'soft arpeggiated chiptune lead, gentle sub bass, slow steady beat, wonder and curiosity, loopable'),
        bpm=92, duration=64, keyscale='C major', seed=4242),
    'music_ops': dict(
        caption=('focused ambient electronic instrumental for mission control operations, pulsing sequenced synth bass, '
                 'subtle 8-bit blips, airy pads, light percussion, calm tension, steady and loopable, no vocals'),
        bpm=104, duration=64, keyscale='A minor', seed=1717),
}

dit = AceStepHandler()
msg, ok = dit.initialize_service(project_root=os.getcwd(), config_path='acestep-v15-turbo', device='auto',
                                 offload_to_cpu=True, offload_dit_to_cpu=True, quantization='int8_weight_only')
print('DiT init:', ok, msg)
if not ok:
    sys.exit(1)
llm = LLMHandler()   # not initialised: LM planner disabled for <=6 GB GPUs

for name, t in TRACKS.items():
    params = GenerationParams(caption=t['caption'], lyrics='[Instrumental]', instrumental=True, bpm=t['bpm'],
                              keyscale=t['keyscale'], timesignature='4', duration=t['duration'], seed=t['seed'],
                              inference_steps=8, thinking=False, use_cot_metas=False, use_cot_caption=False,
                              use_cot_language=False)
    cfg = GenerationConfig(batch_size=1, use_random_seed=False, seeds=[t['seed']], audio_format='wav')
    res = generate_music(dit, llm, params, cfg, save_dir=str(work))
    if not res.success:
        print(name, 'FAILED:', res.error)
        continue
    src = res.audios[0]['path']
    dst = out_dir / f'{name}.mp3'
    # gentle 1.5 s fade in/out so the loop seam is soft; 128 kbps stereo mp3
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-af',
                    f"afade=t=in:d=1.5,afade=t=out:st={t['duration'] - 2}:d=2,loudnorm=I=-18:TP=-2",
                    '-codec:a', 'libmp3lame', '-b:a', '128k', str(dst)], check=True)
    print(name, '->', dst, os.path.getsize(dst) // 1024, 'KB')
