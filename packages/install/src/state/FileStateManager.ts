import { access, readFile, unlink } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import type { StateManager } from "../interfaces/StateManager.js";
import type { InstallationState } from "../types/index.js";
import { atomicWriteFile } from "./atomicWrite.js";
import { parseInstallationState } from "./InstallationState.js";
import { resolveInstallationStatePath } from "./paths.js";

export interface FileStateManagerOptions {
  /** Absolute path to the state file. Defaults to ~/.behalfid/install-state.json */
  stateFilePath?: string;
}

/**
 * File-backed installation state manager.
 * Uses atomic writes to avoid corrupting state on interrupt or crash.
 */
export class FileStateManager implements StateManager {
  readonly stateFilePath: string;

  constructor(options: FileStateManagerOptions = {}) {
    this.stateFilePath = options.stateFilePath ?? resolveInstallationStatePath();
  }

  async exists(): Promise<boolean> {
    try {
      await access(this.stateFilePath, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async load(): Promise<InstallationState | null> {
    if (!(await this.exists())) {
      return null;
    }

    let raw: string;
    try {
      raw = await readFile(this.stateFilePath, "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read installation state: ${message}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Installation state is not valid JSON: ${message}`);
    }

    try {
      return parseInstallationState(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Installation state is invalid: ${message}`);
    }
  }

  async save(state: InstallationState): Promise<void> {
    // Re-parse to guarantee only valid documents are persisted.
    const normalized = parseInstallationState(state);
    const payload = `${JSON.stringify(normalized, null, 2)}\n`;

    try {
      await atomicWriteFile(this.stateFilePath, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to write installation state: ${message}`);
    }
  }

  async clear(): Promise<void> {
    if (!(await this.exists())) {
      return;
    }

    try {
      await unlink(this.stateFilePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to clear installation state: ${message}`);
    }
  }
}
