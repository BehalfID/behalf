import { describe, expect, it } from "vitest";
import {
  listRepositoryBackendOverrides,
  resolveRepositoryBackend,
  resolveRepositoryBackendFor
} from "@/lib/repositories/backend";
import { getRepositories, resetRepositoryCacheForTests } from "@/lib/repositories/composition";

describe("repository backend selection", () => {
  it("defaults to mongo", () => {
    expect(resolveRepositoryBackend({})).toBe("mongo");
    expect(resolveRepositoryBackend({ BEHALFID_REPOSITORY_BACKEND: "mongo" })).toBe("mongo");
  });

  it("rejects postgres without the safety latch", () => {
    expect(() =>
      resolveRepositoryBackend({ BEHALFID_REPOSITORY_BACKEND: "postgres" })
    ).toThrow(/BEHALFID_ALLOW_POSTGRES_RUNTIME=true/i);
  });

  it("allows postgres when the safety latch is set", () => {
    expect(
      resolveRepositoryBackend({
        BEHALFID_REPOSITORY_BACKEND: "postgres",
        BEHALFID_ALLOW_POSTGRES_RUNTIME: "true"
      })
    ).toBe("postgres");
  });

  it("resolves per-aggregate overrides over the global default", () => {
    const env = {
      BEHALFID_REPOSITORY_BACKEND: "mongo",
      BEHALFID_ALLOW_POSTGRES_RUNTIME: "true",
      BEHALFID_REPO_BACKEND_APPROVALS: "postgres",
      BEHALFID_REPO_BACKEND_MANAGED_PROFILES: "postgres",
      BEHALFID_REPO_BACKEND_USERS: "mongo"
    };
    expect(resolveRepositoryBackendFor("approvals", env)).toBe("postgres");
    expect(resolveRepositoryBackendFor("managedProfiles", env)).toBe("postgres");
    expect(resolveRepositoryBackendFor("users", env)).toBe("mongo");
    expect(resolveRepositoryBackendFor("accounts", env)).toBe("mongo");
  });

  it("rejects per-aggregate postgres without the safety latch", () => {
    expect(() =>
      resolveRepositoryBackendFor("webhooks", {
        BEHALFID_REPO_BACKEND_WEBHOOKS: "postgres"
      })
    ).toThrow(/BEHALFID_ALLOW_POSTGRES_RUNTIME=true/i);
  });

  it("lists override diagnostics", () => {
    expect(
      listRepositoryBackendOverrides({
        BEHALFID_REPO_BACKEND_ACCOUNTS: "postgres",
        BEHALFID_REPO_BACKEND_SITES: "mongo"
      })
    ).toEqual({ accounts: "postgres", sites: "mongo" });
  });

  it("getRepositories returns the mongo bundle by default", () => {
    resetRepositoryCacheForTests();
    const repos = getRepositories({});
    expect(repos.accounts.findAccountById).toBeTypeOf("function");
    expect(repos.approvals.consumeApprovedGrant).toBeTypeOf("function");
    expect(repos.users.findByUserId).toBeTypeOf("function");
  });

  it("getRepositories rejects postgres without a database URL when an adapter is ready", () => {
    resetRepositoryCacheForTests();
    expect(() =>
      getRepositories({
        BEHALFID_ALLOW_POSTGRES_RUNTIME: "true",
        BEHALFID_REPO_BACKEND_ACCOUNTS: "postgres"
      })
    ).toThrow(/DATABASE_URL|POSTGRES_URL/i);
  });

  it("getRepositories rejects global postgres without a database URL", () => {
    resetRepositoryCacheForTests();
    expect(() =>
      getRepositories({
        BEHALFID_REPOSITORY_BACKEND: "postgres",
        BEHALFID_ALLOW_POSTGRES_RUNTIME: "true"
      })
    ).toThrow(/DATABASE_URL|POSTGRES_URL/i);
  });
});
