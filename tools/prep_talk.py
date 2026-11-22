#!/usr/bin/env python3
"""Talk footage prep for an episode: full frames, person matte, voice level, head track.
Usage: prep_talk.py EPISODE_DIR [--jobs 8]
Needs episode.json: source (talk video, 1080x1920), segs (kept source ranges), optional wall (matte.py --wall boxes).
Writes build/talk/NNNNNN.jpg, build/person/{fg,alpha}/, build/levels.json, build/head.json (NNNNNN = source frame at 30 fps)."""
import argparse, json, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from _ep import Episode, FF, run

ap = argparse.ArgumentParser(); ap.add_argument("ep"); ap.add_argument("--jobs", type=int, default=8); ap.add_argument("--pad", type=float, default=0.5)
a = ap.parse_args(); ep = Episode(a.ep); src = str(ep.path("source")); here = Path(__file__).parent
# Matte a little beyond each kept range so cut nudges stay covered; merge ranges that touch.
rng = []
for s, e in sorted(ep.segs):
    s, e = max(0, s - a.pad), e + a.pad
    if rng and s <= rng[-1][1]: rng[-1][1] = max(rng[-1][1], e)
    else: rng.append([s, e])
(ep.build / "talk").mkdir(exist_ok=True)
def frames(r):
    s, e = r; run("-ss", f"{s:.3f}", "-i", src, "-t", f"{e - s:.3f}", "-start_number", str(round(s * 30)), "-q:v", "2", str(ep.build / "talk/%06d.jpg"))
# split long ranges into ~20 s chunks for the matte
chunks = []
for s, e in rng:
    while s < e: chunks.append((s, min(e, s + 20))); s += 20
wall = ep.cfg.get("wall")
def matte(c):
    cmd = [sys.executable, str(here / "matte.py"), src, str(ep.build / "person"), "--start", f"{c[0]:.3f}", "--end", f"{c[1]:.3f}", "--crop", ep.cfg.get("crop", "1080:1920:0:0")]
    if wall: cmd += ["--wall", wall]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
with ThreadPoolExecutor(a.jobs) as pool:
    list(pool.map(frames, rng)); list(pool.map(matte, chunks))
# voice level per frame (for the PIP level bars)
p = subprocess.run([FF, "-nostdin", "-v", "error", "-i", src, "-ac", "1", "-ar", "48000", "-f", "s16le", "-"], capture_output=True, check=True)
x = np.frombuffer(p.stdout, np.int16).astype(float) / 32768; hop = 1600; n = len(x) // hop
lv = np.clip((20 * np.log10(np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1)) + 1e-6) + 50) / 32, 0, 1)
for i in range(1, n): lv[i] = max(lv[i], lv[i - 1] * .8)
(ep.build / "levels.json").write_text(json.dumps([round(float(v), 3) for v in lv]))
subprocess.run([sys.executable, str(here / "head_track.py")], cwd=ep.dir, check=True)
print(f"talk frames + matte for {len(rng)} ranges, {len(chunks)} chunks; levels {n}; head track done")
