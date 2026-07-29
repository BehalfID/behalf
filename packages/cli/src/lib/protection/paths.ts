import { existsSync, realpathSync } from "node:fs";
import {
  isAbsolute,
  normalize,
  relative,
  resolve,
  sep,
} from "node:path";

/**
 * Normalize Windows drive letter to uppercase (e.g. `c:\` → `C:\`).
 * Exported for tests.
 */
export function normalizeDriveLetter(input: string): string {
  if (process.platform === "win32" && /^[a-zA-Z]:/.test(input)) {
    return input.charAt(0).toUpperCase() + input.slice(1);
  }
  return input;
}

/**
 * Resolve to an absolute, normalized path. Uses realpathSync when the path
 * exists; falls back to normalize(resolve(...)) when it does not.
 * On Windows, uppercases the drive letter for stable comparisons.
 */
export function canonicalizePath(input: string): string {
  const absolute = resolve(input);
  let resolved: string;
  try {
    if (existsSync(absolute)) {
      resolved = realpathSync(absolute);
    } else {
      resolved = normalize(absolute);
    }
  } catch {
    resolved = normalize(absolute);
  }
  // Strip trailing separator except for root (`/` or `C:\`)
  if (resolved.length > 1 && (resolved.endsWith(sep) || resolved.endsWith("/"))) {
    resolved = resolved.replace(/[/\\]+$/, "");
  }
  return normalizeDriveLetter(resolved);
}

/**
 * True when `child` is equal to `root` or a descendant of `root`.
 * Uses path.relative — never naive string prefix matching — so
 * `project` vs `project-old` correctly returns false.
 */
export function isPathInsideOrEqual(child: string, root: string): boolean {
  const childCanon = canonicalizePath(child);
  const rootCanon = canonicalizePath(root);

  if (pathsEqual(childCanon, rootCanon)) return true;

  const rel = relative(rootCanon, childCanon);
  if (!rel || rel === "") return true;
  // Outside root: relative walks up (`..`) or is absolute on another drive
  if (isAbsolute(rel)) return false;
  const first = rel.split(/[/\\]/)[0];
  return first !== "..";
}

/**
 * Case-insensitive path equality on Windows; exact elsewhere.
 * Exported for tests.
 */
export function pathsEqual(a: string, b: string): boolean {
  if (process.platform === "win32") {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

/**
 * Compare two canonical paths for nesting depth (longer / more specific wins).
 * Exported for tests.
 */
export function pathDepth(canonicalPath: string): number {
  const trimmed = canonicalPath.replace(/[/\\]+$/, "");
  if (!trimmed) return 0;
  return trimmed.split(/[/\\]/).filter(Boolean).length;
}
