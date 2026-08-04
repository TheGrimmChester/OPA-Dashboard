import { describe, expect, it } from 'vitest'
import { HUB_DEFERRED_SURFACES, hubDeferredCopy, isHubDeferred } from './hubDeferred'

describe('hubDeferred', () => {
  it('marks ownership.md scaffold surfaces as deferred', () => {
    for (const id of ['network', 'cloud', 'catalog', 'automation', 'callgraphCompare']) {
      expect(isHubDeferred(id)).toBe(true)
      expect(HUB_DEFERRED_SURFACES[id].routes).toMatch(/\/api\//)
      const copy = hubDeferredCopy(id)
      expect(copy.title).toBe('Not available on hub yet')
      expect(copy.hint).toMatch(/deferred/i)
      expect(copy.hint).toMatch(/do not add fake hub routes/i)
    }
    expect(isHubDeferred('exploreFacets')).toBe(false)
  })

  it('ignores unknown surfaces', () => {
    expect(isHubDeferred('alerts')).toBe(false)
    expect(hubDeferredCopy('alerts')).toBeNull()
  })
})
