#!/usr/bin/env python3
"""Give each spoken line its time from the ASR tokens. The text is the corrected text, the timing comes from ASR.
Usage: align_subs.py spoken.txt tokens.json out.json\nspoken.txt: one subtitle per line, optionally "中文 | English"."""
import difflib, json, re, sys
from pathlib import Path

raw = [l.strip() for l in Path(sys.argv[1]).read_text().splitlines() if l.strip()]
# A line may carry its English after " | ": 中文字幕 | English subtitle
lines = [l.split(" | ", 1)[0].strip() for l in raw]
en = [l.split(" | ", 1)[1].strip() if " | " in l else "" for l in raw]
tokens = json.loads(Path(sys.argv[2]).read_text())
tok_re = re.compile(r"[A-Za-z0-9']+|[一-鿿]")
a_tok = [t["t"].lower() for t in tokens]
b_tok, owner = [], []
for i, l in enumerate(lines):
    for w in tok_re.findall(l):
        b_tok.append(w.lower()); owner.append(i)
sm = difflib.SequenceMatcher(None, b_tok, a_tok, autojunk=False)
b2a = {}
for block in sm.get_matching_blocks():
    for k in range(block.size):
        b2a[block.a + k] = block.b + k
first = {}
last = {}
for bi, ln in enumerate(owner):
    if bi in b2a:
        first.setdefault(ln, b2a[bi])
        last[ln] = b2a[bi]
out, weak = [], []
for i, l in enumerate(lines):
    if i not in first:
        weak.append(l)
        out.append({"s": None, "e": None, "text": l, **({"en": en[i]} if en[i] else {})})
        continue
    n = sum(1 for o in owner if o == i)
    hit = sum(1 for bi, o in enumerate(owner) if o == i and bi in b2a)
    if hit / n < .6:
        weak.append(f"{l} ({hit}/{n})")
    out.append({"s": tokens[first[i]]["s"], "e": tokens[last[i]]["e"], "text": l, **({"en": en[i]} if en[i] else {})})
# A line stays up until the next one starts, unless there is a real pause.
for i, o in enumerate(out):
    if o["s"] is None:
        o["s"] = out[i - 1]["e"]
    nxt = next((x["s"] for x in out[i + 1:] if x["s"] is not None), None)
    if o["e"] is None:
        o["e"] = nxt
    if nxt is not None and nxt - o["e"] < .35:
        o["e"] = nxt
    o["s"], o["e"] = round(o["s"], 2), round(o["e"], 2)
Path(sys.argv[3]).write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(f"{len(out)} lines, weak matches: {weak}")
for o in out:
    print(f"{o['s']:7.2f} {o['e']:7.2f}  {o['text']}")
