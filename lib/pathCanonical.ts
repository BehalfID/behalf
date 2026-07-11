/**
 * Lexical path normalization for policy evaluation and approval fingerprints.
 * Does not require the target to exist (no realpath).
 * Normalizes separators, redundant slashes, `.` and `..` segments, and
 * preserves Windows drive-letter prefixes.
 */
export function lexicalNormalizePath(inputPath: string): string {
  const raw = inputPath.replace(/\\/g, "/");
  if (!raw) return "";

  let prefix = "";
  let rest = raw;

  // UNC paths: //server/share/...
  if (rest.startsWith("//")) {
    const uncMatch = rest.match(/^\/\/[^/]+\/[^/]+/);
    if (uncMatch) {
      prefix = uncMatch[0];
      rest = rest.slice(prefix.length);
    }
  } else {
    // Windows drive: C:/... or C:foo
    const driveMatch = rest.match(/^([A-Za-z]:)(\/)?/);
    if (driveMatch) {
      prefix = driveMatch[1] + "/";
      rest = rest.slice(driveMatch[0].length);
    } else if (rest.startsWith("/")) {
      prefix = "/";
      rest = rest.slice(1);
    }
  }

  const absolute = prefix !== "";
  const parts: string[] = [];
  for (const segment of rest.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (parts.length > 0) {
        parts.pop();
      } else if (!absolute) {
        parts.push("..");
      }
      continue;
    }
    parts.push(segment);
  }

  if (!absolute) {
    return parts.join("/") || ".";
  }
  if (prefix === "/") {
    return "/" + parts.join("/");
  }
  // Drive or UNC prefix already includes trailing structure as needed.
  if (prefix.endsWith("/")) {
    return prefix + parts.join("/");
  }
  return parts.length > 0 ? `${prefix}/${parts.join("/")}` : prefix;
}

export function isAbsolutePath(normalized: string): boolean {
  return (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.startsWith("//")
  );
}
