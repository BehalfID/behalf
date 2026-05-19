import { assertProductionEnv } from "@/lib/env";

export async function register() {
  assertProductionEnv();
}
