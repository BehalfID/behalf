# Local Ollama setup for BehalfID

BehalfID's regular-user onboarding uses a locally running Ollama instance to draft permission passports from plain-English descriptions. The AI only drafts; nothing is created until you review and confirm.

---

## How it works

1. You describe what you want an AI assistant to do in plain English.
2. BehalfID sends that description to a local Ollama model.
3. The model returns a structured draft of permissions.
4. You review the draft and click **Confirm** to create the agent and permissions.

The draft endpoint (`POST /api/dashboard/onboarding/draft-permissions`) never creates any database records.

---

## Local same-machine setup (recommended for development)

This is the simplest setup. Ollama and `npm run dev` run on the same machine.

### 1. Install Ollama

Download from [https://ollama.com](https://ollama.com). On Mac, the installer sets up a menu-bar app that handles `ollama serve` automatically.

### 2. Pull a model

```bash
ollama pull llama3.1:8b
```

Smaller/faster alternatives:

```bash
ollama pull qwen2.5:1.5b     # very fast, less capable
ollama pull qwen2.5:0.5b     # fastest, use for quick tests
```

### 3. Add env vars to `.env.local`

Create or edit `.env.local` in the project root:

```env
# Local AI-assisted permission drafting.
# localhost only works when the Next.js server and Ollama run on the same machine.
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
OLLAMA_TIMEOUT_MS=30000
```

### 4. Restart Next.js

```bash
# Stop any running dev server (Ctrl+C), then:
npm run dev
```

Next.js reads `.env.local` at startup. Changes to env files are not picked up without a restart.

### 5. Verify the setup

```bash
npm run check:ollama
```

Expected output when everything is working:

```
BehalfID Ollama config check

  ✓ OLLAMA_BASE_URL: http://localhost:11434
  ✓ OLLAMA_MODEL:    llama3.1:8b

Checking http://localhost:11434/api/tags ...

  ✓ Reachable: yes

Installed models:
    - llama3.1:8b
    - qwen2.5:1.5b

  ✓ Configured model found: yes  (llama3.1:8b)

Result:
Ollama is ready for local BehalfID drafting.
```

### 6. Test the onboarding flow

Open [http://localhost:3000/dashboard/onboarding](http://localhost:3000/dashboard/onboarding) and choose **"I'm using an existing AI assistant"**.

---

## Networking rules — where localhost works and where it doesn't

| Where Next.js runs | Where Ollama runs | `OLLAMA_BASE_URL` to use | Works? |
|---|---|---|---|
| Your Mac (npm run dev) | Same Mac | `http://localhost:11434` | ✓ Yes |
| Your Mac (npm run dev) | Another machine on LAN | `http://10.x.x.x:11434` | ✓ Yes (same network) |
| Vercel | Your Mac | `http://localhost:11434` | ✗ No — Vercel's server ≠ your Mac |
| Vercel | Public IP, no proxy | `http://72.x.x.x:11434` | ✗ Unsafe — do not expose raw Ollama |
| Vercel | Secure proxy/tunnel | `https://ollama.yourdomain.com` | ✓ Yes, with auth |

**Key point:** `localhost` in an environment variable always refers to the machine running the Next.js server, not your laptop.

---

## Using a LAN IP (same network, different machine)

If Next.js and Ollama are on different machines but on the same network:

1. Find the Ollama machine's LAN IP:
   - Mac: `ifconfig | grep "inet "` → look for `192.168.x.x` or `10.x.x.x`
   - Windows: `ipconfig` → look for IPv4 Address

2. By default, Ollama only listens on `127.0.0.1`. To accept connections from other machines on your network, set:
   ```bash
   # On the Ollama machine, before starting ollama serve:
   export OLLAMA_HOST=0.0.0.0:11434
   ollama serve
   ```

3. Set `OLLAMA_BASE_URL` to the LAN IP:
   ```env
   OLLAMA_BASE_URL=http://10.8.9.54:11434
   ```

4. Make sure your firewall allows port 11434 from your local network only.

> **Warning:** Do not bind Ollama to `0.0.0.0` if your machine has a public IP without a firewall — anyone on the internet could use your GPU.

---

## Vercel production

Vercel cannot reach your Mac's localhost or a private LAN IP. The draft flow will return:

```json
{
  "error": "Ollama is configured as localhost in production.",
  "details": "In production, localhost points to the Vercel server, not your Mac. Use local development (npm run dev), or configure a secure reachable Ollama proxy."
}
```

Options for production:

- **Keep AI drafting local only.** Run `npm run dev` and use the onboarding flow from your laptop. This is the simplest and safest option.
- **Use a protected proxy/tunnel.** Run a reverse proxy (Nginx, Caddy, Cloudflare Tunnel) in front of Ollama with authentication, then set `OLLAMA_BASE_URL` to the HTTPS proxy URL in Vercel environment variables.
- **Use a hosted Ollama service.** Some providers offer hosted Ollama-compatible APIs.

Do not expose raw Ollama on a public IP without authentication.

---

## Env var reference

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_BASE_URL` | *(none)* | Base URL of the Ollama server. Must be set for drafting to work. |
| `OLLAMA_MODEL` | *(none)* | Model name, e.g. `llama3.1:8b`. Must be pulled before use. |
| `OLLAMA_TIMEOUT_MS` | `30000` | Request timeout in milliseconds. Increase for slow machines or large models. |

---

## Error reference

| Error | Cause | Fix |
|---|---|---|
| `AI-assisted drafting is not configured.` | `OLLAMA_BASE_URL` or `OLLAMA_MODEL` not set | Add both to `.env.local` and restart Next.js |
| `Ollama is configured as localhost in production.` | Running on Vercel with `localhost` URL | Use `npm run dev` locally, or set up a proxy |
| `Ollama is not reachable.` | Ollama not running, wrong URL, or firewall | Run `npm run check:ollama` to diagnose |
| `Configured Ollama model is not available.` | Model not pulled | Run `ollama pull <model>` |
| `Ollama timed out.` | Model too slow | Use a smaller model or increase `OLLAMA_TIMEOUT_MS` |
| `Ollama returned an invalid draft.` | Model returned garbled output | Try again, or switch to a stronger model |

---

## Quick commands

```bash
# Check config and connectivity
npm run check:ollama

# Pull a model
ollama pull llama3.1:8b

# See installed models
ollama list

# Start Ollama (Mac app handles this automatically)
ollama serve

# See what's listening on port 11434
lsof -nP -iTCP:11434 -sTCP:LISTEN
```
