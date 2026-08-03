-- Add ollama to the agents.provider check constraint.
-- Applied via operator-controlled migration (npm run db:migrate).

ALTER TABLE "agents"
  DROP CONSTRAINT IF EXISTS "agents_provider_check";
ALTER TABLE "agents"
  ADD CONSTRAINT "agents_provider_check"
  CHECK ("provider" IN (
    'custom',
    'ollie',
    'chatgpt',
    'claude',
    'gemini',
    'zapier',
    'make',
    'langchain',
    'openai',
    'ollama',
    'other'
  ));
