# Open Profiling Agent — Dashboard

React SPA for the self-hosted Open Profiling Agent.

## Quickstart

Use the stack quickstart so ClickHouse + agent + demo traffic start together:

```bash
cd ../OPA-stack && ./harness/quickstart.sh
# Dashboard: http://127.0.0.1:8088
```

## Community

- [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md)
- [Licensing FAQ](docs/LICENSING.md) · [Changelog](CHANGELOG.md)

## Develop

```bash
npm install
npm run dev
```

Point `VITE_API_URL` at a running agent (default empty = same origin / proxy).
