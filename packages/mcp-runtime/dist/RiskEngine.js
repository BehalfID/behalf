import { derivePermission } from "./permissions/match.js";
const LEVEL_SCORE = {
    low: 15,
    medium: 40,
    high: 70,
    critical: 95,
};
/**
 * Default heuristic risk scorer — extensible via additional {@link RiskScorer}s.
 */
export class HeuristicRiskScorer {
    id = "heuristic";
    assess(context, permission) {
        const action = permission ??
            context.invocation.permission ??
            derivePermission(context.invocation.server, context.invocation.tool);
        const factors = [];
        let score = 10;
        if (/shell\.|exec|terminal/.test(action)) {
            score += 50;
            factors.push("shell-execution");
        }
        if (/filesystem\.delete|filesystem\.write/.test(action)) {
            score += 35;
            factors.push("filesystem-mutation");
        }
        if (/git\.push|deploy|publish/.test(action)) {
            score += 40;
            factors.push("remote-mutation");
        }
        if (/http\.|browser\.|network/.test(action)) {
            score += 20;
            factors.push("network-access");
        }
        if (/filesystem\.read/.test(action)) {
            score += 10;
            factors.push("filesystem-read");
        }
        const priorHigh = context.session.priorActions.filter((a) => a.risk === "high" || a.risk === "critical").length;
        if (priorHigh >= 3) {
            score += 15;
            factors.push("elevated-session-history");
        }
        const args = context.invocation.arguments ?? {};
        const argText = JSON.stringify(args).toLowerCase();
        if (/rm\s+-rf|curl\s+|wget\s+|powershell|invoke-expression/.test(argText)) {
            score += 25;
            factors.push("dangerous-argument-pattern");
        }
        score = Math.min(100, score);
        return {
            level: scoreToLevel(score),
            score,
            factors: factors.length > 0 ? factors : ["default"],
        };
    }
}
function scoreToLevel(score) {
    if (score >= 85)
        return "critical";
    if (score >= 60)
        return "high";
    if (score >= 30)
        return "medium";
    return "low";
}
/**
 * Risk Engine — aggregates scorers (max level / max score wins).
 * Extension point for future ML-based scorers.
 */
export class RiskEngine {
    scorers;
    constructor(scorers = [new HeuristicRiskScorer()]) {
        this.scorers = scorers;
    }
    register(scorer) {
        this.scorers.push(scorer);
        return this;
    }
    assess(context, permission) {
        let best = { level: "low", score: 0, factors: [] };
        for (const scorer of this.scorers) {
            const result = scorer.assess(context, permission);
            if (result.score > best.score ||
                LEVEL_SCORE[result.level] > LEVEL_SCORE[best.level]) {
                best = {
                    level: result.level,
                    score: Math.max(best.score, result.score),
                    factors: [...new Set([...best.factors, ...result.factors])],
                };
            }
        }
        return best;
    }
}
