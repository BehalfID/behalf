# Homebrew formula source of truth

The live Homebrew formula is maintained in **[BehalfID/homebrew-tap](https://github.com/BehalfID/homebrew-tap)** (`Formula/behalf.rb`).

Do not treat this directory as an installable tap. Release automation regenerates the tap formula with:

```bash
node scripts/release/render-homebrew-formula.mjs \
  --version 0.2.9 \
  --darwin-arm64-url https://github.com/BehalfID/behalf/releases/download/v0.2.9/behalf-darwin-arm64.tar.gz \
  --darwin-arm64-sha256 <sha256> \
  --darwin-x64-url https://github.com/BehalfID/behalf/releases/download/v0.2.9/behalf-darwin-x64.tar.gz \
  --darwin-x64-sha256 <sha256>
```

Install (macOS only):

```bash
brew install BehalfID/tap/behalf
```
