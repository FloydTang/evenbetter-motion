#!/usr/bin/env python3
"""Person matte from a green-screen version of the talk. No model, no network.

Usage: matte_green.py SRC OUT_DIR --start S --end E

Writes OUT_DIR/fg/NNNNNN.jpg (colour with green removed from edges) and OUT_DIR/alpha/NNNNNN.jpg.
NNNNNN is the source frame number, so segments can run in parallel.
"""
import argparse, subprocess
import os
from pathlib import Path
import numpy as np
from scipy import ndimage as ndi

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("out")
ap.add_argument("--start", type=float, required=True)
ap.add_argument("--end", type=float, required=True)
ap.add_argument("--fps", type=float, default=30.0)
ap.add_argument("--top", type=int, default=4, help="rows of black border at the top")
args = ap.parse_args()

def _tool(name):
    """ffmpeg/ffprobe: $FFMPEG/$FFPROBE, else ~/.local/bin, else PATH."""
    env = os.environ.get(name.upper())
    if env: return env
    local = Path.home() / ".local/bin" / name
    return str(local) if local.exists() else name
FF = _tool("ffmpeg")
W, H = 1080, 1920
OUT = Path(args.out)
(OUT / "fg").mkdir(parents=True, exist_ok=True)
(OUT / "alpha").mkdir(parents=True, exist_ok=True)


def smoothstep(a, b, v):
    u = np.clip((v - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


def matte(img):
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    # How far a pixel is from the green, against the green actually around this frame's edges.
    spill = g - np.maximum(r, b)
    full = float(np.median(spill[:400:7, ::7]))
    alpha = np.clip(1 - spill / max(full, 60), 0, 1)
    alpha[: args.top + 1, :] = 0

    solid = alpha > .5
    lab, n = ndi.label(solid)
    if n > 1:
        sizes = ndi.sum(solid, lab, range(1, n + 1))
        solid = np.isin(lab, 1 + np.flatnonzero(sizes > 4000))
    # Green specks inside the body are compression. Real gaps, like under the arm, are far bigger.
    holes, nh = ndi.label(ndi.binary_fill_holes(solid) & ~solid)
    if nh:
        area = ndi.sum(holes > 0, holes, range(1, nh + 1))
        solid |= np.isin(holes, 1 + np.flatnonzero(area < 300))
    core = ndi.binary_erosion(solid, iterations=3)
    keep = ndi.binary_dilation(solid, iterations=3)

    alpha = np.where(core, 1.0, alpha) * keep
    alpha = ndi.gaussian_filter(alpha.astype(np.float32), .7)
    alpha = smoothstep(.22, .92, alpha).astype(np.float32)

    # Edge colour comes from just inside the person, so no green or old background is left to glow.
    m = core.astype(np.float32)
    weight = ndi.gaussian_filter(m, 3.0)
    inner = np.stack([ndi.gaussian_filter(img[..., c] * m, 3.0) for c in range(3)], -1) / np.maximum(weight[..., None], 1e-3)
    fg = np.where(core[..., None], img, inner)
    fg[..., 1] = np.minimum(fg[..., 1], np.maximum(fg[..., 0], fg[..., 2]) + 6)
    return alpha, fg


def encoder(pattern, start_no, pix_fmt):
    return subprocess.Popen(
        [FF, "-nostdin", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", pix_fmt, "-s", f"{W}x{H}", "-r", "30", "-i", "-",
         "-start_number", str(start_no), "-q:v", "2", "-f", "image2", pattern], stdin=subprocess.PIPE)


first = round(args.start * args.fps)
last = round(args.end * args.fps)
dec = subprocess.Popen(
    [FF, "-nostdin", "-v", "error", "-ss", f"{first / args.fps:.6f}", "-i", args.src, "-frames:v", str(last - first),
     "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
fg_enc = encoder(str(OUT / "fg/%06d.jpg"), first, "rgb24")
al_enc = encoder(str(OUT / "alpha/%06d.jpg"), first, "gray")

n = first
while True:
    raw = dec.stdout.read(W * H * 3)
    if len(raw) < W * H * 3:
        break
    img = np.frombuffer(raw, np.uint8).reshape(H, W, 3).astype(np.float32)
    alpha, fg = matte(img)
    fg_enc.stdin.write(np.clip(fg, 0, 255).astype(np.uint8).tobytes())
    al_enc.stdin.write(np.clip(alpha * 255, 0, 255).astype(np.uint8).tobytes())
    n += 1
    if (n - first) % 60 == 0:
        print(f"{n}/{last}", flush=True)

fg_enc.stdin.close(); al_enc.stdin.close(); fg_enc.wait(); al_enc.wait(); dec.wait()
print(f"done {first}..{n}")
