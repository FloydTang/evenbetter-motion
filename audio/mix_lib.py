#!/usr/bin/env python3
"""Sound effects from real CC0 recordings (lib/cues), one for each event a scene emits. Music is added by the user afterwards, so this writes only the effects track.
Usage: mix_lib.py EVENTS.json DURATION OUT.wav"""
import json, re, subprocess, sys, tempfile, wave
import os
from pathlib import Path
import numpy as np
from scipy import signal

events_path, duration, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
# Optional: --bgm FILE [--bgm-start S] puts the music under the effects, faded out at the end.
BGM = sys.argv[sys.argv.index("--bgm") + 1] if "--bgm" in sys.argv else None
BGM_START = float(sys.argv[sys.argv.index("--bgm-start") + 1]) if "--bgm-start" in sys.argv else 0.0
LIB = Path(__file__).parent / "cues"
def _tool(name):
    """ffmpeg/ffprobe: $FFMPEG/$FFPROBE, else ~/.local/bin, else PATH."""
    env = os.environ.get(name.upper())
    if env: return env
    local = Path.home() / ".local/bin" / name
    return str(local) if local.exists() else name
FF = _tool("ffmpeg")
SR = 48000
rng = np.random.default_rng(23)


def load(name):
    with wave.open(str(LIB / f"{name}.wav")) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, 2).astype(np.float64) / 32768


def tt(d):
    return np.arange(int(SR * d)) / SR


def bp(x, lo, hi):
    return signal.sosfilt(signal.butter(2, [lo / (SR / 2), hi / (SR / 2)], "bandpass", output="sos"), x)


def lp(x, fc):
    return signal.sosfilt(signal.butter(2, fc / (SR / 2), "low", output="sos"), x)


def fade(x, d):
    n = min(int(d * SR), len(x) // 2)
    e = np.ones(len(x)); e[:n] = np.linspace(0, 1, n); e[-n:] = np.linspace(1, 0, n)
    return x * e


def mono(x):
    return np.stack([x, x], 1)


def blocks(_):
    x = np.zeros((int(SR * .5), 2)); tick = load("tick")
    for _i in range(12):
        p = int(rng.uniform(0, .4) * SR); n = min(len(tick), len(x) - p)
        x[p:p + n] += tick[:n] * rng.uniform(.3, 1)
    return x


KEYS = sorted(p.stem for p in LIB.glob("type_*.wav"))
state = {"key": -1, "sheet": 0}


def one_of(e):
    kind = e["type"]
    if kind == "type":
        # Never the same key twice running.
        k = rng.integers(len(KEYS))
        if k == state["key"]:
            k = (k + 1) % len(KEYS)
        state["key"] = k
        return load(KEYS[k])
    if kind == "sheet":
        state["sheet"] += 1
        return load("sheet_a" if state["sheet"] % 2 else "sheet_b")
    made = {"blocks": blocks}.get(kind, lambda _: load(kind))(e)
    if kind in ("motor", "steam", "machine", "hall", "hum", "static") and "dur" in e:
        # Beds: repeat with a short overlap until they last as long as the thing on screen.
        n, xf = int(e["dur"] * SR), int(.12 * SR)
        out, pos = np.zeros((n, 2)), 0
        ramp_up = np.linspace(0, 1, xf)[:, None]
        while pos < n:
            take = min(len(made), n - pos)
            piece = made[:take].copy()
            if pos and take >= xf:
                piece[:xf] *= ramp_up
            out[pos:pos + take] += piece
            pos += max(take - xf, 1)
        k = int(.25 * SR)
        out[:k] *= np.linspace(0, 1, k)[:, None]; out[-k:] *= np.linspace(1, 0, k)[:, None]
        return out
    return made


# Level while the sound plays, against full scale. Long beds sit lowest; hits that mark a change sit highest.
LEVEL = dict(type=-31, tick=-34, click=-22, sheet=-27, slide=-27, pen=-31, card=-23, whoosh=-28, switch=-26, boom=-17,
             blocks=-28, collapse=-25, crt_on=-27, hum=-41, static=-37, motor=-30, steam=-32, machine=-32, hall=-36)
VARY = {"type", "tick", "sheet", "pen", "card"}  # small changes so repeated sounds do not read as one sample

N = int(duration * SR) + SR * 4
mix = np.zeros((N, 2))
events = json.loads(Path(events_path).read_text())
assert sum(e["type"] == "boom" for e in events) <= 2, "at most two low booms in a film"
last_key = -1.0
for e in events:
    # Fast type gets a key about every other character: a click on each one reads as a machine gun.
    if e["type"] == "type":
        if e["t"] - last_key < .11:
            continue
        last_key = e["t"]
    s = one_of(e)
    gain = 0.0
    if e["type"] in VARY:
        speed = rng.uniform(.96, 1.04); gain = rng.uniform(-1.5, 1.5)
        idx = np.arange(0, len(s) - 1, speed)
        s = np.stack([np.interp(idx, np.arange(len(s)), s[:, c]) for c in (0, 1)], 1)
    m = np.abs(s).mean(1)
    rms = float(np.sqrt((m[m > m.max() * .05] ** 2).mean()))
    s = s * 10 ** ((LEVEL[e["type"]] + gain) / 20) / max(rms, 1e-9)
    pan = float(np.clip(e.get("pan", 0), -1, 1))
    i = int(e["t"] * SR); n = min(len(s), N - i)
    mix[i:i + n, 0] += s[:n, 0] * np.sqrt((1 - pan) / 2) * 1.414
    mix[i:i + n, 1] += s[:n, 1] * np.sqrt((1 + pan) / 2) * 1.414
mix = mix[:int(duration * SR)]
TARGET = -14 if BGM else -22
with tempfile.TemporaryDirectory() as d:
    raw = Path(d) / "raw.wav"
    with wave.open(str(raw), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
    if BGM:
        # Effects sit about 6 dB under the music; the music fades over the last 1.5 s.
        mixed = Path(d) / "mixed.wav"
        subprocess.run([FF, "-nostdin", "-v", "error", "-y", "-ss", str(BGM_START), "-i", BGM, "-i", str(raw), "-filter_complex",
                        f"[0:a]aresample=48000,atrim=0:{duration},afade=t=out:st={max(0, duration - 1.5)}:d=1.5,volume=-3dB[m];[1:a]volume=-7dB[s];[m][s]amix=inputs=2:normalize=0:duration=first[o]",
                        "-map", "[o]", "-c:a", "pcm_s16le", str(mixed)], check=True)
        raw = mixed
    r = subprocess.run([FF, "-nostdin", "-hide_banner", "-i", str(raw), "-af", f"loudnorm=I={TARGET}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
    st = json.loads(r[r.rfind("{"):r.rfind("}") + 1])
    flt = (f"loudnorm=I={TARGET}:TP=-1.5:LRA=11:measured_I={st['input_i']}:measured_TP={st['input_tp']}:measured_LRA={st['input_lra']}:measured_thresh={st['input_thresh']}:offset={st['target_offset']}:linear=true")
    subprocess.run([FF, "-nostdin", "-v", "error", "-y", "-i", str(raw), "-af", flt, "-ar", "48000", "-c:a", "pcm_s24le", out], check=True)
chk = subprocess.run([FF, "-nostdin", "-hide_banner", "-i", out, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
lufs = re.findall(r"I:\s+(-?[\d.]+) LUFS", chk)[-1]; peak = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", chk)[-1]
print(f"{len(events)} events | {lufs} LUFS | peak {peak} dBFS")
