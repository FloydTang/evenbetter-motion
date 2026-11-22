#!/usr/bin/env python3
"""Cut one screen-recording segment to 30 fps JPEG frames, cropped and scaled, with privacy blur baked in.
Usage: rec_segment.py EPISODE_DIR NAME START END --crop W:H:X:Y [--width 1600] [--blur X:Y:W:H ...] [--src FILE]
START/END are seconds in the recording. Writes build/rec/NAME/000000.jpg ... (blur boxes are in output pixels).
Also writes build/rec/NAME.json {"frames": N} so the renderer knows the clip length.
Uses the trim filter, not -ss: screen recordings are variable frame rate and input seeking lands on the wrong frames."""
import argparse, shutil, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from _ep import Episode, run

ap = argparse.ArgumentParser(); ap.add_argument("ep"); ap.add_argument("name"); ap.add_argument("start", type=float); ap.add_argument("end", type=float)
ap.add_argument("--crop", required=True); ap.add_argument("--width", type=int, default=1600); ap.add_argument("--blur", nargs="*", default=[]); ap.add_argument("--src")
a = ap.parse_args(); ep = Episode(a.ep)
src = a.src or str(ep.path("recording"))
out = ep.build / "rec" / a.name
if out.exists(): shutil.rmtree(out)
out.mkdir(parents=True)
f = f"trim=start={a.start}:end={a.end},setpts=PTS-STARTPTS,fps=30,crop={a.crop},scale={a.width}:-2:flags=lanczos"
for i, b in enumerate(a.blur):
    x, y, w, h = b.split(":")
    r = max(2, min(20, int(min(int(w), int(h)) / 4)))
    f += f",split[m{i}][c{i}];[c{i}]crop={w}:{h}:{x}:{y},boxblur={r}:3[b{i}];[m{i}][b{i}]overlay={x}:{y}"
run("-i", src, "-filter_complex", f, "-q:v", "2", "-start_number", "0", str(out / "%06d.jpg"))
n = len(list(out.glob("*.jpg")))
(out.parent / f"{a.name}.json").write_text(__import__("json").dumps({"frames": n, "src": [a.start, a.end]}))
print(a.name, n, "frames")
