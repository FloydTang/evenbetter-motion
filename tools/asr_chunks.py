"""Sliding-window ASR (FunASR Paraformer, Chinese). Whole-file timestamps drifted ~8 s over 3 min; 16 s windows stay accurate.
Usage: asr_chunks.py AUDIO_16k_mono.wav tokens.json ["hotword hotword ..."]
Writes [{"t": token, "s": start_sec, "e": end_sec}, ...]"""
import json, re, sys, wave
import numpy as np
from funasr import AutoModel

wav_path, out = sys.argv[1], sys.argv[2]
WIN, HOP = 16.0, 12.0
# Optional third argument: space-separated hotwords (product names, people, jargon) the model should prefer.
HOTWORD = sys.argv[3] if len(sys.argv) > 3 else ""

with wave.open(wav_path) as w:
    sr = w.getframerate()
    pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
dur = len(pcm) / sr

m = AutoModel(model="iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
              disable_update=True)

tok_re = re.compile(r"[A-Za-z0-9']+|[^\sA-Za-z0-9']")
tokens = []
t0 = 0.0
while t0 < dur:
    a, b = int(t0 * sr), int(min(t0 + WIN, dur) * sr)
    res = m.generate(input=pcm[a:b], hotword=HOTWORD, cache={})[0]
    toks = tok_re.findall(res.get("text", ""))
    stamps = res.get("timestamp", [])
    if len(toks) != len(stamps):
        print(f"WARN {t0:.0f}s tokens {len(toks)} stamps {len(stamps)}", file=sys.stderr)
    keep_lo = t0 + (WIN - HOP) / 2 if t0 > 0 else 0
    keep_hi = t0 + WIN - (WIN - HOP) / 2 if t0 + WIN < dur else dur + 1
    for tok, (s, e) in zip(toks, stamps):
        s, e = t0 + s / 1000, t0 + e / 1000
        if keep_lo <= (s + e) / 2 < keep_hi:
            tokens.append({"t": tok, "s": round(s, 3), "e": round(e, 3)})
    t0 += HOP

json.dump(tokens, open(out, "w"), ensure_ascii=False, indent=0)
line, start = "", None
for k in tokens:
    start = start if start is not None else k["s"]
    line += k["t"]
    if len(line) >= 22:
        print(f'{start:7.2f}  {line}')
        line, start = "", None
if line:
    print(f'{start:7.2f}  {line}')
print(f"END {tokens[-1]['e']:.2f} / dur {dur:.2f}")
