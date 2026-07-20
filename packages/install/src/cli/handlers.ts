import type { Command } from "commander";
import type { Installer } from "../interfaces/Installer.js";
import { parseClientIdList } from "../installer/clients.js";
import type {
  DoctorOptions,
  InstallOptions,
  StatusOptions,
  UninstallOptions,
  UpgradeOptions,
} from "../types/index.js";
import { createDefaultInstaller } from "./createInstaller.js";
import {
  renderDoctorReport,
  renderInstallResult,
  renderStatusResult,
  renderUninstallResult,
  renderUpgradeResult,
} from "./formatters.js";
import { createCliOutput, setExitCode } from "./output.js";

export interface CliHandlerContext {
  installer: Installer;
}

interface GlobalCliFlags {
  json?: boolean;
}

interface InstallCommandOptions extends GlobalCliFlags {
  dryRun?: boolean;
  force?: boolean;
  clients?: string;
  verifyEndpoint?: string;
}

interface UpgradeCommandOptions extends GlobalCliFlags {
  dryRun?: boolean;
  clients?: string;
  verifyEndpoint?: string;
}

interface UninstallCommandOptions extends GlobalCliFlags {
  dryRun?: boolean;
  clients?: string;
  keepState?: boolean;
}

interface DoctorCommandOptions extends GlobalCliFlags {
  verifyEndpoint?: string;
}

function isJsonMode(command: Command): boolean {
  const globals = command.optsWithGlobals() as GlobalCliFlags;
  return globals.json === true;
}

function buildInstallOptions(
  opts: InstallCommandOptions,
  json: boolean,
): InstallOptions {
  const options: InstallOptions = { json };
  const clients = parseClientIdList(opts.clients);
  if (clients !== undefined) {
    options.clients = clients;
  }
  if (opts.dryRun === true) {
    options.dryRun = true;
  }
  if (opts.force === true) {
    options.force = true;
  }
  if (opts.verifyEndpoint !== undefined) {
    options.verifyEndpoint = opts.verifyEndpoint;
  }
  return options;
}

function buildUpgradeOptions(
  opts: UpgradeCommandOptions,
  json: boolean,
): UpgradeOptions {
  const options: UpgradeOptions = { json };
  const clients = parseClientIdList(opts.clients);
  if (clients !== undefined) {
    options.clients = clients;
  }
  if (opts.dryRun === true) {
    options.dryRun = true;
  }
  if (opts.verifyEndpoint !== undefined) {
    options.verifyEndpoint = opts.verifyEndpoint;
  }
  return options;
}

function buildUninstallOptions(
  opts: UninstallCommandOptions,
  json: boolean,
): UninstallOptions {
  const options: UninstallOptions = { json };
  const clients = parseClientIdList(opts.clients);
  if (clients !== undefined) {
    options.clients = clients;
  }
  if (opts.dryRun === true) {
    options.dryRun = true;
  }
  if (opts.keepState === true) {
    options.clearState = false;
  }
  return options;
}

function buildDoctorOptions(opts: DoctorCommandOptions, json: boolean): DoctorOptions {
  const options: DoctorOptions = { json };
  if (opts.verifyEndpoint !== undefined) {
    options.verifyEndpoint = opts.verifyEndpoint;
  }
  return options;
}

export async function handleInstall(
  ctx: CliHandlerContext,
  opts: InstallCommandOptions,
  command: Command,
): Promise<void> {
  const json = isJsonMode(command);
  const output = createCliOutput(json);
  const result = await ctx.installer.install(buildInstallOptions(opts, json));
  renderInstallResult(result, output);
  setExitCode(result.success);
}

export async function handleUpgrade(
  ctx: CliHandlerContext,
  opts: UpgradeCommandOptions,
  command: Command,
): Promise<void> {
  const json = isJsonMode(command);
  const output = createCliOutput(json);
  const result = await ctx.installer.upgrade(buildUpgradeOptions(opts, json));
  renderUpgradeResult(result, output);
  setExitCode(result.success);
}

export async function handleUninstall(
  ctx: CliHandlerContext,
  opts: UninstallCommandOptions,
  command: Command,
): Promise<void> {
  const json = isJsonMode(command);
  const output = createCliOutput(json);
  const result = await ctx.installer.uninstall(buildUninstallOptions(opts, json));
  renderUninstallResult(result, output);
  setExitCode(result.success);
}

export async function handleStatus(
  ctx: CliHandlerContext,
  _opts: StatusOptions,
  command: Command,
): Promise<void> {
  const json = isJsonMode(command);
  const output = createCliOutput(json);
  const result = await ctx.installer.status({ json });
  renderStatusResult(result, output);
  setExitCode(true);
}

export async function handleDoctor(
  ctx: CliHandlerContext,
  opts: DoctorCommandOptions,
  command: Command,
): Promise<void> {
  const json = isJsonMode(command);
  const output = createCliOutput(json);
  const report = await ctx.installer.doctor(buildDoctorOptions(opts, json));
  renderDoctorReport(report, output);
  setExitCode(report.healthy);
}

export function createDefaultHandlerContext(): CliHandlerContext {
  return { installer: createDefaultInstaller() };
}
