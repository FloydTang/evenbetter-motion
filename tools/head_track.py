"""Head centre per talk frame from the matte (top of the alpha + mean x of the first 260 rows below it), smoothed."""
import json, subprocess, numpy as np
import os
from pathlib import Path
def _tool(name):
    """ffmpeg/ffprobe: $FFMPEG/$FFPROBE, else ~/.local/bin, else PATH."""
    env = os.environ.get(name.upper())
    if env: return env
    local = Path.home() / ".local/bin" / name
    return str(local) if local.exists() else name
FF = _tool("ffmpeg")
al = sorted(Path("build/person/alpha").glob("*.jpg")); nums = [int(a.stem) for a in al]
runs = []; s0 = nums[0]
for x, y in zip(nums, nums[1:]):
    if y != x + 1: runs.append((s0, x)); s0 = y
runs.append((s0, nums[-1]))
out = {}
for a0, a1 in runs:
    p = subprocess.Popen([FF, "-nostdin", "-v", "error", "-start_number", str(a0), "-i", "build/person/alpha/%06d.jpg", "-frames:v", str(a1 - a0 + 1), "-vf", "scale=270:480", "-f", "rawvideo", "-pix_fmt", "gray", "-"], stdout=subprocess.PIPE)
    n = a0
    while True:
        raw = p.stdout.read(270 * 480)
        if len(raw) < 270 * 480: break
        m = np.frombuffer(raw, np.uint8).reshape(480, 270)[:300] > 128
        rows = np.flatnonzero(m.any(1))
        if len(rows):
            top = rows[0]; xs = np.nonzero(m[top:top + 65])[1]
            out[n] = [float(xs.mean() * 4), float(top * 4)]
        n += 1
keys = sorted(out); xs = np.array([out[k][0] for k in keys]); ys = np.array([out[k][1] for k in keys])
k = np.ones(15) / 15; xs = np.convolve(np.pad(xs, 7, mode="edge"), k, "valid"); ys = np.convolve(np.pad(ys, 7, mode="edge"), k, "valid")
json.dump({str(kk): [round(x, 1), round(y, 1)] for kk, x, y in zip(keys, xs, ys)}, open("build/head.json", "w"))
print(len(keys), xs.min(), xs.max(), ys.min(), ys.max())
