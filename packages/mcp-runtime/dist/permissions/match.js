/**
 * Match a permission action pattern against a concrete action.
 *
 * Supports:
 * - exact: `filesystem.read`
 * - wildcard segment: `filesystem.*`
 * - full wildcard: `*`
 */
export function matchAction(pattern, action) {
    if (pattern === "*" || pattern === action)
        return true;
    if (!pattern.includes("*"))
        return false;
    const patternParts = pattern.split(".");
    const actionParts = action.split(".");
    if (patternParts[patternParts.length - 1] === "*" && patternParts.length === 1) {
        return true;
    }
    if (patternParts.length > actionParts.length)
        return false;
    for (let i = 0; i < patternParts.length; i++) {
        const p = patternParts[i];
        if (p === "*") {
            // trailing * matches remaining segments
            if (i === patternParts.length - 1)
                return true;
            continue;
        }
        if (p !== actionParts[i])
            return false;
    }
    return patternParts.length === actionParts.length ||
        patternParts[patternParts.length - 1] === "*";
}
/** Match a resource scope. Trailing `*` is supported. */
export function matchResource(pattern, resource) {
    if (!pattern)
        return true;
    if (!resource)
        return false;
    if (pattern === "*" || pattern === resource)
        return true;
    if (pattern.endsWith("*")) {
        return resource.startsWith(pattern.slice(0, -1));
    }
    return false;
}
export function isPermissionExpired(permission, now = new Date()) {
    if (!permission.expiresAt)
        return false;
    const exp = Date.parse(permission.expiresAt);
    if (Number.isNaN(exp))
        return false;
    return exp <= now.getTime();
}
/**
 * Evaluate whether a permission grant applies to a concrete request.
 */
export function permissionApplies(permission, opts) {
    if (isPermissionExpired(permission, opts.now))
        return false;
    if (!matchAction(permission.action, opts.action))
        return false;
    if (!matchResource(permission.resource, opts.resource))
        return false;
    if (permission.server && permission.server !== opts.server)
        return false;
    if (permission.tool && permission.tool !== opts.tool)
        return false;
    if (permission.subjectId && permission.subjectId !== opts.subjectId)
        return false;
    if (permission.workspaceId &&
        opts.workspaceId &&
        permission.workspaceId !== opts.workspaceId) {
        return false;
    }
    return true;
}
/**
 * Derive a logical permission string from server/tool names when the caller
 * does not supply one. Heuristic only — hosts may override via invocation.permission.
 */
export function derivePermission(server, tool) {
    const name = `${server}.${tool}`.toLowerCase();
    if (/(^|[._-])(shell|bash|terminal|exec|spawn)([._-]|$)/.test(name)) {
        return "shell.execute";
    }
    if (/(write|edit|create|save)/.test(name) &&
        /(^|[._-])(file|fs|filesystem)([._-]|$)/.test(name)) {
        return "filesystem.write";
    }
    if (/(delete|unlink|remove|(^|[._-])rm([._-]|$))/.test(name)) {
        return "filesystem.delete";
    }
    if (/(read|list|cat|(^|[._-])get([._-]|$))/.test(name) &&
        /(^|[._-])(file|fs|filesystem)([._-]|$)/.test(name)) {
        return "filesystem.read";
    }
    if (/git/.test(name) && /push/.test(name))
        return "git.push";
    if (/(browse|browser|open_url)/.test(name))
        return "browser.open";
    if (/(http|fetch|request|curl|wget)/.test(name))
        return "http.request";
    return `mcp.${server}.${tool}`;
}
