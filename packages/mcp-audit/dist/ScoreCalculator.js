import { SEVERITY_SCORE_WEIGHTS, } from "./types.js";
/**
 * Calculates an overall security score from findings.
 *
 * Starts at 100 and deducts weighted points per finding severity.
 * The result is clamped to [0, 100].
 */
export class ScoreCalculator {
    weights;
    constructor(weights = SEVERITY_SCORE_WEIGHTS) {
        this.weights = weights;
    }
    calculate(findings) {
        let score = 100;
        for (const finding of findings) {
            score -= this.weights[finding.severity] ?? 0;
        }
        return clamp(score, 0, 100);
    }
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
