-- Optional per-agent Ollama runtime convenience fields (developer inference proxy).
-- Not an enforcement tier — verify()/MCP/SDK still gate tool actions.

ALTER TABLE "agents"
  ADD COLUMN IF NOT EXISTS "ollama_base_url" text;
ALTER TABLE "agents"
  ADD COLUMN IF NOT EXISTS "ollama_model" text;
