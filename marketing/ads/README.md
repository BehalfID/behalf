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

## Pipeline

| Step | Tool | Plan required |
|------|------|---------------|
| Keyframe stills (Nano Banana) | Cursor `GenerateImage` or Higgsfield `ms_image` (DTC Ads) | Free (1 credit/image, 1 concurrent job) |
| Image-to-video motion | Higgsfield `generate_video` + `seedance_2_0` | **Plus** (~22 credits / 5s clip) |
| Stitch clips | `scripts/stitch-ad.sh` (ffmpeg crossfade) | None |

### Higgsfield MCP (authenticated)

- Workspace must be selected via `select_workspace` before generation.
- Upload local PNGs: `media_upload` → curl PUT → `media_confirm`.
- **Video model ID:** `seedance_2_0` (underscores). Media role: `image`.
- Hyphenated catalog IDs (`kling-v2-5-turbo`, etc.) return "unknown model" via MCP; use `models_explore` + `get_cost` to find working slugs.
- Free plan: DTC Ads `ms_image` works; video and `higgsfield_preset` require Plus.

### Higgsfield-generated stills

See `higgsfield/concept1/` for DTC Ads (`ms_image`) variants generated after MCP auth.

See `manifest.json` for shot-level model assignments and CTAs.
