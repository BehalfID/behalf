import { join } from "node:path";

export function repoPath(...segments: string[]) {
  return join(process.cwd(), ...segments);
}
