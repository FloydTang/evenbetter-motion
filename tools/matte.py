#!/usr/bin/env python3
"""Person matte for a locked-off shot on a plain wall. No model, no network.

Usage: matte.py SRC OUT_DIR --start S --end E [--crop W:H:X:Y]

Writes OUT_DIR/fg/NNNNNN.jpg (colour with wall removed from edges),
OUT_DIR/alpha/NNNNNN.jpg and OUT_DIR/plate-NNNNNN-NNNNNN.json (wall surface per frame).
NNNNNN is the source frame number, so segments can run in parallel.
"""
import argparse, json, subprocess
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
ap.add_argument("--crop", default="1070:1902:0:18", help="removes the black edge left by the rough cut")
ap.add_argument("--width", type=int, default=1080)
ap.add_argument("--height", type=int, default=1920)
ap.add_argument("--wall", default="0:560:0:W;0:1150:0:130;0:1150:950:W",
                help="wall-only boxes y0:y1:x0:x1 separated by ';' (W/H mean full size), used to fit the wall surface")
args = ap.parse_args()

def _tool(name):
    """ffmpeg/ffprobe: $FFMPEG/$FFPROBE, else ~/.local/bin, else PATH."""
    env = os.environ.get(name.upper())
    if env: return env
    local = Path.home() / ".local/bin" / name
    return str(local) if local.exists() else name
FF = _tool("ffmpeg")
W, H = args.width, args.height
OUT = Path(args.out)
(OUT / "fg").mkdir(parents=True, exist_ok=True)
(OUT / "alpha").mkdir(parents=True, exist_ok=True)

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
X, Y = xx / W - 0.5, yy / H - 0.5
BASIS = np.stack([np.ones_like(X), X, Y, X * X, X * Y, Y * Y], -1)
wall = np.zeros((H, W), bool)
for box in args.wall.split(";"):   # default: above the head, left and right of the head
    y0, y1, x0, x1 = (int(v.replace("W", str(W)).replace("H", str(H))) for v in box.split(":"))
    wall[y0:y1, x0:x1] = True
WALL_IDX = np.flatnonzero(wall.ravel())[::37]


def smoothstep(a, b, v):
    u = np.clip((v - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


def fit_plate(img):
    coefs = []
    B = BASIS.reshape(-1, 6)[WALL_IDX]
    for c in range(3):
        coef, *_ = np.linalg.lstsq(B, img[..., c].ravel()[WALL_IDX], rcond=None)
        coefs.append(coef)
    coefs = np.stack(coefs, 1)      # 6 x 3
    return coefs, BASIS @ coefs


def matte(img, plate):
    """Returns alpha and foreground colour. Inside the body alpha is 1. On the edge band the wall (B) is known and
    the person's colour (F) is taken from just inside, so alpha solves I = aF + (1-a)B directly."""
    d = img - plate
    luma = 0.299 * d[..., 0] + 0.587 * d[..., 1] + 0.114 * d[..., 2]
    chroma = np.hypot(d[..., 2] - luma, d[..., 0] - luma)
    # The rough cut's sharpening leaves a halo brighter than the wall with the wall's own hue.
    # Counting only "darker" and "different colour" keeps that halo out of the person.
    dist = np.maximum(-luma, 0) + 1.6 * chroma + 0.12 * np.maximum(luma, 0)
    dist = ndi.gaussian_filter(dist, 0.8)

    solid = ndi.binary_closing(dist > 22, iterations=3)
    solid = ndi.binary_fill_holes(solid)
    lab, n = ndi.label(solid)
    if n > 1:
        sizes = ndi.sum(solid, lab, range(1, n + 1))
        solid = lab == (1 + int(np.argmax(sizes)))
    core = ndi.binary_erosion(solid, iterations=4)
    keep = ndi.binary_dilation(solid, iterations=5)

    m = core.astype(np.float32)
    weight = ndi.gaussian_filter(m, 3.0)
    inner = np.stack([ndi.gaussian_filter(img[..., c] * m, 3.0) for c in range(3)], -1) / np.maximum(weight[..., None], 1e-3)
    fb = inner - plate
    solved = (d * fb).sum(-1) / np.maximum((fb * fb).sum(-1), 40.0)
    alpha = np.clip(solved, 0, 1) * keep
    alpha = np.where(core, 1.0, alpha)
    alpha = ndi.gaussian_filter(alpha, 0.6)
    alpha = smoothstep(0.08, 0.95, alpha).astype(np.float32)
    fg = np.where(core[..., None], img, inner)

    # Hair and dark clothes: grey flecks on the edge are hair mixed with wall, not lighter hair.
    deep = ndi.binary_erosion(solid, iterations=11).astype(np.float32)
    wd = ndi.gaussian_filter(deep, 7.0)
    far = np.stack([ndi.gaussian_filter(img[..., c] * deep, 7.0) for c in range(3)], -1) / np.maximum(wd[..., None], 1e-3)
    far_luma = 0.299 * far[..., 0] + 0.587 * far[..., 1] + 0.114 * far[..., 2]
    band = solid & (deep < .5) & (far_luma < 75) & (wd > .02)
    fbd = far - plate
    solved_dark = np.clip((d * fbd).sum(-1) / np.maximum((fbd * fbd).sum(-1), 40.0), 0, 1)
    alpha = np.where(band, np.minimum(alpha, smoothstep(0.12, 0.92, ndi.gaussian_filter(solved_dark, 0.7))), alpha).astype(np.float32)
    fg = np.where(band[..., None], np.minimum(fg, far + 10), fg)

    # Filling holes also fills gaps of wall between hair strands. Near the outline, wall colour stays wall.
    near_edge = solid & ~ndi.binary_erosion(solid, iterations=34)
    gaps = near_edge & (dist < 34)
    alpha = np.where(gaps, np.minimum(alpha, smoothstep(14, 34, dist)), alpha).astype(np.float32)
    return alpha, fg


def encoder(pattern, start_no, pix_fmt):
    return subprocess.Popen(
        [FF, "-nostdin", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", pix_fmt, "-s", f"{W}x{H}", "-r", "30", "-i", "-",
         "-start_number", str(start_no), "-q:v", "2", "-f", "image2", pattern], stdin=subprocess.PIPE)


first = round(args.start * args.fps)
last = round(args.end * args.fps)
dec = subprocess.Popen(
    [FF, "-nostdin", "-v", "error", "-ss", f"{first / args.fps:.6f}", "-i", args.src,
     "-frames:v", str(last - first), "-vf", f"crop={args.crop},scale={W}:{H}:flags=lanczos",
     "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
fg_enc = encoder(str(OUT / "fg/%06d.jpg"), first, "rgb24")
al_enc = encoder(str(OUT / "alpha/%06d.jpg"), first, "gray")

plates, n = [], first
while True:
    raw = dec.stdout.read(W * H * 3)
    if len(raw) < W * H * 3:
        break
    img = np.frombuffer(raw, np.uint8).reshape(H, W, 3).astype(np.float32)
    coefs, plate = fit_plate(img)
    alpha, fg = matte(img, plate)
    fg_enc.stdin.write(np.clip(fg, 0, 255).astype(np.uint8).tobytes())
    al_enc.stdin.write(np.clip(alpha * 255, 0, 255).astype(np.uint8).tobytes())
    plates.append(np.round(coefs, 3).tolist())
    n += 1
    if (n - first) % 60 == 0:
        print(f"{n}/{last}", flush=True)

fg_enc.stdin.close(); al_enc.stdin.close(); fg_enc.wait(); al_enc.wait(); dec.wait()
(OUT / f"plate-{first:06d}-{n:06d}.json").write_text(json.dumps({"first": first, "coefs": plates}))
print(f"done {first}..{n}")
