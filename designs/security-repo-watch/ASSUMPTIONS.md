# Security · Repo Watch + PR Jobs — design assumptions

**Project:** `designs/security-repo-watch/`  
**Source:** live `/security?tab=watch` + `/security?tab=jobs` · `src/pages/Security.jsx`  
**Fidelity:** Hi-fi interactive prototypes on a design canvas (6 artboards)

## Brief
Improve **Repo Watch** and **PR Jobs** together — full SCM ops surface.

## Variants
| | Watch | PR Jobs |
|---|---|---|
| **A · Faithful** | Stacked panels + jump nav | Status chips + table + evidence drawer |
| **B · Workspace** | Mode tabs + master–detail gate | Always-on queue | evidence split |
| **C · Novel** | Stage rail + gate map + run tray | Status swimlanes + story strip |

## Pains
Watch: scroll wall, per-repo policy, Run/contexts competing, polish.  
Jobs: dense table without evidence, hard to see “why”, children buried, skipped/not-watched unclear.

## Out of scope
Production port; Agents/Webhooks deep redesign; real API wiring.
