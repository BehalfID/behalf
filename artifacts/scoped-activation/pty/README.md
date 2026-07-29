# PTY / interactive prompt evidence

These transcripts exercise the real `select()` arrow-key renderer via a fake TTY.
Underlying agent binaries are not launched here; see `test/cli-protection-pty.test.ts`
for fixture-binary `launchTool` coverage per Cursor / Claude / Codex.

Method: fake-TTY (no native node-pty). Safe on Windows without admin symlink/PTY privileges.
