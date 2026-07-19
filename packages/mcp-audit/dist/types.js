/**
 * Shared contracts for the BehalfID MCP Auditing Engine.
 *
 * These types are the public API surface for audit reports, findings,
 * remediation actions, and rule plugins.
 */
/** Severity → score deduction used by {@link ScoreCalculator}. */
export const SEVERITY_SCORE_WEIGHTS = {
    critical: 30,
    high: 15,
    medium: 7,
    low: 3,
};
/** Severity ranking for risk-level rollups (higher = worse). */
export const SEVERITY_RANK = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
};
