#!/usr/bin/env python3
"""Face and hand tracking for one source video. Usage: track.py SRC OUT.json [--start S --end E]
Coordinates are pixels in the cleaned 1080x1920 frame, per source frame."""
import argparse, json, subprocess
import os
from pathlib import Path
import numpy as np
import mediapipe as mp

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--start", type=float, default=0); ap.add_argument("--end", type=float, default=1e9)
ap.add_argument("--crop", default="1070:1902:0:18")
a = ap.parse_args()
def _tool(name):
    """ffmpeg/ffprobe: $FFMPEG/$FFPROBE, else ~/.local/bin, else PATH."""
    env = os.environ.get(name.upper())
    if env: return env
    local = Path.home() / ".local/bin" / name
    return str(local) if local.exists() else name
FF = _tool("ffmpeg")
W, H, FPS = 1080, 1920, 30
first = round(a.start * FPS)
cmd = [FF, "-nostdin", "-v", "error", "-ss", f"{first/FPS:.6f}", "-i", a.src]
if a.end < 1e8:
    cmd += ["-t", f"{a.end-a.start:.3f}"]
cmd += ["-vf", f"crop={a.crop},scale={W}:{H}:flags=lanczos", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
dec = subprocess.Popen(cmd, stdout=subprocess.PIPE)
FACE_IDS = {"eyeR_o": 33, "eyeR_i": 133, "eyeL_i": 362, "eyeL_o": 263, "nose": 1, "brow": 168, "chin": 152, "top": 10, "cheekR": 234, "cheekL": 454, "lipT": 13, "lipB": 14}
HAND_IDS = {"wrist": 0, "thumb": 4, "index": 8, "middle": 12, "indexMcp": 5, "pinkyMcp": 17}
face = mp.solutions.face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1, refine_landmarks=True, min_detection_confidence=.5, min_tracking_confidence=.5)
hands = mp.solutions.hands.Hands(static_image_mode=False, max_num_hands=2, model_complexity=1, min_detection_confidence=.5, min_tracking_confidence=.5)
frames, n = [], first
while True:
    raw = dec.stdout.read(W * H * 3)
    if len(raw) < W * H * 3:
        break
    img = np.frombuffer(raw, np.uint8).reshape(H, W, 3)
    rec = {"n": n}
    r = face.process(img)
    if r.multi_face_landmarks:
        lm = r.multi_face_landmarks[0].landmark
        rec["face"] = {k: [round(lm[i].x * W, 1), round(lm[i].y * H, 1)] for k, i in FACE_IDS.items()}
    r = hands.process(img)
    if r.multi_hand_landmarks:
        rec["hands"] = []
        for hl, hd in zip(r.multi_hand_landmarks, r.multi_handedness):
            rec["hands"].append({"side": hd.classification[0].label, "score": round(hd.classification[0].score, 2),
                                 **{k: [round(hl.landmark[i].x * W, 1), round(hl.landmark[i].y * H, 1)] for k, i in HAND_IDS.items()}})
    frames.append(rec)
    n += 1
    if n % 300 == 0:
        print(n, flush=True)
Path(a.out).write_text(json.dumps({"first": first, "frames": frames}))
print("done", first, n)
