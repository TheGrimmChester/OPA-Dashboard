// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

// TenantContext reads localStorage at import time, and this runner starts jsdom
// without a usable Storage. Installed in a hoisted block so it exists before the
// module graph is evaluated, not merely before the first test.
vi.hoisted(() => {
  const store = new Map()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
      setItem: (key, value) => { store.set(String(key), String(value)) },
      removeItem: (key) => { store.delete(String(key)) },
      clear: () => store.clear(),
      key: (i) => [...store.keys()][i] ?? null,
      get length() { return store.size },
    },
  })
})

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import Shell from './Shell'
import { TenantProvider } from '../../contexts/TenantContext'
import { TimeRangeProvider } from '../../contexts/TimeRangeContext'
import { I18nProvider } from '../../contexts/I18nContext'

/**
 * The top bar must obey the per-route `timeRange` flag.
 *
 * nav.timeRange.test.js proves the classification; this proves the chrome acts on
 * it. Asserting on the rendered markup rather than on the resolver is the point:
 * a conditional that resolves correctly and still renders the control would pass
 * the data test and fail the operator.
 *
 * `TimeRangeProvider` stays mounted on every route — `hooks/useApi.js` reads its
 * refresh tick, so unmounting it to hide a control would stop polling. These
 * assertions are about presentation only.
 */

function renderAt(pathname) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[pathname]}>
      <TenantProvider>
        <TimeRangeProvider>
          <I18nProvider>
            <Shell><div /></Shell>
          </I18nProvider>
        </TimeRangeProvider>
      </TenantProvider>
    </MemoryRouter>,
  )
}

const RANGE_CONTROL = 'aria-label="Time range"'

describe('the range switch renders only where the range filters data', () => {
  it.each([
    ['/traces', 'the trace list is windowed'],
    ['/metrics', 'query-range is windowed'],
    ['/overview', 'services and performance are windowed'],
    ['/logs', 'the log search is windowed'],
    ['/rum', 'the vitals endpoints are windowed'],
    ['/compare', 'the cohort windows derive from from/to'],
    ['/services/checkout-api', 'a service detail inherits its index'],
  ])('renders it on %s (%s)', (pathname) => {
    expect(renderAt(pathname)).toContain(RANGE_CONTROL)
  })

  it.each([
    ['/settings/account', 'settings'],
    ['/slos', 'objective definitions, windowed by their own window_hours'],
    ['/alerts', 'alert rules'],
    ['/catalog', 'the service catalogue'],
    ['/dashboards', 'widgets carry their own query window'],
    ['/traces/abc123', 'one absolute trace'],
  ])('omits it on %s (%s)', (pathname) => {
    expect(renderAt(pathname)).not.toContain(RANGE_CONTROL)
  })
})

describe('refresh is not part of the deal', () => {
  it.each([
    '/settings/account',
    '/catalog',
    '/traces',
    '/metrics',
  ])('keeps the refresh button on %s', (pathname) => {
    // Refresh is a separate concern: every page can be re-fetched, and peer
    // products depend on the provider purely for its tick.
    expect(renderAt(pathname)).toContain('aria-label="Refresh"')
  })
})
