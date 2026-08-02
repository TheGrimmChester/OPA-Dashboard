# Repo Watch / PR Jobs — design assumptions

**Project:** `designs/repo-watch-pr-jobs/`  
**Fidelity:** Hi-fi interactive prototype (baoyu-design)  
**Design context:** OPA-Dashboard Security SCM (`wave28-30-verticals`) tokens + product fields.

## Problem
Dense Security → PR Jobs / Watch UI. Operators need “why did this run / what happened / what do I trust?” without a 12-column wall.

## Direction (v3)
Evidence-first ops console with professional master–detail UX **plus interactive repo/PR agent controls**.

1. **PR Jobs** — queue + evidence preview; PR-level agent actions (re-run Bugbot/Security, Cloud autofix, override approval).
2. **Evidence** — chain + frozen effective agent prefs for that repo/PR.
3. **Repo Watch** — selectable repo drawer: enable, AI blocking, auto-reviewer, min score, check toggles → deep-link to Agents.
4. **Agents** — Bugbot / Security / Approval / Cloud cards with org|installation|repo scope (matches Dashboard AgentsTab fields).
5. **Webhooks** — delivery receipts with honesty → jump-to-job.

## Data (sample)
12 jobs · 8 watched repos · 10 webhook deliveries across multiple orgs/projects and status paths (running, waiting, failed, blocked, superseded, ignored, bad signature).

## Visual system
OPA dark tokens, IBM Plex, roomier than production Security, focus rings, live pulses for in-flight, no usage charts.
