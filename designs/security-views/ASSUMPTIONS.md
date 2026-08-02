# Security views redesign — assumptions

**Project:** `designs/security-views/`  
**Source:** live `/security?tab=control&section=agents` · chrome from `security-repo-watch`  
**Fidelity:** Hi-fi interactive preview (OPA tokens)

## Brief
Replace flat Security tabs with four pillars: **Findings · Scans · PR Ops · Control**.

Control → **Agents** winner: **C · Detail** (domain rail + inspector).
Ported to production `AgentsTab.jsx` / `Security.css`.

Layouts explored:
- **A · Cards** — capability strip + 2×2 domain cards
- **B · Jump** — sticky domain chips + stacked sections
- **C · Detail** — domain rail + inspector ← **shipped**

## Preview
- Interactive: `preview.html?pillar=control&section=agents&variant=c`
- Side-by-side: `agents-compare.html`
- Control sections: `?section=agents|policies|gate|inventory`

## Out of scope
Real API changes; NAS deploy (use existing dashboard release path).
