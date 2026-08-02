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

  it('maps legacy finding tabs to findings+type', () => {
    expect(resolveSecurityNav(new URLSearchParams('tab=secrets'))).toMatchObject({
      tab: 'findings',
      type: 'secrets',
    })
    expect(resolveSecurityNav(new URLSearchParams('tab=vulns'))).toMatchObject({
      tab: 'findings',
      type: 'cve',
    })
  })

  it('maps legacy jobs/watch/webhooks to ops+mode', () => {
    expect(resolveSecurityNav(new URLSearchParams('tab=jobs'))).toMatchObject({
      tab: 'ops',
      mode: 'jobs',
    })
    expect(resolveSecurityNav(new URLSearchParams('tab=watch'))).toMatchObject({
      tab: 'ops',
      mode: 'watch',
    })
  })

  it('maps legacy policies/pr/agents to control+section', () => {
    expect(resolveSecurityNav(new URLSearchParams('tab=pr'))).toMatchObject({
      tab: 'control',
      section: 'gate',
    })
    expect(resolveSecurityNav(new URLSearchParams('tab=agents'))).toMatchObject({
      tab: 'control',
      section: 'agents',
    })
  })

  it('opens scans for bare run=', () => {
    expect(resolveSecurityNav(new URLSearchParams('run=srun-1')).tab).toBe('scans')
    expect(resolveSecurityRunId(new URLSearchParams('run=srun-1'), 'scans')).toBe('srun-1')
    expect(resolveSecurityRunId(new URLSearchParams('run=srun-1&tab=watch'), 'ops')).toBe('')
  })

  it('normalizes legacy jobs URL', () => {
    const { params } = normalizeSecuritySearchParams(new URLSearchParams('tab=jobs&status=running'))
    expect(params.get('tab')).toBe('ops')
    expect(params.get('mode')).toBe('jobs')
    expect(params.get('status')).toBe('running')
  })
})
