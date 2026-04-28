# Shannon — Quick Start

Get running in under 5 minutes.

## Step 1 — Install prerequisites

- [Docker Desktop](https://docs.docker.com/get-docker/) (required on all platforms)
- [Node.js 18+](https://nodejs.org/) (required for `npx`)

## Step 2 — Set your API key

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

> **Where do I get a key?** [console.anthropic.com](https://console.anthropic.com)

## Step 3 — Run a pentest

```bash
npx @keygraph/shannon start -u https://your-app.com -r /path/to/your-repo
```

Shannon will pull its Docker image (~1 GB), start the infrastructure, and launch the scan.
Results are saved to `~/.shannon/workspaces/`.

---

## Not working?

Run the built-in checker to diagnose common issues:

```bash
npx @keygraph/shannon check
```

Common fixes:

| Problem | Fix |
|---|---|
| `Docker is not running` | Open Docker Desktop, wait for it to start |
| `No credentials found` | `export ANTHROPIC_API_KEY=sk-ant-...` |
| `docker compose: command not found` | Upgrade Docker Desktop to v3.6+ |
| `localhost` not reachable | Use `host.docker.internal` instead of `localhost` in the URL |

---

## Common options

```bash
# Scan with a config file (adds auth, focus rules, etc.)
npx @keygraph/shannon start -u https://your-app.com -r /path/to/repo -c config.yaml

# Give the scan a name so you can resume it later
npx @keygraph/shannon start -u https://your-app.com -r /path/to/repo -w my-audit

# Resume a named scan (skips completed phases)
npx @keygraph/shannon start -u https://your-app.com -r /path/to/repo -w my-audit

# Watch the live log
npx @keygraph/shannon logs my-audit

# List all past scans
npx @keygraph/shannon workspaces
```

---

## Adding authentication (optional)

Create a `config.yaml` file to let Shannon log in to your app:

```yaml
authentication:
  login_type: form
  login_url: "https://your-app.com/login"
  credentials:
    username: "test@example.com"
    password: "password123"
  login_flow:
    - "Type $username into the email field"
    - "Type $password into the password field"
    - "Click the Sign In button"
  success_condition:
    type: url_contains
    value: "/dashboard"
```

Then run:

```bash
npx @keygraph/shannon start -u https://your-app.com -r /path/to/repo -c config.yaml
```

See [`configs/example-config.yaml`](apps/worker/configs/example-config.yaml) for all options.

---

## What happens during a scan?

Shannon runs five phases automatically:

```
Phase 1 — Pre-Recon    Scans the target and reads your source code
Phase 2 — Recon        Maps all entry points, APIs, and auth flows
Phase 3 — Vuln Scan    5 agents run in parallel (Injection, XSS, Auth, Authz, SSRF)
Phase 4 — Exploit      Proves each finding with a real, working exploit
Phase 5 — Report       Writes a pentest-grade report with copy-paste PoCs
```

A full scan takes roughly 1–1.5 hours and costs approximately $50 using Claude Sonnet.

---

## Local development (clone & build)

```bash
git clone https://github.com/KeygraphHQ/shannon.git
cd shannon
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
pnpm install && pnpm build
./shannon check          # validate setup
./shannon start -u https://your-app.com -r /path/to/repo
```

---

For full documentation see the [README](README.md).
