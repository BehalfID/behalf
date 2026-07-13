import { vi } from "vitest";

/**
 * Stub both HOME and USERPROFILE so Node's os.homedir() resolves to the
 * temp directory on Windows and Unix during CLI tests.
 */
export function stubCliHome(home: string) {
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
}
