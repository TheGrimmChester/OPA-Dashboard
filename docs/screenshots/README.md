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
