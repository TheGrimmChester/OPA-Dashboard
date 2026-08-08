// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import FacetSidebar from './FacetSidebar'

const get = vi.fn()

vi.mock('axios', () => ({
  default: {
    get: (...args) => get(...args),
  },
}))

vi.mock('../../contexts/TenantContext', () => ({
  useTenant: () => ({ scopeKey: 'org|all' }),
}))

describe('FacetSidebar', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it('does not show ownership-deferred copy on the happy path shell', () => {
    // SSR renders before useEffect fetch; should show field headers, not deferred messaging
    const html = renderToStaticMarkup(
      <FacetSidebar value={{ include: {}, exclude: {} }} onChange={() => {}} fields={['service', 'status']} />,
    )
    expect(html).not.toContain('Not available on hub yet')
    expect(html).not.toMatch(/deferred/i)
    expect(html).toContain('Facets')
    expect(html).toContain('service')
    expect(html).toContain('status')
  })
})
