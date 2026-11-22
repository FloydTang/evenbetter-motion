"""Shared helpers for episode tools: read episode.json, resolve paths, map source time <-> film time."""
import json, os, subprocess
from pathlib import Path


def tool(name):
    env = os.environ.get(name.upper())
    if env: return env
    local = Path.home() / ".local/bin" / name
    return str(local) if local.exists() else name


FF, FP = tool("ffmpeg"), tool("ffprobe")


class Episode:
    def __init__(self, d):
        self.dir = Path(d).resolve()
        self.cfg = json.loads((self.dir / "episode.json").read_text())
        self.build = self.dir / "build"; self.build.mkdir(exist_ok=True)

    def path(self, key):
        v = self.cfg.get(key)
        if not v: return None
        p = Path(os.path.expanduser(v))
        return p if p.is_absolute() else (self.dir / p).resolve()

    @property
    def segs(self): return self.cfg["segs"]

    @property
    def duration(self): return sum(b - a for a, b in self.segs)

    def film(self, t):
        f = 0.0
        for a, b in self.segs:
            if t <= b: return f + max(0.0, t - a)
            f += b - a
        return f

    def inside(self, t): return any(a <= t <= b for a, b in self.segs)


def run(*args): subprocess.run([FF, "-nostdin", "-v", "error", "-y", *args], check=True)
