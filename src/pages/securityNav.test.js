import { describe, expect, it } from 'vitest'
import {
  normalizeSecuritySearchParams,
  resolveSecurityNav,
  resolveSecurityRunId,
} from './securityNav.js'

describe('securityNav', () => {
  it('defaults to findings', () => {
    expect(resolveSecurityNav(new URLSearchParams()).tab).toBe('findings')
  })

  it('resolves canonical pillars and params', () => {
    expect(resolveSecurityNav(new URLSearchParams('tab=findings&type=secrets'))).toMatchObject({
      tab: 'findings',
      type: 'secrets',
    })
    expect(resolveSecurityNav(new URLSearchParams('tab=ops&mode=jobs'))).toMatchObject({
      tab: 'ops',
      mode: 'jobs',
    })
    expect(resolveSecurityNav(new URLSearchParams('tab=control&section=gate'))).toMatchObject({
      tab: 'control',
      section: 'gate',
    })
  })

  it('ignores unknown tabs (defaults to findings)', () => {
    expect(resolveSecurityNav(new URLSearchParams('tab=secrets'))).toMatchObject({
      tab: 'findings',
      type: 'all',
    })
    expect(resolveSecurityNav(new URLSearchParams('tab=jobs'))).toMatchObject({
      tab: 'findings',
    })
    expect(resolveSecurityNav(new URLSearchParams('tab=pr'))).toMatchObject({
      tab: 'findings',
    })
  })

  it('opens scans for bare run=', () => {
    expect(resolveSecurityNav(new URLSearchParams('run=srun-1')).tab).toBe('scans')
    expect(resolveSecurityRunId(new URLSearchParams('run=srun-1'), 'scans')).toBe('srun-1')
    expect(resolveSecurityRunId(new URLSearchParams('run=srun-1&tab=ops'), 'ops')).toBe('')
  })

  it('normalizes ops/jobs URL', () => {
    const { params } = normalizeSecuritySearchParams(
      new URLSearchParams('tab=ops&mode=jobs&status=running'),
    )
    expect(params.get('tab')).toBe('ops')
    expect(params.get('mode')).toBe('jobs')
    expect(params.get('status')).toBe('running')
  })
})
