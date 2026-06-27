#!/usr/bin/env bash
# Higgsfield image-to-video clip generator (via MCP / API).
# Requires: Higgsfield Plus plan, authenticated MCP, selected workspace.
#
# Model: seedance_2_0 (use underscores, not hyphens)
# Media role: image (not input_image)
# Cost: ~22 credits per 5s 9:16 clip on free/Plus pricing preflight
#
# Usage:
#   ./higgsfield-video-clip.sh <media_id> <output.mp4> "<motion prompt>" [aspect_ratio] [duration]
#
# Workflow:
#   1. media_upload + curl PUT + media_confirm  → media_id
#   2. generate_video with seedance_2_0
#   3. job_status sync → download result URL
#   4. stitch clips with ../stitch-ad.sh

set -euo pipefail

MEDIA_ID="${1:?media_id required}"
OUTPUT="${2:?output path required}"
PROMPT="${3:?motion prompt required}"
ASPECT="${4:-9:16}"
DURATION="${5:-5}"

echo "Higgsfield video clip request:"
echo "  media_id:    $MEDIA_ID"
echo "  output:      $OUTPUT"
echo "  aspect:      $ASPECT"
echo "  duration:    ${DURATION}s"
echo "  prompt:      $PROMPT"
echo ""
echo "Call Higgsfield MCP generate_video with:"
cat <<JSON
{
  "params": {
    "model": "seedance_2_0",
    "aspect_ratio": "$ASPECT",
    "duration": $DURATION,
    "prompt": "$PROMPT",
    "medias": [{ "role": "image", "value": "$MEDIA_ID" }]
  }
}
JSON
echo ""
echo "Then poll job_status(sync:true), curl the result URL to $OUTPUT"
echo "Stitch multiple clips: ../stitch-ad.sh final.mp4 1080x1920 5 clip1.mp4 5 clip2.mp4 ..."
