#!/bin/sh
# BehalfID CLI installer
# Usage: curl -fsSL https://behalfid.com/install.sh | sh

set -e

REPO="potatobeyonddefeat/behalf"
INSTALL_DIR="${BEHALF_INSTALL_DIR:-/usr/local/bin}"

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  darwin) OS="darwin" ;;
  linux)  OS="linux"  ;;
  *)
    echo "Unsupported OS: $OS"
    echo "Install manually: npm install -g @behalfid/cli"
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64 | amd64) ARCH="x64"   ;;
  arm64 | aarch64) ARCH="arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH"
    echo "Install manually: npm install -g @behalfid/cli"
    exit 1
    ;;
esac

ASSET="behalf-${OS}-${ARCH}.tar.gz"
DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"

echo "Downloading BehalfID CLI (${OS}/${ARCH})..."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$DOWNLOAD_URL" -o "$TMP/behalf.tar.gz"
elif command -v wget >/dev/null 2>&1; then
  wget -q "$DOWNLOAD_URL" -O "$TMP/behalf.tar.gz"
else
  echo "curl or wget is required."
  exit 1
fi

tar xzf "$TMP/behalf.tar.gz" -C "$TMP"
chmod +x "$TMP/behalf"

# Install (try without sudo first, fall back to sudo)
if [ -w "$INSTALL_DIR" ]; then
  mv "$TMP/behalf" "$INSTALL_DIR/behalf"
else
  echo "Installing to $INSTALL_DIR (requires sudo)..."
  sudo mv "$TMP/behalf" "$INSTALL_DIR/behalf"
fi

echo "Installed behalf to $INSTALL_DIR/behalf"
echo ""
echo "Run 'behalf init' to get started."
