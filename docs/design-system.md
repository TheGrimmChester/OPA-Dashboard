# Design system

This dashboard renders the shared family design system. It does not carry one of
its own.

Everything visual — the tokens, the shell, the components — comes from
`@open-family/ui`, a `file:` dependency on the `Open-UI-JS` repository. Before
this, the dashboard held its own 1,530-line copy of a system that four sibling
products also held, in one case byte-identically.

## Working on it

```bash
cd ../Open-UI-JS && npm install && npm run build   # the kit's entry point is dist/, uncommitted
cd ../OPA-Dashboard && npm install
npm run dev
```

If a component's styling looks wrong after pulling, rebuild the kit — a stale
`dist/` is the usual cause.

`vite.config.js` sets `resolve.dedupe: ['react', 'react-dom']`. This is not
optional: `file:` dependencies are symlinked, Vite resolves through the symlink,
and without deduping `import 'react'` inside the kit finds the kit's own copy.
Two Reacts means every hook throws "invalid hook call".

## Where things live

| | |
|---|---|
| Tokens, shell, components | `@open-family/ui` — see that repo's `docs/` |
| This product's accent | `applyProduct('opa')` in `src/main.jsx`, nothing else |
| The navigation | `src/nav.js` — the single source for the rail, the command menu and the document title |
| This product's own CSS | `src/product.css`, plus a stylesheet next to each component |

There is no `src/theme/` stylesheet and no `:root` token block. If you find
yourself adding either, the thing you want probably belongs in the kit.

## Rules that are enforced, not just documented

`src/theme/designSystem.contract.test.js` fails the build on each of these,
because every one of them was true of this codebase before the migration:

- **Every referenced custom property is defined.** Thirteen were not, so those
  declarations silently dropped and the element inherited whatever its parent had.
- **One spacing scale and one type scale.** Two were live at once — a px `--sp-*`
  set and a rem `--spacing-*` set — plus ~40 alias variables. The names lied:
  `--sp-5` was 24px and `--sp-6` was 32px.
- **No hard-coded family accent.** `#7C6CFF` appeared in four of the five
  dashboards, which is why three of them were visually indistinguishable.
- **One glyph per destination.** Nine glyphs did double duty across the rail, and
  the collapsed rail is icon-only, so two destinations looked identical.
- **One `<h1>` per page, from `PageHeader`.** Thirty-two hand-copied header blocks
  existed; five pages had no heading at all.
- **No hand-written `<table>`.** There were six, at four different row heights.
- **Every table passes an explicit state, with both an empty and an error state.**

## The state rule

`src/components/ui/tableState.js` owns the precedence, and
`tableState.test.js` asserts every branch:

```
loading  →  a request is in flight. Report no result of any kind.
error    →  it finished and failed. An empty table would be a lie.
empty    →  it finished, succeeded, and found nothing.
ready    →  there are rows.
```

The table this replaced checked `rows.length === 0` first and rendered the words
"No rows", so an in-flight fetch and a genuinely empty result were the same
picture — two situations calling for completely different reactions.

Pass the `useApi()` result straight through:

```jsx
const services = useApi('/api/services')

<DataTable loading={services.loading} error={services.error} onRetry={services.reload} … />
```

## Local compositions

`src/components/ui/` holds this product's compositions over the kit — not copies
of it. Each is either the kit's component with this product's data shape adapted
onto it, or behaviour the kit does not carry yet: the expand-to-viewport panel,
the linked entity chip, the facet rail, the recharts wrapper.

When one of these turns out to be useful to a second dashboard, it belongs in the
kit rather than being pasted there.

`TimeSeriesChart` is deliberately **not** re-exported from
`src/components/ui/index.js`. Import it from its own path so the charting library
it pulls in stays a visible dependency of the pages that actually use it.

## Deviations and known gaps

Recorded here so they are decisions rather than drift.

- **`Panel`, `KpiTile` and `DataTable` still exist** as compositions over `Card`,
  `StatTile` and `Table`, rather than every call site having been rewritten. They
  adapt this product's props and add what the kit leaves to the caller — the
  client-side sorting, the fetch-state mapping, the panel expansion. Rewriting the
  ~380 call sites is follow-up work; the visual result and the state behaviour are
  already the kit's.
- **`KpiTile`'s threshold tint is gone.** The old tile coloured its value by
  `latencyStatus`. In this system a status hue always ships with a word beside it,
  so that classification is no longer surfaced on the tile. Where it mattered it
  should come back as a `Badge`.
- **The kit's `Input` does not forward a ref**, so `SavedViews` focuses its field
  by querying the popover instead. Worth raising upstream.
- **`--st-serious` and `--st-warn` are ~13.6 ΔE apart under normal vision**, below
  the system's own 15 floor, so they cannot be told apart as plain adjacent fills.
  This product uses neither as a fill and a test keeps it that way. The fix belongs
  upstream; do not patch the tokens here.
- **The shared top bar overlaps its own controls below 900px.** `src/product.css`
  carries a measured stopgap with the cause written down. Remove it once the kit
  ships a fix.
- **Platform status has an Audit tab where the agreed IA says "Jobs".** There is no
  jobs endpoint in this product; the fourth view is the audit trail, so it is named
  for what it shows.

## Evidence

`docs/screenshots/` — every migrated section, both themes, desktop and narrow.
