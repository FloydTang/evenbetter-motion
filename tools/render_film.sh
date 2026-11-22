#!/bin/bash
# Renders a film-time range in parallel chunks, joins them and adds the mix.
# render_film.sh EPISODE START END OUT.mp4 [JOBS]
EP=$1; A=$2; B=$3; OUT=$4; JOBS=${5:-3}
ROOT=$(cd "$(dirname "$0")/.." && pwd); NODE=${NODE:-node}
FF=${FFMPEG:-$( [ -x "$HOME/.local/bin/ffmpeg" ] && echo "$HOME/.local/bin/ffmpeg" || echo ffmpeg )}
FP=${FFPROBE:-$( [ -x "$HOME/.local/bin/ffprobe" ] && echo "$HOME/.local/bin/ffprobe" || echo ffprobe )}
TMP=$(mktemp -d /tmp/hm-render.XXXX)
FPS=30
step=$(awk "BEGIN{print ($B-$A)/$JOBS}")
: > "$TMP/list.txt"
for i in $(seq 0 $((JOBS-1))); do
  s=$(awk "BEGIN{printf \"%.4f\", $A+$i*$step}"); e=$(awk "BEGIN{printf \"%.4f\", $A+($i+1)*$step}")
  # snap to the frame grid so chunks meet exactly
  s=$(awk "BEGIN{printf \"%.5f\", int($s*$FPS+.5)/$FPS}"); e=$(awk "BEGIN{printf \"%.5f\", int($e*$FPS+.5)/$FPS}")
  echo "file '$TMP/c$i.mp4'" >> "$TMP/list.txt"
  "$NODE" "$ROOT/tools/render.mjs" "$EP" --range "$s-$e" --out "$TMP/c$i.mp4" > "$TMP/c$i.log" 2>&1 &
done
wait
if grep -l "page error\|chrome exited" "$TMP"/c*.log; then cat "$TMP"/c*.log | grep -E "page error|chrome exited" | head; exit 1; fi
AUDIO=$ROOT/episodes/$EP/build/audio/mix.wav
"$FF" -nostdin -v error -y -f concat -safe 0 -i "$TMP/list.txt" -ss "$A" -i "$AUDIO" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart "$OUT"
rm -rf "$TMP"
"$FP" -v error -show_entries format=duration,bit_rate,size -of csv=p=0 "$OUT"
