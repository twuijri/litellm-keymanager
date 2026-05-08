# LiteLLM Key Manager

A self-hosted web UI for managing **LiteLLM virtual keys** — runs as a separate
stack alongside your existing LiteLLM proxy without touching it.

> Live in front of your LiteLLM proxy at any internal hostname (e.g. `litellm_app:4000`)
> and behind your reverse proxy (Nginx Proxy Manager, Traefik, Caddy…) for HTTPS.

---

## Why

LiteLLM ships an admin UI of its own, but it doesn't expose **per-key fallbacks**
in a friendly way. Fallbacks are stored in the `router_settings` JSON column on
the `LiteLLM_VerificationToken` table, and editing them by hand or via the API
is awkward. This app gives you:

- A clean list of all virtual keys with budgets, models, and fallback flags
- An editor where you can drag-and-drop reorder fallback chains per key
- One-click clone (copy a key with all its settings, including fallbacks)
- One-click regenerate (rotate a compromised key while keeping its config)

The LiteLLM master key never leaves the backend container — the browser only
holds a short-lived JWT.

---

## Features

| Feature | Notes |
| --- | --- |
| **Login** | Username + password from env or the in-app Settings page. JWT auth. |
| **Key list** | Search by alias / key / model / team. Filter to keys with fallbacks. |
| **Edit key** | Alias, max budget, allowed models, and fallback chains. |
| **Fallback editor** | Drag rows or chips to reorder. Autocomplete from your real LiteLLM models. |
| **Regenerate** | Issues a new key with the same settings, then deletes the old one. |
| **Clone** | Creates a sibling key with all settings and a new alias. |
| **Settings page** | Configure `LITELLM_MASTER_KEY` and `DATABASE_URL` from the UI. Persisted in a Docker volume. |
| **Direct DB access** | Reads and writes per-key fallbacks directly to PostgreSQL (`router_settings` column). |

---

## Architecture

```
┌────────────────┐        ┌────────────────┐        ┌────────────────┐
│   Browser      │───────▶│  frontend      │───────▶│  backend       │
│  (JWT only)    │  HTTPS │  (nginx + SPA) │  HTTP  │  (FastAPI)     │
└────────────────┘        └────────────────┘        └───────┬────────┘
        ▲                                                   │
        │                                                   │ master key
        │                                                   ▼
┌────────────────┐                              ┌──────────────────────┐
│ Nginx Proxy    │                              │  LiteLLM proxy       │
│ Manager (NPM)  │                              │  /key/list /update…  │
└────────────────┘                              └──────────┬───────────┘
                                                           │ SQL
                                                           ▼
                                                ┌────────────────────┐
                                                │  PostgreSQL        │
                                                │  (router_settings) │
                                                └────────────────────┘
```

- The **frontend** is a static React/Vite bundle served by nginx. Nginx also
  proxies `/api/*` and `/auth/*` to the backend.
- The **backend** is a FastAPI app that:
  - Talks to LiteLLM over HTTP using the master key
  - Talks to PostgreSQL directly to read/write per-key fallbacks (the
    `router_settings` JSONB column on `LiteLLM_VerificationToken`)
- All secrets live on the backend container — never sent to the browser.

---

## Requirements

You need to be running:

1. **LiteLLM proxy** in Docker, with its container reachable on a Docker network
   (commonly `litellm_internal`). Default URL the app expects:
   `http://litellm_app:4000`.
2. **PostgreSQL** that LiteLLM uses (also commonly on `litellm_internal`).
   Default expected hostname: `litellm_db:5432`.
3. **A reverse proxy** (Nginx Proxy Manager, Traefik, etc.) on a network the
   frontend can join — the example compose uses `npm_default`.

Both `litellm_internal` and `npm_default` are referenced as **external**
networks; the compose file does not create them.

> If your network names differ, edit the `networks` block at the bottom of
> `docker-compose.yml`.

---

## Quick start

### 1. Drop this into your Docker host (works great with Dockge / Portainer)

```yaml
services:
  backend:
    image: ghcr.io/twuijri/litellm-keymanager-backend:latest
    pull_policy: always
    container_name: keymanager_backend
    restart: unless-stopped
    environment:
      LITELLM_BASE_URL: http://litellm_app:4000
      LITELLM_MASTER_KEY: sk-your-litellm-master-key
      DATABASE_URL: postgresql://litellm:PASSWORD@litellm_db:5432/litellm
      ADMIN_USERNAME: admin
      ADMIN_PASSWORD: ChangeMeStrongPass123!
      JWT_SECRET: REPLACE_WITH_64_HEX_CHARS
      JWT_EXPIRE_MINUTES: 720
      CORS_ORIGINS: "*"
    volumes:
      - keymanager_data:/data
    networks:
      - keymanager_internal
      - litellm_internal
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health',timeout=3).status==200 else 1)"]
      interval: 30s
      timeout: 5s
      retries: 3

  frontend:
    image: ghcr.io/twuijri/litellm-keymanager-frontend:latest
    pull_policy: always
    container_name: keymanager_frontend
    restart: unless-stopped
    depends_on:
      - backend
    networks:
      - keymanager_internal
      - npm_default
    expose:
      - "80"

volumes:
  keymanager_data:

networks:
  keymanager_internal:
    driver: bridge
  litellm_internal:
    external: true
  npm_default:
    external: true
```

### 2. Generate a JWT secret

```bash
openssl rand -hex 32
```

Paste the output as `JWT_SECRET`.

### 3. Deploy

```bash
docker compose up -d
```

### 4. Add a Proxy Host in Nginx Proxy Manager

| Field | Value |
| --- | --- |
| Domain | `keys.your-domain.com` |
| Forward Hostname | `keymanager_frontend` |
| Forward Port | `80` |
| Block Common Exploits | ✅ |
| Websockets Support | ✅ |
| SSL | Let's Encrypt + Force SSL |

### 5. Log in

Open `https://keys.your-domain.com` and sign in with the
`ADMIN_USERNAME` / `ADMIN_PASSWORD` you set above.

---

## Configuration

### Environment variables

All values can be set as environment variables in the stack. Anything marked
**editable from UI** can be overridden at runtime in the in-app Settings page
(saved to `/data/settings.json`).

| Variable | Required | Default | Editable from UI | Description |
| --- | :---: | --- | :---: | --- |
| `LITELLM_BASE_URL` | no | `http://litellm_app:4000` | ✅ | Internal URL of your LiteLLM proxy. |
| `LITELLM_MASTER_KEY` | no¹ | _(empty)_ | ✅ | LiteLLM admin master key. API endpoints return 503 until set. |
| `DATABASE_URL` | no² | _(empty)_ | ✅ | `postgresql://user:pass@host:port/db` — required for fallback editing. |
| `ADMIN_USERNAME` | no | `admin` | ❌ | Web UI login. |
| `ADMIN_PASSWORD` | **yes** | — | ❌ | Plain or bcrypt hash. Required for first login. |
| `JWT_SECRET` | **yes** | — | ❌ | Random 32+ char string used to sign JWTs. |
| `JWT_EXPIRE_MINUTES` | no | `720` | ❌ | Session lifetime. |
| `CORS_ORIGINS` | no | `*` | ✅ | Comma-separated allowed origins. |

¹ Optional in env, but most features need it. Set via Settings UI if you don't
want it in your stack file.

² Optional, but **per-key fallbacks won't appear or be editable** unless this is
set, because LiteLLM stores them in a column the API doesn't expose.

### Settings UI

A **Settings** button in the top-right opens a panel where you can change:

- LiteLLM base URL
- LiteLLM master key (with show/hide; leave blank to keep current)
- PostgreSQL `DATABASE_URL` (with **Test connection** button)
- CORS origins

Values from the Settings page **override** environment variables and persist
to `/data/settings.json` inside the volume `keymanager_data`. Click **Reset**
on a field to drop the override and fall back to the env value.

This means you can ship the stack to a friend with **only `ADMIN_PASSWORD` and
`JWT_SECRET`** in the env, and configure everything else via the UI on first
login.

### Sensitive values — what stays where

| Where | What |
| --- | --- |
| Browser (`localStorage`) | JWT only. Never the master key. |
| Backend container memory | Master key, DB password (loaded from env or settings.json). |
| Volume `/data/settings.json` | Any overrides set via the Settings UI (in plaintext). |
| Stack file | Whatever you put there. Master key and DB URL are optional. |

---

## How fallbacks are stored

LiteLLM stores per-key fallbacks in a JSONB column called `router_settings`
on the `LiteLLM_VerificationToken` table:

```json
{
  "fallbacks": [
    {"gpt-4o": ["claude-sonnet-4-6", "gemini-3.1-pro-high"]},
    {"gpt-4.1-mini": ["gpt-4o-mini"]}
  ]
}
```

- **Reads:** the backend joins LiteLLM's `/key/list` response with the
  `router_settings` column for each key and exposes them as a single
  `metadata.fallbacks` array.
- **Writes:** when you save a key, the backend writes the new value back to the
  `router_settings` column directly (the LiteLLM API has no field for this
  yet).
- **Clone / Regenerate:** copy the original key's `router_settings` to the new
  key's row after creation, so fallbacks survive both operations.

---

## Updating

The stack uses GHCR images tagged `:latest`. After every push to `main`, GitHub
Actions rebuilds and republishes both images. To update:

```bash
docker compose pull
docker compose up -d
```

…or click **Update** in Dockge.

---

## Tech stack

- **Backend:** Python 3.12, FastAPI, httpx, asyncpg, python-jose, passlib
- **Frontend:** React 18, Vite, TailwindCSS, dnd-kit
- **Runtime:** Docker (multi-arch images: `linux/amd64`, `linux/arm64`)
- **Auth:** JWT signed with HS256

---

## Project structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + lifespan
│   │   ├── config.py            # env + settings.json overrides
│   │   ├── settings_store.py    # /data/settings.json read/write
│   │   ├── auth.py              # /auth/login, /auth/me, JWT
│   │   ├── litellm_client.py    # HTTP client for LiteLLM
│   │   ├── db.py                # asyncpg pool + LiteLLM table queries
│   │   └── routes/
│   │       ├── keys.py          # /api/keys, generate, update, regen, clone
│   │       └── settings.py      # /api/settings + test-database
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   ├── styles.css
│   │   └── components/
│   │       ├── Login.jsx
│   │       ├── KeyList.jsx
│   │       ├── KeyEditor.jsx
│   │       ├── FallbackEditor.jsx       # drag & drop fallbacks
│   │       ├── NewKeyDialog.jsx
│   │       ├── RevealKeyDialog.jsx      # one-time secret display
│   │       ├── ConfirmDialog.jsx
│   │       ├── SettingsDialog.jsx
│   │       ├── MultiSelect.jsx
│   │       ├── CopyField.jsx
│   │       └── Modal.jsx
│   ├── nginx.conf
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── .env.example
└── .github/workflows/build.yml          # multi-arch GHCR build
```

---

## Local development

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export LITELLM_MASTER_KEY=sk-…  ADMIN_PASSWORD=admin  JWT_SECRET=$(openssl rand -hex 32)
uvicorn app.main:app --reload --port 8000

# Frontend (in another terminal)
cd frontend
npm install
npm run dev
```

Vite proxies `/api` and `/auth` to `localhost:8000` automatically.

---

## License

No license file included — treat as "all rights reserved" unless you add one.
