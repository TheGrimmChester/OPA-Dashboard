# Changelog

## [Unreleased]

### Changed
- Dashboard is profiling/observability only: removed Security, Repo Watch, Perf Lab, review-provider settings, connectors, and roadmap from nav and routes. API traffic targets OPA-Hub via `VITE_API_URL` (nginx proxies `/api/` to `hub`).

### Added
- Feature: Diagnostics page + i18n scaffold (en/fr) with locale switcher (`/diagnostics`).
- Feature: Collaborate page — notebooks, status pages, comments, executive reports (`/collaborate`).
- Feature: Federation page — region peers, residency policy, cross-border transfers (`/federation`).
- Feature: Network page — flows, DNS/TLS health, agentless discovery, host profiles (`/network`).
- Feature: Cloud page — resources, cost, tag violations, scrapes, cloud integrations (`/cloud`).
- Feature: Automation page — ConfigBundle plan/apply/import, promote, revisions (`/automation`).
- Feature: Catalog page — entities, scorecards, teams, account groups (`/catalog`).
- Feature: Synthetics depth UI — check types, step waterfall, cert days, private location field, trace links.
- Feature: Serverless pillar — cold-start rate, billed duration, memory utilization (`/serverless`).
- Feature: Databases pillar — instance health, DB-side statements with app fingerprint drill-through, unused indexes.
- Feature: community files and System/platform docs links.
- Feature: PlatformOps `/system` page.
- Feature: Dashboards builder and exploration UX.

## [0.15.0] — 2026-07-30

### Added
- Dashboards, facets, brush-zoom, entity search (Dashboards) and platform ops (PlatformOps).
