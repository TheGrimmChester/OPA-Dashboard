# Configuration

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Base URL for OPA-Hub. Empty string = same-origin (nginx proxies `/api/` to the hub). |

## Images

| Tag | Use |
|-----|-----|
| `opa-dashboard:smoke` | Local / laptop smoke stacks |
| `opa-dashboard:nas` | Production (NAS) — use `*:nas` only |

Do not deploy smoke tags to production hosts.
