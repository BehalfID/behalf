import type {
  CheckStatus,
  DoctorReport,
  InstallResult,
  InstallerError,
  OperationWarning,
  StatusResult,
  UninstallResult,
  UpgradeResult,
} from "../types/index.js";
import type { CliOutput } from "./output.js";

function statusIcon(status: CheckStatus): string {
  switch (status) {
    case "pass":
      return "✓";
    case "warn":
      return "!";
    case "fail":
      return "✗";
    case "skip":
      return "-";
  }
}

function printWarnings(output: CliOutput, warnings: OperationWarning[]): void {
  if (warnings.length === 0) {
    return;
  }
  output.writeLine("");
  output.writeLine("Warnings:");
  for (const warning of warnings) {
    output.writeLine(`  ! [${warning.code}] ${warning.message}`);
  }
}

function printErrors(output: CliOutput, errors: InstallerError[]): void {
  if (errors.length === 0) {
    return;
  }
  output.writeLine("");
  output.writeLine("Errors:");
  for (const error of errors) {
    output.writeLine(`  ✗ [${error.code}] ${error.message}`);
    if (error.remediation) {
      output.writeLine(`    → ${error.remediation}`);
    }
  }
}

export function renderInstallResult(result: InstallResult, output: CliOutput): void {
  if (output.json) {
    output.writeJson(result);
    return;
  }

  if (result.success) {
    if (result.alreadyInstalled) {
      output.writeLine(`BehalfID is already installed (version ${result.version}).`);
    } else {
      output.writeLine(`BehalfID installed successfully (version ${result.version}).`);
    }
    if (result.configuredClients.length > 0) {
      output.writeLine(`Configured clients: ${result.configuredClients.join(", ")}`);
    }
  } else {
    output.writeLine("BehalfID installation failed.");
  }

  printWarnings(output, result.warnings);
  printErrors(output, result.errors);
}

export function renderUpgradeResult(result: UpgradeResult, output: CliOutput): void {
  if (output.json) {
    output.writeJson(result);
    return;
  }

  if (result.success) {
    output.writeLine(
      `Upgraded BehalfID from ${result.previousVersion ?? "none"} to ${result.currentVersion}.`,
    );
    if (result.configuredClients.length > 0) {
      output.writeLine(`Configured clients: ${result.configuredClients.join(", ")}`);
    }
  } else {
    output.writeLine("BehalfID upgrade failed.");
  }

  printWarnings(output, result.warnings);
  printErrors(output, result.errors);
}

export function renderUninstallResult(result: UninstallResult, output: CliOutput): void {
  if (output.json) {
    output.writeJson(result);
    return;
  }

  if (result.success) {
    if (result.removedClients.length === 0) {
      output.writeLine("Nothing to uninstall.");
    } else {
      output.writeLine(`Removed BehalfID from: ${result.removedClients.join(", ")}`);
    }
    if (result.stateCleared) {
      output.writeLine("Installation state cleared.");
    }
  } else {
    output.writeLine("BehalfID uninstall failed.");
  }

  printWarnings(output, result.warnings);
  printErrors(output, result.errors);
}

export function renderStatusResult(result: StatusResult, output: CliOutput): void {
  if (output.json) {
    output.writeJson(result);
    return;
  }

  output.writeLine(`Installed: ${result.installed ? "yes" : "no"}`);
  output.writeLine(`Installer version: ${result.installerVersion}`);
  if (result.installed) {
    output.writeLine(`Installed version: ${result.installedVersion ?? "unknown"}`);
    output.writeLine(`Installed at: ${result.installedAt ?? "unknown"}`);
    output.writeLine(`Updated at: ${result.updatedAt ?? "unknown"}`);
  }

  if (result.configuredClients.length > 0) {
    output.writeLine("");
    output.writeLine("Configured clients:");
    for (const client of result.configuredClients) {
      output.writeLine(`  - ${client.clientId} (${client.mcpConfigPath})`);
    }
  }

  if (result.registeredRuntimes.length > 0) {
    output.writeLine("");
    output.writeLine("Registered runtimes:");
    for (const runtime of result.registeredRuntimes) {
      output.writeLine(`  - ${runtime.id} ${runtime.packageName}@${runtime.version}`);
    }
  }
}

export function renderDoctorReport(report: DoctorReport, output: CliOutput): void {
  if (output.json) {
    output.writeJson(report);
    return;
  }

  output.writeLine(
    report.healthy ? "BehalfID installation is healthy." : "BehalfID installation has issues.",
  );
  output.writeLine(`Installer: ${report.installerVersion}`);
  output.writeLine(`Installed version: ${report.installedVersion ?? "not installed"}`);
  output.writeLine(`Checked at: ${report.checkedAt}`);

  if (Object.keys(report.packageVersions).length > 0) {
    output.writeLine("");
    output.writeLine("Package versions:");
    for (const [pkg, version] of Object.entries(report.packageVersions)) {
      output.writeLine(`  ${pkg}: ${version}`);
    }
  }

  output.writeLine("");
  output.writeLine("Checks:");
  for (const check of report.checks) {
    output.writeLine(`  ${statusIcon(check.status)} ${check.name}: ${check.message}`);
  }
}
