/**
 * chartTheme.js
 *
 * The theme-aware styling layer for the recharts visualizations. Colors are CSS
 * custom-property references, so a theme switch repaints every chart with no
 * JavaScript involved.
 *
 * The tokens come from the family design system and are always defined, so these
 * references carry no fallbacks. The fallbacks they used to carry were a hazard
 * rather than a safety net: the axis colour fell back to a dark-theme grey, so
 * axis labels were unreadable in light mode whenever the token behind it was
 * missing.
 *
 * This module is purely additive: importing it has no side effects.
 */

/**
 * Build a CSS custom-property reference.
 * Works anywhere a color string is accepted (SVG stroke/fill, inline styles).
 * @param {string} name  CSS variable name, including the leading `--`.
 * @returns {string} e.g. "var(--chart-1)"
 */
export function cssVar(name) {
  return `var(${name})`
}

/**
 * Resolve a CSS custom property to a concrete value at call time.
 * Falls back gracefully when running without a DOM (SSR/tests) or when the
 * variable is not defined. Prefer `cssVar()` for chart colors so they stay
 * theme-reactive; use this only when a literal value is required.
 * @param {string} name  CSS variable name, including the leading `--`.
 * @param {string} fallback  Value returned when unresolved.
 * @returns {string}
 */
export function readCssVar(name, fallback) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallback
  }
  try {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim()
    return value || fallback
  } catch {
    return fallback
  }
}

/**
 * The categorical order. Identical in every product in the family, so charts
 * read alike across products and only the chrome carries the product identity.
 *
 * Fixed — assign in order, never cycle. Colour follows the entity, not its rank,
 * so a filter that changes the series count must not repaint the survivors.
 *
 * Three light-mode slots (aqua, yellow, magenta) sit below 3:1 on the light
 * surface by design. Wherever they appear, the chart ships visible direct labels
 * or a table view; the palette is validated on that condition.
 */
export const chartPalette = [
  cssVar('--chart-1'),
  cssVar('--chart-2'),
  cssVar('--chart-3'),
  cssVar('--chart-4'),
  cssVar('--chart-5'),
  cssVar('--chart-6'),
  cssVar('--chart-7'),
  cssVar('--chart-8'),
]

/** Everything past the eighth series folds into one recessive "Other" hue. */
export const OTHER_SERIES_COLOR = cssVar('--text-muted')

/**
 * Semantic colours for recurring metric types, so the same concept keeps the
 * same colour across every chart.
 *
 * Latency percentiles are series identities and take categorical slots. Error
 * and success are genuine states, so they take the reserved status *mark* steps
 * — the steps tuned for chart marks — and never a categorical slot.
 */
export const semanticColors = {
  p50: cssVar('--chart-1'),
  p95: cssVar('--chart-2'),
  p99: cssVar('--chart-3'),
  throughput: cssVar('--chart-1'),
  latency: cssVar('--chart-2'),
  error: cssVar('--st-critical'),
  success: cssVar('--st-good'),
  bytesSent: cssVar('--chart-1'),
  bytesReceived: cssVar('--chart-2'),
  requests: cssVar('--chart-3'),
}

/**
 * Colour for categorical series index `i`, assigned in order.
 *
 * Past the eighth series this returns the "Other" hue rather than cycling: a
 * ninth series that reuses the first hue makes two different entities look like
 * the same one. Fold the tail into "Other", facet, or use small multiples.
 * @param {number} i  Zero-based series index.
 * @returns {string}
 */
export function seriesColor(i) {
  const idx = Math.max(0, Math.round(i))
  return idx < chartPalette.length ? chartPalette[idx] : OTHER_SERIES_COLOR
}

// Shared token references reused by the props objects below. Axis and value text
// wears text tokens, never a series colour — a categorical hue is illegible as
// text on a light surface.
const gridColor = cssVar('--chart-grid')
const axisColor = cssVar('--chart-axis')
const axisTickColor = cssVar('--text-muted')
const axisLabelColor = cssVar('--text-secondary')

/**
 * Subtle CartesianGrid props. Horizontal-only lines by default keep the plot
 * clean; spread and override per-chart if vertical guides are wanted.
 */
export const gridProps = {
  stroke: gridColor,
  // Solid, one step off the surface. A dashed gridline competes with the data
  // for attention and reads as a series in its own right.
  strokeOpacity: 1,
  vertical: false,
}

/**
 * Shared axis styling (tick color/size, muted axis line).
 * Spread onto both XAxis and YAxis, then add axis-specific props (dataKey,
 * tickFormatter, label, etc.).
 */
export const axisProps = {
  tick: { fill: axisTickColor, fontSize: 12 },
  tickLine: { stroke: axisColor },
  axisLine: { stroke: axisColor },
  stroke: axisColor,
}

/**
 * Build an axis `label` config object with consistent styling.
 * @param {string} value  Label text.
 * @param {'left'|'bottom'} [axis]  Which axis the label is for.
 * @returns {object} recharts label prop
 */
export function axisLabel(value, axis = 'left') {
  if (axis === 'bottom') {
    return {
      value,
      position: 'insideBottom',
      offset: -4,
      style: { fill: axisLabelColor, fontSize: 12 },
    }
  }
  return {
    value,
    angle: -90,
    position: 'insideLeft',
    style: { fill: axisLabelColor, fontSize: 12, textAnchor: 'middle' },
  }
}

/**
 * Tooltip props with a theme-aware content surface.
 */
export const tooltipProps = {
  contentStyle: {
    background: cssVar('--surface-1'),
    border: `1px solid ${cssVar('--border-default')}`,
    borderRadius: cssVar('--radius-md'),
    boxShadow: cssVar('--shadow-pop'),
    color: cssVar('--text-primary'),
    fontSize: 13,
  },
  labelStyle: {
    color: cssVar('--text-secondary'),
    fontWeight: 600,
    marginBottom: 4,
  },
  itemStyle: {
    color: cssVar('--text-primary'),
  },
  cursor: { stroke: axisColor },
}

/**
 * Legend props with tokenized text color.
 */
export const legendProps = {
  wrapperStyle: {
    fontSize: 12,
    color: axisLabelColor,
    paddingTop: 8,
  },
  iconType: 'circle',
  iconSize: 9,
}

/**
 * Flag for the reworked "v2" dashboard visualizations (e.g. windowed
 * row rendering for large execution stack trees). On by default; a
 * deployer can opt back out with `VITE_VIZ_V2=false` (or `0`).
 */
export const VIZ_V2_ENABLED =
  import.meta.env.VITE_VIZ_V2 !== 'false' && import.meta.env.VITE_VIZ_V2 !== '0'

/**
 * Reusable linear gradient <defs> id/color pair helper for Area fills.
 * Returns a stable id so the same gradient can be referenced by `fill`.
 * @param {string} key  Unique key for the gradient (e.g. a dataKey).
 * @returns {string} DOM id for the gradient definition.
 */
export function gradientId(key) {
  return `viz-grad-${String(key).replace(/[^a-zA-Z0-9_-]/g, '')}`
}
