#!/usr/bin/env bash
# Build Bun standalone CLI binaries with the package version injected at
# compile time. Used by CI and the release workflow.
#
# Usage (from repo root or packages/cli):
#   scripts/release/build-cli-binaries.sh [target...]
#
# Targets (default: all):
#   linux-x64 linux-arm64 darwin-x64 darwin-arm64 windows-x64
#
# Environment:
#   CLI_DIR  â€” packages/cli path (default: packages/cli relative to repo root)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CLI_DIR="${CLI_DIR:-${REPO_ROOT}/packages/cli}"

if [ ! -f "${CLI_DIR}/package.json" ]; then
  echo "CLI package.json not found at ${CLI_DIR}/package.json" >&2
  exit 1
fi

mkdir -p "${CLI_DIR}/bin"
cd "${CLI_DIR}"

CLI_VERSION=$(node -p "require('./package.json').version")
CLI_VERSION_JSON=$(node -p "JSON.stringify(require('./package.json').version)")

echo "Building standalone CLI binaries for version ${CLI_VERSION}"

build_one() {
  local name="$1"
  local target="$2"
  local outfile="$3"
  echo "  ${name} -> ${outfile} (${target})"
  bun build src/index.ts \
    --compile \
    --define "__BEHALF_CLI_VERSION__=${CLI_VERSION_JSON}" \
    --outfile "${outfile}" \
    --target "${target}"
}

TARGETS=("${@}")
if [ "${#TARGETS[@]}" -eq 0 ]; then
  TARGETS=(linux-x64 linux-arm64 darwin-x64 darwin-arm64 windows-x64)
fi

for t in "${TARGETS[@]}"; do
  case "$t" in
    linux-x64)
      build_one "Linux x64" bun-linux-x64 bin/behalf-linux-x64
      ;;
    linux-arm64)
      build_one "Linux arm64" bun-linux-arm64 bin/behalf-linux-arm64
      ;;
    darwin-x64)
      build_one "Darwin x64" bun-darwin-x64 bin/behalf-darwin-x64
      ;;
    darwin-arm64)
      build_one "Darwin arm64" bun-darwin-arm64 bin/behalf-darwin-arm64
      ;;
    windows-x64)
      build_one "Windows x64" bun-windows-x64 bin/behalf-windows-x64.exe
      ;;
    *)
      echo "Unknown target: $t" >&2
      echo "Valid: linux-x64 linux-arm64 darwin-x64 darwin-arm64 windows-x64" >&2
      exit 1
      ;;
  esac
done

echo "Standalone binaries ready (version ${CLI_VERSION})"
