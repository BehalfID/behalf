#!/bin/sh
# BehalfID CLI installer (macOS / Linux only)
# Usage:
#   curl -fsSL https://behalfid.com/install.sh | sh
#   BEHALF_VERSION=v0.2.9 curl -fsSL https://behalfid.com/install.sh | sh
#
# Windows is not supported by this script — use: npm install -g @behalfid/cli

set -eu

REPO="BehalfID/behalf"
INSTALL_DIR="${BEHALF_INSTALL_DIR:-/usr/local/bin}"
BASE_URL="${BEHALF_RELEASE_BASE_URL:-https://github.com/${REPO}/releases}"
API_URL="${BEHALF_RELEASE_API_URL:-https://api.github.com/repos/${REPO}/releases}"

die() {
  echo "$*" >&2
  exit 1
}

# Detect OS and architecture (macOS / Linux only)
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  darwin) OS="darwin" ;;
  linux)  OS="linux"  ;;
  *)
    die "Unsupported OS: $OS. This installer supports macOS and Linux only. On Windows use: npm install -g @behalfid/cli"
    ;;
esac

case "$ARCH" in
  x86_64 | amd64) ARCH="x64"   ;;
  arm64 | aarch64) ARCH="arm64" ;;
  *)
    die "Unsupported architecture: $ARCH. Install manually: npm install -g @behalfid/cli"
    ;;
esac

download() {
  # $1=url $2=dest
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$1" -O "$2"
  else
    die "curl or wget is required."
  fi
}

# Resolve one explicit release tag before downloading.
resolve_tag() {
  if [ -n "${BEHALF_VERSION:-}" ]; then
    TAG="$BEHALF_VERSION"
    case "$TAG" in
      v*) ;;
      *) TAG="v$TAG" ;;
    esac
    echo "$TAG"
    return
  fi

  # Prefer the GitHub API for an unambiguous tag; fall back to Location redirect.
  if command -v curl >/dev/null 2>&1; then
    BODY=$(curl -fsSL "${API_URL}/latest" 2>/dev/null || true)
    if [ -n "$BODY" ]; then
      TAG=$(printf '%s' "$BODY" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
      if [ -n "$TAG" ]; then
        echo "$TAG"
        return
      fi
    fi
    LOC=$(curl -fsSLI "${BASE_URL}/latest" 2>/dev/null | tr -d '\r' | awk 'BEGIN{IGNORECASE=1} /^location:/ {print $2}' | tail -n 1)
    TAG=$(printf '%s' "$LOC" | sed -n 's|.*/tag/\(v[^/]*\).*|\1|p')
    if [ -n "$TAG" ]; then
      echo "$TAG"
      return
    fi
  fi
  die "Could not resolve a release tag. Set BEHALF_VERSION=vX.Y.Z and retry."
}

sha256_file() {
  # $1=file → prints hex digest
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    die "Checksum verification unavailable: need sha256sum or shasum -a 256."
  fi
}

TAG=$(resolve_tag)
VERSION="${TAG#v}"
ASSET="behalf-${OS}-${ARCH}.tar.gz"
DOWNLOAD_URL="${BASE_URL}/download/${TAG}/${ASSET}"
SUMS_URL="${BASE_URL}/download/${TAG}/SHA256SUMS"

echo "Resolved release tag: ${TAG}"
echo "Downloading BehalfID CLI (${OS}/${ARCH}) from ${DOWNLOAD_URL}..."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

download "$DOWNLOAD_URL" "$TMP/$ASSET"
download "$SUMS_URL" "$TMP/SHA256SUMS"

EXPECTED=$(awk -v f="$ASSET" '$2 == f { print $1; exit }' "$TMP/SHA256SUMS")
if [ -z "$EXPECTED" ]; then
  # Also accept "hash  filename" with optional leading "./"
  EXPECTED=$(awk -v f="$ASSET" '$2 == "./"f || $2 == f { print $1; exit }' "$TMP/SHA256SUMS")
fi
[ -n "$EXPECTED" ] || die "SHA256SUMS does not list ${ASSET} for ${TAG}."

ACTUAL=$(sha256_file "$TMP/$ASSET")
if [ "$ACTUAL" != "$EXPECTED" ]; then
  die "Checksum mismatch for ${ASSET}: expected ${EXPECTED}, got ${ACTUAL}."
fi
echo "Checksum OK (${ACTUAL})"

tar xzf "$TMP/$ASSET" -C "$TMP"
[ -f "$TMP/behalf" ] || die "Archive did not contain a behalf binary."
chmod +x "$TMP/behalf"

INSTALLED_VERSION=$("$TMP/behalf" --version 2>/dev/null | tr -d '\r' | head -n 1 || true)
[ -n "$INSTALLED_VERSION" ] || die "Could not read --version from downloaded binary."
if [ "$INSTALLED_VERSION" != "$VERSION" ]; then
  die "Installed version mismatch: binary reports ${INSTALLED_VERSION}, expected ${VERSION}."
fi

mkdir -p "$INSTALL_DIR"
# Atomic install: write to temp name in the target dir, then rename.
TARGET="$INSTALL_DIR/behalf"
STAGE="$INSTALL_DIR/.behalf.${VERSION}.$$"
if [ -w "$INSTALL_DIR" ]; then
  cp "$TMP/behalf" "$STAGE"
  chmod +x "$STAGE"
  mv -f "$STAGE" "$TARGET"
else
  echo "Installing to $INSTALL_DIR (requires sudo)..."
  sudo cp "$TMP/behalf" "$STAGE"
  sudo chmod +x "$STAGE"
  sudo mv -f "$STAGE" "$TARGET"
fi

VERIFY=$("$TARGET" --version 2>/dev/null | tr -d '\r' | head -n 1 || true)
if [ "$VERIFY" != "$VERSION" ]; then
  die "Post-install version check failed: got '${VERIFY}', expected '${VERSION}'."
fi

echo "Installed behalf ${VERIFY} to $TARGET"
echo ""
echo "Run 'behalf init' to get started."
