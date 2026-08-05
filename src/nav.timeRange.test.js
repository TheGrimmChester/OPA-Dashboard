import { describe, it, expect } from 'vitest'
import { navItems, routeHasTimeRange } from './nav'

/**
 * The header time range is a per-route capability.
 *
 * These assertions are the contract behind `timeRange` in nav.js. They are split
 * from the render test on purpose: this file proves the *classification*, and
 * Shell.timeRange.test.jsx proves the top bar obeys it. A route that stops
 * sending `from`/`to` has to lose its flag here, and one that starts sending them
 * has to gain it, or the control goes back to lying about what it does.
 */

/** Routes whose requests carry from/to to a handler that windows on them. */
const WINDOWED = [
  '/overview',
  '/services',
  '/commands',
  '/traces',
  '/profiling',
  '/errors',
  '/logs',
  '/anomalies',
  '/synthetics',
  '/databases',
  '/http',
  '/service-map',
  '/rum',
  '/performance',
  '/compare',
  '/metrics',
  '/system',
]

/** Routes where every request opts out with `noRange`, so the range is inert. */
const NOT_WINDOWED = [
  '/catalog',
  '/key-transactions',
  '/alerts',
  '/slos',
  '/diagnostics',
  '/network',
  '/hosts',
  '/cloud',
  '/serverless',
  '/query',
  '/dashboards',
  '/live',
  '/collaborate',
  '/automation',
  '/users',
  '/api-keys',
  '/settings/account',
]

describe('time range capability per route', () => {
  it.each(WINDOWED)('shows the range on %s', (route) => {
    expect(routeHasTimeRange(route)).toBe(true)
  })

  it.each(NOT_WINDOWED)('hides the range on %s', (route) => {
    expect(routeHasTimeRange(route)).toBe(false)
  })

  it('covers every rail destination, so no route is left unclassified', () => {
    const declared = new Set([...WINDOWED, ...NOT_WINDOWED])
    const missing = navItems().map((item) => item.to).filter((to) => !declared.has(to))
    expect(missing).toEqual([])
  })

  it('keeps the settings route clear of a control it cannot drive', () => {
    expect(routeHasTimeRange('/settings/account')).toBe(false)
  })
})

describe('detail routes', () => {
  it('inherits the parent capability where the panels are windowed too', () => {
    expect(routeHasTimeRange('/services/checkout-api')).toBe(true)
    expect(routeHasTimeRange('/databases/a1b2c3')).toBe(true)
    expect(routeHasTimeRange('/http/GET%20%2Fv1%2Forders')).toBe(true)
  })

  it('drops the control on a single absolute record', () => {
    // TraceDetail and ErrorDetail fetch with `noRange`: one trace and one error
    // are absolute, so a window above them would filter nothing.
    expect(routeHasTimeRange('/traces/abc123')).toBe(false)
    expect(routeHasTimeRange('/errors/def456')).toBe(false)
  })

  it('does not let a flagless parent leak a control to its children', () => {
    expect(routeHasTimeRange('/dashboards/7')).toBe(false)
  })

  it('answers false for an unknown route rather than guessing', () => {
    expect(routeHasTimeRange('/not-a-route')).toBe(false)
    expect(routeHasTimeRange('')).toBe(false)
    expect(routeHasTimeRange(undefined)).toBe(false)
  })

  it('ignores a trailing slash', () => {
    expect(routeHasTimeRange('/traces/')).toBe(true)
    expect(routeHasTimeRange('/settings/account/')).toBe(false)
  })
})
