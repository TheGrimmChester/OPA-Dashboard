// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import FacetSidebar from './FacetSidebar'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(() => Promise.reject(new Error('should not fetch when deferred'))),
  },
}))

describe('FacetSidebar deferred facets', () => {
  it('shows hub ownership empty state instead of empty field chips', () => {
    const html = renderToStaticMarkup(
      <FacetSidebar value={{ include: {}, exclude: {} }} onChange={() => {}} />,
    )
    expect(html).toContain('Not available on hub yet')
    expect(html).toMatch(/explore\/facets|Trace explore facets/i)
    // Field chip headers should not render while deferred
    expect(html).not.toMatch(/opa-mono[^>]*>service</)
  })
})
