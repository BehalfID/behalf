# Task: Build the BehalfID AI Installation Framework

## Objective

Create a universal installation framework that allows AI coding agents (Cursor, Claude Code, Codex, VS Code agents, Windsurf, and future MCP-enabled agents) to install and configure BehalfID automatically using a single command or a standardized installation specification.

The goal is **not** to teach every AI how to install BehalfID. Instead, BehalfID should expose a stable installer and machine-readable specification that any AI can follow.

---

# Goals

The finished system should allow the following interaction:

**User**

> Install BehalfID.

**AI Agent**

* Detects whether BehalfID is already installed.
* If not, runs the official installer.
* Verifies installation.
* Reports success.

The AI should never need to know internal installation details.

---

# Deliverables

Implement the following components.

---

# 1. Universal Installer CLI

Create a standalone installer package.

Example package:

```text
@behalfid/install
```

The installer should support:

```bash
npx @behalfid/install
```

and optionally

```bash
behalf install
```

The installer is responsible for:

* Detecting the operating system.
* Detecting package managers (npm, pnpm, yarn, bun).
* Detecting installed AI clients.
* Detecting existing MCP configuration.
* Installing required BehalfID packages.
* Registering the runtime.
* Updating MCP configuration.
* Verifying installation.
* Reporting failures with actionable messages.

The installer should be idempotent.

Running it twice should not create duplicate configuration.

---

# 2. Installation Detection

Implement automatic detection for:

* Cursor
* Claude Code
* Claude Desktop
* Codex CLI
* VS Code
* Windsurf

The detection layer should locate:

* configuration directories
* MCP configuration files
* workspace configuration
* user configuration

The installer should support multiple clients on the same machine.

---

# 3. MCP Configuration Manager

Implement a configuration manager.

Responsibilities:

* Read existing configuration.
* Preserve user configuration.
* Register BehalfID runtime.
* Avoid duplicate entries.
* Perform safe upgrades.
* Support rollback if installation fails.

Never overwrite unrelated configuration.

---

# 4. Installation Verification

Implement:

```bash
behalf doctor
```

The doctor command should verify:

* installer version
* runtime installed
* MCP registration
* verify endpoint connectivity
* package versions
* configuration integrity

Return a machine-readable report.

---

# 5. Upgrade Support

Implement:

```bash
behalf upgrade
```

The upgrade process should:

* detect installed version
* migrate configuration
* preserve user settings
* verify installation afterwards

---

# 6. Uninstall

Implement:

```bash
behalf uninstall
```

Responsibilities:

* unregister runtime
* remove BehalfID configuration
* preserve non-BehalfID settings
* verify removal

---

# 7. Machine-Readable Installation Specification

Create a public installation specification.

Example:

```yaml
name: BehalfID
version: 1

install:
  command: npx @behalfid/install

verify:
  command: behalf doctor

upgrade:
  command: behalf upgrade

uninstall:
  command: behalf uninstall
```

The specification should be designed so any AI agent can understand how to install and manage BehalfID.

---

# 8. AI Installation Instructions

Create a document named:

```text
INSTALL_FOR_AI.md
```

This document should explain to AI coding agents:

* how to detect BehalfID
* how to install it
* how to verify installation
* how to upgrade
* how to uninstall

It should assume no prior knowledge of BehalfID.

Keep the instructions deterministic and machine-friendly.

---

# 9. Runtime Registration

The installer should register:

* @behalfid/mcp-runtime
* verify endpoint configuration
* runtime metadata
* future extension points

Registration should be modular so future runtimes can be added without changing the installer.

---

# 10. Installation State

Implement an installation state manager.

Track:

* installed version
* install timestamp
* configured clients
* registered runtimes
* installer version

This state should support upgrades and diagnostics.

---

# 11. Public CLI

Expose commands:

```bash
behalf install

behalf doctor

behalf upgrade

behalf uninstall

behalf status
```

Each command should provide both:

* human-readable output
* machine-readable JSON

---

# 12. Error Handling

The installer must:

* fail safely
* never corrupt user configuration
* back up modified configuration
* support rollback
* explain failures clearly

---

# 13. Testing

Write comprehensive tests covering:

* fresh installation
* repeated installation
* upgrades
* uninstall
* rollback
* malformed configuration
* multiple AI clients
* multiple package managers
* installation verification
* configuration migration

---

# 14. Documentation

Create documentation covering:

* architecture
* installer flow
* supported clients
* configuration format
* troubleshooting
* extension points

---

# Design Principles

* Cross-platform.
* Idempotent.
* Extensible.
* Preserve user configuration.
* Never duplicate MCP entries.
* Never overwrite unrelated settings.
* Safe upgrades.
* Safe rollback.
* Clear APIs.
* Strong TypeScript typing.

---

# Future Compatibility

Design the framework so new AI coding agents can be supported by implementing a detector and configuration adapter without changing the installer core.

---

# Success Criteria

The final result should provide a single, stable installation experience for all supported AI coding agents. A user should be able to ask an AI to install BehalfID, and the AI should only need to execute the official installer and verify the result—without embedding any BehalfID-specific installation logic itself. The installer should own all platform detection, configuration, registration, verification, upgrades, and lifecycle management.
