/**
 * This product's compositions over the family design system.
 *
 * Nothing here re-implements the system. Each of these is either the kit's own
 * component with this product's data shape adapted onto it, or a piece of
 * behaviour the kit does not carry yet — the expandable panel, the linked entity
 * chip, the facet rail, the recharts wrapper.
 *
 * When one of these turns out to be useful to a second dashboard, it belongs in
 * the kit rather than being pasted there. Pasting is how the family ended up
 * maintaining the same 1,500-line system five times.
 *
 * `TimeSeriesChart` is deliberately NOT re-exported here. It pulls in the whole
 * charting library, and a barrel export makes that a dependency of every page
 * that imports anything at all from this module — 37 pages inheriting a 405 kB
 * library that 11 of them actually use. Import it from its own path.
 *
 * Everything else — Button, Input, Select, Badge, Card, Table, PageHeader, Tabs,
 * StatTile, EmptyState, Skeleton, Meter, Banner, Toast — comes straight from
 * `@open-family/ui`. Import it from there, not from here.
 */
export { default as Panel } from './Panel'
export { default as KpiTile } from './KpiTile'
export { default as Sparkline } from './Sparkline'
export { default as DeltaIndicator } from './DeltaIndicator'
export { default as InlineBar } from './InlineBar'
export { default as DataTable } from './DataTable'
export { default as EntityHeader } from './EntityHeader'
export { Badge, StatusPill, HealthDot, LanguageBadge } from './Badges'
export { default as EntityChip, EntityChipRow } from './EntityChip'
export { SegmentedControl, Tabs } from './Controls'
export { EmptyState, ErrorState, Skeleton, SkeletonTiles } from './States'
export { default as HubDeferredSurface } from './HubDeferredSurface'
