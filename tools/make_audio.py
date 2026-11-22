#!/usr/bin/env python3
"""Episode audio: voice cut to the kept ranges, CC0 effects for visible actions, BGM looped on bar lines and ducked under the voice.
Usage: make_audio.py EPISODE_DIR
episode.json: source, segs; optional bgm {file, bpm, beats_per_bar, intro_end, outro_start, level_lufs}.
sfx.json (in the episode dir): [{"t": SOURCE_SECONDS, "type": "pen|card|click|whoosh|slide|switch|tick|type|boom|blocks", "pan": -1..1}]
  Events outside the kept ranges are dropped. At most two "boom" in a film (mix_lib.py enforces it).
Writes build/audio/{voice,bgm,sfx,mix}.wav and build/events.json (film time)."""
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from _ep import Episode, FP, run

ep = Episode(sys.argv[1]); A = ep.build / "audio"; A.mkdir(exist_ok=True); D = ep.duration; segs = ep.segs
parts = "".join(f"[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st={b - a - 0.02}:d=0.02[s{i}];" for i, (a, b) in enumerate(segs))
run("-i", str(ep.path("source")), "-filter_complex", parts + "".join(f"[s{i}]" for i in range(len(segs))) + f"concat=n={len(segs)}:v=0:a=1,aresample=48000,loudnorm=I=-16:TP=-2:LRA=11[o]",
    "-map", "[o]", "-ac", "2", "-c:a", "pcm_s16le", str(A / "voice.wav"))

events = []
sfx_file = ep.dir / "sfx.json"
if sfx_file.exists():
    for e in json.loads(sfx_file.read_text()):
        if ep.inside(e["t"]): events.append({**e, "t": round(ep.film(e["t"]), 3)})
events.sort(key=lambda e: e["t"]); (ep.build / "events.json").write_text(json.dumps(events))
subprocess.run([sys.executable, str(Path(__file__).parents[1] / "audio/mix_lib.py"), str(ep.build / "events.json"), str(D), str(A / "sfx.wav")], check=True)

inputs = ["-i", str(A / "voice.wav"), "-i", str(A / "sfx.wav")]
mixf = "[0:a]asplit[v][key];[1:a]volume=-5dB[f];"
bgm = ep.cfg.get("bgm")
if bgm:
    # Intro once, then the body repeated on whole bars, ending on the track's own outro. Crossfades sit on bar lines.
    bp = Path(bgm["file"]).expanduser(); f = str(bp if bp.is_absolute() else ep.dir / bp); bar = 60 / bgm.get("bpm", 110) * bgm.get("beats_per_bar", 4)
    i0, o0 = bgm.get("intro_end", 0), bgm.get("outro_start")
    total = float(subprocess.run([FP, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], capture_output=True, text=True).stdout)
    o0 = o0 if o0 is not None else total
    body = i0 + max(1, int((o0 - i0) / bar)) * bar
    pieces, have = [(0, body)], body
    while have + (total - o0) < D: pieces.append((i0, body)); have += body - i0
    pieces.append((o0, total))
    chain = "".join(f"[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS[p{i}];" for i, (a, b) in enumerate(pieces)); cur = "p0"
    for i in range(1, len(pieces)): chain += f"[{cur}][p{i}]acrossfade=d=0.3:c1=tri:c2=tri[x{i}];"; cur = f"x{i}"
    run("-i", f, "-filter_complex", chain + f"[{cur}]atrim=0:{D},afade=t=out:st={D - 1.6}:d=1.6,loudnorm=I={bgm.get('level_lufs', -27)}:TP=-3:LRA=11[o]",
        "-map", "[o]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(A / "bgm.wav"))
    inputs += ["-i", str(A / "bgm.wav")]
    mixf += "[2:a][key]sidechaincompress=threshold=0.02:ratio=4:attack=60:release=600:makeup=1[m];[v][m][f]amix=inputs=3"
else:
    mixf += "[v][f]amix=inputs=2"
run(*inputs, "-filter_complex", mixf + ":normalize=0:duration=first,alimiter=limit=0.84,volume=-1.6dB[o]", "-map", "[o]", "-ar", "48000", "-c:a", "pcm_s16le", str(A / "mix.wav"))
print(f"{len(events)} effects, film {D:.2f} s, bgm {'on' if bgm else 'off'} -> build/audio/mix.wav")
