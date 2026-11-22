#!/usr/bin/env python3
"""Source-time subtitles (from align_subs.py) -> film-time subtitles.json over the kept ranges in episode.json.
Usage: make_subs.py EPISODE_DIR
Reads build/subs_src.json. Optional in episode.json:
  "sub_fix":  {"line text": [start, end]}  force a line's source time (e.g. a retake ASR matched to the wrong take)
  "sub_trim": {"line text": "kept words"}  a line cut by an edge shows only the words that are kept"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from _ep import Episode

ep = Episode(sys.argv[1]); fix = ep.cfg.get("sub_fix", {}); trim = ep.cfg.get("sub_trim", {})
out = []
for x in json.loads((ep.build / "subs_src.json").read_text()):
    s, e = fix.get(x["text"], (x["s"], x["e"]))
    for a, b in ep.segs:
        ov = min(e, b) - max(s, a)
        if ov >= .45 and (ov / max(.01, e - s) >= .5 or x["text"] in trim):
            out.append({"s": round(ep.film(max(s, a)), 3), "e": round(ep.film(min(e, b)), 3), "text": trim.get(x["text"], x["text"])})
            break
for i in range(len(out) - 1): out[i]["e"] = min(out[i]["e"], out[i + 1]["s"])
(ep.dir / "subtitles.json").write_text(json.dumps(out, ensure_ascii=False, indent=0))
print(len(out), "lines; film", round(ep.duration, 2), "s")
