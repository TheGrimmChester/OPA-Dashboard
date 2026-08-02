# Security views redesign — assumptions

**Project:** `designs/security-views/`  
**Source:** canvas `security-views-redesign` + live `/security` · chrome from `security-repo-watch`  
**Fidelity:** Hi-fi interactive preview (OPA tokens, IBM Plex)

## Brief
Replace 13 flat tabs with four pillars: **Findings · Scans · PR Ops · Control**.

## Preview
`preview.html?pillar=findings|scans|ops|control`  
Ops modes: `?mode=watch|run|contexts|jobs|webhooks`  
Control sections: `?section=agents|policies|gate|inventory`

## Out of scope
Production port; real API wiring; NAS deploy.
