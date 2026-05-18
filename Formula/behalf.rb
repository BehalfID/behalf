# Homebrew formula for BehalfID CLI
# Tap: github.com/potatobeyonddefeat/homebrew-tap
# Install: brew tap potatobeyonddefeat/tap && brew install behalf

class Behalf < Formula
  desc "Official CLI for BehalfID — agent permission management"
  homepage "https://behalfid.com"
  url "https://registry.npmjs.org/@behalfid/cli/-/cli-0.2.0.tgz"
  sha256 "a69cfdf9bf2fafb567472e15343f1dfad53a846a6b9156aa792ebe8365f900fa"
  version "0.2.0"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/behalfid --version")
    assert_match version.to_s, shell_output("#{bin}/behalf --version")
  end
end
