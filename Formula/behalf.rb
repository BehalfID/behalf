# Homebrew formula for BehalfID CLI
# This file lives in the tap repo: github.com/potatobeyonddefeat/homebrew-tap
# It is committed here as a reference template and updated by CI on each release.

class Behalf < Formula
  desc "Official CLI for BehalfID — agent permission management"
  homepage "https://behalfid.com"
  version "0.1.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/potatobeyonddefeat/behalf/releases/download/v#{version}/behalf-darwin-arm64.tar.gz"
      sha256 "PLACEHOLDER_ARM64_SHA256"
    else
      url "https://github.com/potatobeyonddefeat/behalf/releases/download/v#{version}/behalf-darwin-x64.tar.gz"
      sha256 "PLACEHOLDER_X64_SHA256"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/potatobeyonddefeat/behalf/releases/download/v#{version}/behalf-linux-arm64.tar.gz"
      sha256 "PLACEHOLDER_LINUX_ARM64_SHA256"
    else
      url "https://github.com/potatobeyonddefeat/behalf/releases/download/v#{version}/behalf-linux-x64.tar.gz"
      sha256 "PLACEHOLDER_LINUX_X64_SHA256"
    end
  end

  def install
    bin.install "behalf"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/behalf --version")
  end
end
