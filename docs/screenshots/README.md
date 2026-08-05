# Migration evidence

Every migrated section, in both themes, captured against the branch at the commit
that added this directory.

Captured over the DevTools protocol with `prefers-color-scheme` emulated rather
than by seeding `localStorage`, so these exercise the real theme-resolution path:
the stored preference defaults to `system`, which removes `data-theme` and lets the
media query decide.

- `*-light-desktop.png` / `*-dark-desktop.png` — 1600×1000
- `*-light-narrow.png` / `*-dark-narrow.png` — 820×1100, where the rail collapses
  to a drawer and the grids drop to fewer columns

No API backend was running, so panels that depend on one show their **error**
state and the rest show their **empty** state. That is deliberate: those two
states plus loading are what this migration was largely about, and they are the
states a screenshot of a populated dashboard would never show.

## Per-route time range

`timerange-*` was captured later, for the change that made the range switch
conditional on the route (see `docs/architecture.md`). Same method, same 1600×1000
viewport:

- `timerange-traces-light-desktop.png` / `timerange-traces-dark-desktop.png` —
  Traces still carries the switch; the trace list is windowed on `from`/`to`.
- `timerange-account-light-desktop.png` / `timerange-account-dark-desktop.png` —
  Account no longer carries it, because nothing on that page reads the range.
  Refresh is still there in both, which is the point: it is a separate concern.

In all four, `document.documentElement` has **no** `data-theme` attribute — the
theme came from the emulated media query, not from a stamped attribute.
