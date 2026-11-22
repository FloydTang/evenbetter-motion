#!/usr/bin/env python3
"""Subtitle files for platforms: Chinese, English and bilingual SRT from subtitles.json (film time).
Usage: make_srt.py EPISODE_DIR   ->  out/subtitles_zh.srt, out/subtitles_en.srt, out/subtitles_zh_en.srt
Use the English SRT when the film is posted overseas with burned-in Chinese only, or upload it as a caption track."""
import json, sys
from pathlib import Path
d = Path(sys.argv[1]); subs = json.loads((d / "subtitles.json").read_text()); out = d / "out"; out.mkdir(exist_ok=True)
ts = lambda t: f"{int(t // 3600):02d}:{int(t % 3600 // 60):02d}:{int(t % 60):02d},{int(round(t % 1 * 1000)) % 1000:03d}"
def write(name, text_of):
    rows = [(x, text_of(x)) for x in subs if text_of(x)]
    (out / name).write_text("".join(f"{i}\n{ts(x['s'])} --> {ts(x['e'])}\n{tx}\n\n" for i, (x, tx) in enumerate(rows, 1)), encoding="utf-8")
    return len(rows)
n = write("subtitles_zh.srt", lambda x: x["text"])
m = write("subtitles_en.srt", lambda x: x.get("en", ""))
write("subtitles_zh_en.srt", lambda x: x["text"] + ("\n" + x["en"] if x.get("en") else ""))
print(f"{n} Chinese lines, {m} with English -> {out}")
if m < n: print(f"warning: {n - m} lines have no English yet")
