/**
 * chartTheme.js
 *
 * A cohesive, theme-aware styling layer for the recharts visualizations used
 * across the dashboard. Colors are expressed as CSS `var(--token, fallback)`
 * references so they resolve live against whatever theme the app has applied
 * (the app currently ships a dark theme in `src/index.css`; if a light theme is
 * added, the charts adapt automatically). Every reference carries a sensible
 * hard-coded fallback so charts still render if a token is missing.
 *
 * This module is purely additive: importing it has no side effects and it does
 * not change any behavior on its own.
 */

/**
 * Build a CSS custom-property reference with a fallback value.
 * Works anywhere a color string is accepted (SVG stroke/fill, inline styles).
 * @param {string} name  CSS variable name, including the leading `--`.
 * @param {string} fallback  Value used when the variable is undefined.
 * @returns {string} e.g. "var(--color-primary-blue, #3b82f6)"
 */
export function cssVar(name, fallback) {
  return `var(${name}, ${fallback})`
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
 * Categorical color palette (8 colors) mapped onto the app's design tokens.
 * Ordered for maximum adjacent contrast when used as a rotating series palette.
 */
export const chartPalette = [
  cssVar('--color-primary-blue', '#3b82f6'),
  cssVar('--color-primary-green', '#10b981'),
  cssVar('--color-primary-orange', '#f59e0b'),
  cssVar('--color-primary-purple', '#8b5cf6'),
  cssVar('--color-primary-red', '#ef4444'),
  cssVar('--color-info-light', '#60a5fa'),
  '#14b8a6', // teal — no matching token, dual-mode friendly
  '#ec4899', // pink — no matching token, dual-mode friendly
]

/**
 * Semantic colors for recurring metric types, so the same concept keeps the
 * same color across every chart in the dashboard.
 */
export const semanticColors = {
  p50: cssVar('--color-primary-blue', '#3b82f6'),
  p95: cssVar('--color-primary-purple', '#8b5cf6'),
  p99: cssVar('--color-primary-orange', '#f59e0b'),
  throughput: cssVar('--color-primary-green', '#10b981'),
  latency: cssVar('--color-primary-orange', '#f59e0b'),
  error: cssVar('--color-error', '#ef4444'),
  success: cssVar('--color-success', '#10b981'),
  bytesSent: cssVar('--color-primary-blue', '#3b82f6'),
  bytesReceived: cssVar('--color-primary-green', '#10b981'),
  requests: cssVar('--color-primary-purple', '#8b5cf6'),
}

/**
 * Pick a categorical color for series index `i`, wrapping around the palette.
 * @param {number} i  Zero-based series index.
 * @returns {string}
 */
export function seriesColor(i) {
  const len = chartPalette.length
  const idx = ((Math.round(i) % len) + len) % len
  return chartPalette[idx]
}

// Shared token references reused by the props objects below.
const gridColor = cssVar('--border-light', '#334155')
const axisTickColor = cssVar('--text-tertiary', '#94a3b8')
const axisLabelColor = cssVar('--text-secondary', '#cbd5e1')

/**
 * Subtle CartesianGrid props. Horizontal-only lines by default keep the plot
 * clean; spread and override per-chart if vertical guides are wanted.
 */
export const gridProps = {
  stroke: gridColor,
  strokeDasharray: '3 3',
  strokeOpacity: 0.5,
  vertical: false,
}

/**
 * Shared axis styling (tick color/size, muted axis line).
 * Spread onto both XAxis and YAxis, then add axis-specific props (dataKey,
 * tickFormatter, label, etc.).
 */
export const axisProps = {
  tick: { fill: axisTickColor, fontSize: 12 },
  tickLine: { stroke: gridColor },
  axisLine: { stroke: gridColor },
  stroke: gridColor,
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
    background: cssVar('--bg-elevated', '#1e293b'),
    border: `1px solid ${cssVar('--border-medium', '#475569')}`,
    borderRadius: cssVar('--radius-md', '8px'),
    boxShadow: cssVar(
      '--shadow-lg',
      '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.4)'
    ),
    color: cssVar('--text-primary', '#f1f5f9'),
    fontSize: 12,
  },
  labelStyle: {
    color: cssVar('--text-secondary', '#cbd5e1'),
    fontWeight: 600,
    marginBottom: 4,
  },
  itemStyle: {
    color: cssVar('--text-primary', '#f1f5f9'),
  },
  cursor: { stroke: gridColor, strokeOpacity: 0.6 },
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
