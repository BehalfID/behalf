# shared — BehalfID Adapter Utilities

Shared types and helper functions used by all integration adapters. Import from here rather than duplicating across adapters.

## Types

### `BehalfIDClient`

Minimal interface satisfied by `@behalfid/sdk`'s `BehalfID` class. Adapters accept this interface rather than the concrete class, so you can pass a real SDK instance or a mock in tests.

```typescript
type BehalfIDClient = {
  verify(input: VerifyInput): Promise<VerifyResult>;
};
```

### `IntegrationConfig`

Passed to every adapter function. Holds the client and the agent ID.

```typescript
type IntegrationConfig = {
  client: BehalfIDClient;
  agentId: string;
};
```

### `GatedResult<T>`

Union of `AllowedResponse<T>` and `DenyResponse`. Discriminated on `blocked`.

```typescript
if (result.blocked) {
  console.error(result.reason); // DenyResponse
} else {
  use(result.result); // AllowedResponse<T>
}
```

## Functions

### `makeDenyResponse(result)`

Convert a `VerifyResult` into a `DenyResponse`. Used internally by adapters.

### `requireEnvVars(vars)`

Throw at startup if any required environment variables are absent. Call once during module initialization to fail fast.

```typescript
requireEnvVars(["BEHALFID_API_KEY", "BEHALFID_AGENT_ID"]);
```

### `mapToVerifyInput(agentId, action, overrides?)`

Build a `VerifyInput` from an action name and optional overrides.

```typescript
const input = mapToVerifyInput("agent_1", "purchase", { amount: 500, vendor: "acme.com" });
```

### `withAuditMetadata(input, meta)`

Merge audit metadata into a `VerifyInput` without overwriting existing `metadata` keys.

```typescript
const input = withAuditMetadata(baseInput, { traceId: "t_abc", userId: "u_xyz" });
```
