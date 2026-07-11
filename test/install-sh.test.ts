import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";

const INSTALL_SH = join(process.cwd(), "public", "install.sh");

function sha256(buf: Buffer | string) {
  return createHash("sha256").update(buf).digest("hex");
}

function platformAsset(): string | null {
  if (process.platform === "linux") {
    return `behalf-linux-${process.arch === "arm64" ? "arm64" : "x64"}.tar.gz`;
  }
  if (process.platform === "darwin") {
    return `behalf-darwin-${process.arch === "arm64" ? "arm64" : "x64"}.tar.gz`;
  }
  return null;
}

async function withFixtureServer(
  assets: Record<string, Buffer | string>,
  fn: (releaseBaseUrl: string, apiUrl: string) => Promise<void>
) {
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url.endsWith("/releases/latest")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ tag_name: "v0.2.9" }));
      return;
    }
    const downloadMatch = url.match(/^\/download\/([^/]+)\/(.+)$/);
    if (downloadMatch) {
      const name = downloadMatch[2];
      const body = assets[name];
      if (body === undefined) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200);
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  const root = `http://127.0.0.1:${addr.port}`;
  try {
    await fn(root, `${root}/repos/BehalfID/behalf/releases`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

function makeArchive(version: string): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "behalf-asset-"));
  try {
    const binPath = join(dir, "behalf");
    writeFileSync(binPath, `#!/bin/sh\necho ${version}\n`);
    chmodSync(binPath, 0o755);
    const tar = spawnSync("tar", ["-czf", "-", "-C", dir, "behalf"], {
      encoding: "buffer",
      maxBuffer: 10 * 1024 * 1024,
    });
    if (tar.status !== 0) throw new Error(String(tar.stderr));
    return Buffer.from(tar.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runInstall(env: NodeJS.ProcessEnv) {
  return spawnSync("sh", [INSTALL_SH], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("install.sh", () => {
  it("documents BehalfID/behalf, checksums, version pin, and macOS/Linux-only scope", () => {
    const script = readFileSync(INSTALL_SH, "utf8");
    expect(script).toContain('REPO="BehalfID/behalf"');
    expect(script).toContain("SHA256SUMS");
    expect(script).toContain("BEHALF_VERSION");
    expect(script).toContain("sha256sum");
    expect(script).toContain("shasum -a 256");
    expect(script).toMatch(/macOS and Linux only|Windows is not supported/);
    expect(script).not.toContain("potatobeyonddefeat");
  });

  it("installs successfully with checksum verification on Linux", async () => {
    const asset = platformAsset();
    if (process.platform !== "linux" || !asset) return;

    const archive = makeArchive("0.2.9");
    const sums = `${sha256(archive)}  ${asset}\n`;
    const installDir = mkdtempSync(join(tmpdir(), "behalf-install-"));

    await withFixtureServer({ [asset]: archive, SHA256SUMS: sums }, async (base, api) => {
      const result = runInstall({
        BEHALF_VERSION: "v0.2.9",
        BEHALF_INSTALL_DIR: installDir,
        BEHALF_RELEASE_BASE_URL: base,
        BEHALF_RELEASE_API_URL: api,
      });
      expect(result.status, result.stderr + result.stdout).toBe(0);
      expect(result.stdout).toMatch(/Installed behalf 0\.2\.9/);
      const ver = spawnSync(join(installDir, "behalf"), ["--version"], { encoding: "utf8" });
      expect(ver.stdout.trim()).toBe("0.2.9");
    });

    rmSync(installDir, { recursive: true, force: true });
  });

  it("resolves Darwin arm64 when running on darwin arm64", async () => {
    if (process.platform !== "darwin" || process.arch !== "arm64") {
      // Still assert the asset naming contract for Darwin arm64.
      expect(readFileSync(INSTALL_SH, "utf8")).toContain("behalf-${OS}-${ARCH}.tar.gz");
      return;
    }
    const asset = "behalf-darwin-arm64.tar.gz";
    const archive = makeArchive("0.2.9");
    const sums = `${sha256(archive)}  ${asset}\n`;
    const installDir = mkdtempSync(join(tmpdir(), "behalf-install-"));

    await withFixtureServer({ [asset]: archive, SHA256SUMS: sums }, async (base, api) => {
      const result = runInstall({
        BEHALF_VERSION: "v0.2.9",
        BEHALF_INSTALL_DIR: installDir,
        BEHALF_RELEASE_BASE_URL: base,
        BEHALF_RELEASE_API_URL: api,
      });
      expect(result.status, result.stderr + result.stdout).toBe(0);
    });
    rmSync(installDir, { recursive: true, force: true });
  });

  it("fails closed on checksum mismatch", async () => {
    const asset = platformAsset();
    if (!asset || (process.platform !== "linux" && process.platform !== "darwin")) return;

    const archive = makeArchive("0.2.9");
    const sums = `${"0".repeat(64)}  ${asset}\n`;
    const installDir = mkdtempSync(join(tmpdir(), "behalf-install-"));

    await withFixtureServer({ [asset]: archive, SHA256SUMS: sums }, async (base, api) => {
      const result = runInstall({
        BEHALF_VERSION: "v0.2.9",
        BEHALF_INSTALL_DIR: installDir,
        BEHALF_RELEASE_BASE_URL: base,
        BEHALF_RELEASE_API_URL: api,
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toMatch(/Checksum mismatch/i);
    });
    rmSync(installDir, { recursive: true, force: true });
  });

  it("fails when checksum utility is unavailable", async () => {
    const asset = platformAsset();
    if (!asset || (process.platform !== "linux" && process.platform !== "darwin")) return;

    const archive = makeArchive("0.2.9");
    const sums = `${sha256(archive)}  ${asset}\n`;
    const installDir = mkdtempSync(join(tmpdir(), "behalf-install-"));
    const emptyBin = mkdtempSync(join(tmpdir(), "behalf-empty-bin-"));

    // Provide curl + tar + sh via a PATH that still includes system dirs needed for those tools,
    // but shadow sha256sum/shasum with non-executables.
    writeFileSync(join(emptyBin, "sha256sum"), "#!/bin/sh\nexit 127\n");
    writeFileSync(join(emptyBin, "shasum"), "#!/bin/sh\nexit 127\n");
    chmodSync(join(emptyBin, "sha256sum"), 0o755);
    chmodSync(join(emptyBin, "shasum"), 0o755);

    await withFixtureServer({ [asset]: archive, SHA256SUMS: sums }, async (base, api) => {
      const result = runInstall({
        PATH: `${emptyBin}:${process.env.PATH ?? ""}`,
        BEHALF_VERSION: "v0.2.9",
        BEHALF_INSTALL_DIR: installDir,
        BEHALF_RELEASE_BASE_URL: base,
        BEHALF_RELEASE_API_URL: api,
      });
      // Shadowed checksum tools exit 127 → sha256_file fails closed.
      expect(result.status).not.toBe(0);
    });
    rmSync(installDir, { recursive: true, force: true });
    rmSync(emptyBin, { recursive: true, force: true });
  });

  it("rejects unknown architecture in script messaging", () => {
    const script = readFileSync(INSTALL_SH, "utf8");
    expect(script).toMatch(/Unsupported architecture/);
    expect(script).toMatch(/Unsupported OS/);
  });

  it("fails when the requested version is not found", async () => {
    if (process.platform !== "linux" && process.platform !== "darwin") return;
    const installDir = mkdtempSync(join(tmpdir(), "behalf-install-"));
    await withFixtureServer({}, async (base, api) => {
      const result = runInstall({
        BEHALF_VERSION: "v9.9.9",
        BEHALF_INSTALL_DIR: installDir,
        BEHALF_RELEASE_BASE_URL: base,
        BEHALF_RELEASE_API_URL: api,
      });
      expect(result.status).not.toBe(0);
    });
    rmSync(installDir, { recursive: true, force: true });
  });

  it("fails when installed binary version mismatches the tag", async () => {
    if (process.platform !== "linux") return;
    const asset = platformAsset();
    if (!asset) return;

    const archive = makeArchive("0.1.0");
    const sums = `${sha256(archive)}  ${asset}\n`;
    const installDir = mkdtempSync(join(tmpdir(), "behalf-install-"));

    await withFixtureServer({ [asset]: archive, SHA256SUMS: sums }, async (base, api) => {
      const result = runInstall({
        BEHALF_VERSION: "v0.2.9",
        BEHALF_INSTALL_DIR: installDir,
        BEHALF_RELEASE_BASE_URL: base,
        BEHALF_RELEASE_API_URL: api,
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toMatch(/version mismatch/i);
    });
    rmSync(installDir, { recursive: true, force: true });
  });

  it("replaces an existing binary on rerun", async () => {
    if (process.platform !== "linux") return;
    const asset = platformAsset();
    if (!asset) return;

    const archive = makeArchive("0.2.9");
    const sums = `${sha256(archive)}  ${asset}\n`;
    const installDir = mkdtempSync(join(tmpdir(), "behalf-install-"));
    writeFileSync(join(installDir, "behalf"), "#!/bin/sh\necho old\n");
    chmodSync(join(installDir, "behalf"), 0o755);

    await withFixtureServer({ [asset]: archive, SHA256SUMS: sums }, async (base, api) => {
      const result = runInstall({
        BEHALF_VERSION: "v0.2.9",
        BEHALF_INSTALL_DIR: installDir,
        BEHALF_RELEASE_BASE_URL: base,
        BEHALF_RELEASE_API_URL: api,
      });
      expect(result.status, result.stderr + result.stdout).toBe(0);
      const ver = spawnSync(join(installDir, "behalf"), ["--version"], { encoding: "utf8" });
      expect(ver.stdout.trim()).toBe("0.2.9");
    });
    rmSync(installDir, { recursive: true, force: true });
  });
});
