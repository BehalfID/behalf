import type { DoctorOptions, DoctorReport } from "../types/index.js";

/**
 * Verifies that BehalfID is installed, registered, and healthy.
 */
export interface Verifier {
  /** Run all health checks and return a machine-readable report. */
  verify(options?: DoctorOptions): Promise<DoctorReport>;
}
