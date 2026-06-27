#!/usr/bin/env bash
# Stitch still frames into a short-form ad with Ken Burns motion and crossfades.
# Usage: stitch-ad.sh <output.mp4> <width>x<height> <duration1> <img1> [duration2 img2 ...]

set -euo pipefail

OUTPUT="$1"
RES="$2"
shift 2
W="${RES%x*}"
H="${RES#*x}"
FPS=30
XFADE=0.5
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

clips=()
idx=0
while [ $# -gt 0 ]; do
  dur="$1"
  img="$2"
  shift 2
  out="$TMPDIR/clip_${idx}.mp4"
  frames=$(python3 -c "import math; print(max(1, math.ceil(float('$dur') * $FPS)))")
  # Subtle push-in zoom for ad motion
  ffmpeg -y -hide_banner -loglevel error -loop 1 -i "$img" \
    -vf "scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},zoompan=z='min(zoom+0.0008,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},format=yuv420p" \
    -t "$dur" -c:v libx264 -pix_fmt yuv420p "$out"
  clips+=("$out")
  idx=$((idx + 1))
done

if [ "${#clips[@]}" -eq 1 ]; then
  cp "${clips[0]}" "$OUTPUT"
  exit 0
fi

# Build xfade filter chain
inputs=()
for c in "${clips[@]}"; do
  inputs+=(-i "$c")
done

filter=""
prev="[0:v]"
offset=0
for i in $(seq 1 $((${#clips[@]} - 1))); do
  dur_i=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${clips[$((i - 1))]}")
  offset=$(python3 -c "print(round(float('$offset') + float('$dur_i') - $XFADE, 3))")
  out="v${i}"
  filter+="${prev}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset}[${out}];"
  prev="[${out}]"
done
filter="${filter%;}"

ffmpeg -y -hide_banner -loglevel error "${inputs[@]}" \
  -filter_complex "$filter" -map "[v$((${#clips[@]} - 1))]" \
  -c:v libx264 -pix_fmt yuv420p "$OUTPUT"

echo "Wrote $OUTPUT"
