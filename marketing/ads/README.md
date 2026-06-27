# BehalfID Ad Assets

Generated short-form marketing ads for BehalfID using Nano Banana stills and ffmpeg stitching.

## Concepts

| # | Title | Format | Duration | Video |
|---|-------|--------|----------|-------|
| 1 | Production Deploy Blocked | 9:16 | ~16s | `concept1-production-deploy-blocked.mp4` |
| 2 | Three Lines of Code | 16:9 | ~14s | `concept2-three-lines-of-code.mp4` |
| 3 | Fail Closed | 9:16 | ~11s | `concept3-fail-closed.mp4` |
| 4 | Permission Passport | 9:16 | ~18.5s | `concept4-permission-passport.mp4` |
| 5 | Before / After BehalfID | 16:9 | ~14s | `concept5-before-after.mp4` |

Stitched MP4s live in `/opt/cursor/artifacts/videos/` during cloud agent runs. PNG keyframes are in each `conceptN/` folder.

## Regenerate a video

```bash
./scripts/stitch-ad.sh /path/to/output.mp4 1080x1920 \
  3 concept1/concept1-shot1-hook.png \
  4 concept1/concept1-shot2-terminal.png \
  ...
```

Use `1920x1080` for 16:9 concepts (2 and 5).

## Upgrade to Higgsfield image-to-video

When the Higgsfield MCP is authenticated, replace the Ken Burns step with `generate_video` per frame for true motion (push-in, UI glow pulse, scan lines). Then stitch clips with the same script or Higgsfield's editor.

See `manifest.json` for shot-level model assignments and CTAs.
