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
- **Use the built-in secure proxy + Cloudflare Tunnel.** See below.
- **Use a hosted Ollama service.** Some providers offer hosted Ollama-compatible APIs.

Do not expose raw Ollama on a public IP without authentication.

---

## Secure proxy for Vercel production

`scripts/ollama-secure-proxy.js` is a lightweight Node.js proxy that sits in front of your local Ollama instance and requires a bearer token. Expose it publicly with Cloudflare Tunnel — **never** by opening port 11434 directly.

### Architecture

```
Vercel → HTTPS → Cloudflare Tunnel → ollama-secure-proxy (port 8787) → Ollama (port 11434)
```

The proxy only allows `GET /api/tags` and `POST /api/chat`. All other routes return 404.

### 1. Generate a shared token

```bash
openssl rand -hex 32
# Example output: a3f9c2e1b8d4...
```

Keep this value — you'll need it in step 3 and step 6.

### 2. Start the proxy on the Ollama machine

```bash
# One-time (development/test)
OLLAMA_PROXY_TOKEN=<your-token> npm run ollama:proxy

# Or add to .env.local and run:
npm run ollama:proxy
```

Default port is `8787`. Override with `OLLAMA_PROXY_PORT`.

### 3. Test the proxy locally

```bash
# Should return 401
curl http://localhost:8787/api/tags

# Should return the model list
curl -H "Authorization: Bearer <your-token>" http://localhost:8787/api/tags

# Should 404 (not in allowlist)
curl -H "Authorization: Bearer <your-token>" http://localhost:8787/api/generate
```

### 4. Expose via Cloudflare Tunnel

Install `cloudflared` and run:

```bash
cloudflared tunnel --url http://localhost:8787
```

Cloudflare prints a URL like `https://random-words.trycloudflare.com`. Use this as `OLLAMA_BASE_URL`.

For a persistent named tunnel (production):

```bash
cloudflared tunnel create ollama-proxy
cloudflared tunnel route dns ollama-proxy ollama.yourdomain.com
cloudflared tunnel run --url http://localhost:8787 ollama-proxy
```

### 5. Verify connectivity

```bash
# With OLLAMA_PROXY_TOKEN set in .env.local:
npm run check:ollama
```

The checker reads `OLLAMA_PROXY_TOKEN` and attaches it automatically.

### 6. Set env vars in Vercel

In the Vercel dashboard (or via `vercel env add`):

```
OLLAMA_BASE_URL     = https://ollama.yourdomain.com
OLLAMA_MODEL        = llama3.1:8b
OLLAMA_PROXY_TOKEN  = <same-token-from-step-1>
```

`OLLAMA_PROXY_TOKEN` is a server-only variable — it is never sent to the browser.

### Keeping the proxy running (optional)

For a long-running setup, use `pm2`, `launchd` (Mac), or `systemd` (Linux):

```bash
# pm2 (cross-platform)
pm2 start scripts/ollama-secure-proxy.js --name ollama-proxy \
  --env OLLAMA_PROXY_TOKEN=<your-token>
pm2 save
```

---

## Env var reference

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_BASE_URL` | *(none)* | Base URL of the Ollama server (or proxy). Must be set for drafting to work. |
| `OLLAMA_MODEL` | *(none)* | Model name, e.g. `llama3.1:8b`. Must be pulled before use. |
| `OLLAMA_TIMEOUT_MS` | `30000` | Request timeout in milliseconds. Increase for slow machines or large models. |
| `OLLAMA_PROXY_TOKEN` | *(none)* | Bearer token forwarded to the secure proxy. Never sent to the browser. Generate with `openssl rand -hex 32`. |
| `OLLAMA_PROXY_HOST` | `127.0.0.1` | Proxy bind address. Use `127.0.0.1` (default) when Cloudflare Tunnel is on the same machine. |
| `OLLAMA_PROXY_PORT` | `8787` | Port the proxy listens on. |
| `OLLAMA_UPSTREAM_URL` | `http://127.0.0.1:11434` | URL of the Ollama instance the proxy forwards to. |
| `OLLAMA_PROXY_TIMEOUT_MS` | `30000` | Proxy upstream timeout in milliseconds. |
| `OLLAMA_PROXY_MAX_BODY_BYTES` | `1048576` | Maximum request body size the proxy accepts (1 MB). |

---

## Error reference

| Error | Cause | Fix |
|---|---|---|
| `AI-assisted drafting is not configured.` | `OLLAMA_BASE_URL` or `OLLAMA_MODEL` not set | Add both to `.env.local` and restart Next.js |
| `Ollama is configured as localhost in production.` | Running on Vercel with `localhost` URL | Use `npm run dev` locally, or set up a proxy |
| `Ollama is not reachable.` | Ollama not running, wrong URL, or firewall | Run `npm run check:ollama` to diagnose |
| `Ollama proxy rejected the request.` | `OLLAMA_PROXY_TOKEN` mismatch between BehalfID and proxy | Ensure both sides use the same token value |
| `Configured Ollama model is not available.` | Model not pulled | Run `ollama pull <model>` |
| `Ollama timed out.` | Model too slow | Use a smaller model or increase `OLLAMA_TIMEOUT_MS` |
| `Ollama returned an invalid draft.` | Model returned garbled output | Try again, or switch to a stronger model |

---

## Quick commands

```bash
# Check config and connectivity
npm run check:ollama

# Start the secure proxy (requires OLLAMA_PROXY_TOKEN)
OLLAMA_PROXY_TOKEN=$(openssl rand -hex 32) npm run ollama:proxy

# Pull a model
ollama pull llama3.1:8b

# See installed models
ollama list

# Start Ollama (Mac app handles this automatically)
ollama serve

# See what's listening on port 11434
lsof -nP -iTCP:11434 -sTCP:LISTEN

# See what's listening on port 8787 (proxy default)
lsof -nP -iTCP:8787 -sTCP:LISTEN
```
