import { describe, expect, it } from 'vitest'
import {
  buildTracesFilter,
  collectCorrelationTags,
  dslQuote,
  loadRunTracesHref,
  logsHref,
  rumSessionHref,
  serviceHref,
  sessionTracesHref,
  spanAttributeLinks,
  tagLink,
  traceHref,
  traceReplayHref,
  tracesHref,
  truncateId,
  perfRunHref,
  securityRunHref,
  scmJobHref,
  securityJobsHref,
  syntheticsHref,
} from './entityLinks.js'

describe('entityLinks', () => {
  it('quotes DSL values', () => {
    expect(dslQuote('a"b')).toBe('"a\\"b"')
  })

  it('builds traces filter clauses', () => {
    expect(buildTracesFilter('a:"1"', '', null, 'b:"2"')).toBe('a:"1" AND b:"2"')
  })

  it('builds traces list URLs', () => {
    expect(tracesHref({ service: 'shop', filter: 'status:"error"' })).toBe(
      '/traces?service=shop&filter=status%3A%22error%22',
    )
    expect(loadRunTracesHref('run-1')).toBe('/traces?load_run_id=run-1')
    expect(sessionTracesHref('sess-9')).toBe('/traces?session_id=sess-9')
    expect(loadRunTracesHref('')).toBe(null)
  })

  it('builds entity detail URLs', () => {
    expect(traceHref('abc', { span: 's1' })).toBe('/traces/abc?span=s1')
    expect(serviceHref('api')).toBe('/services/api')
    expect(logsHref({ service: 'api', level: 'ERROR' })).toBe('/logs?service=api&level=ERROR')
    expect(rumSessionHref('sid')).toBe('/rum?session=sid&tab=sessions')
    expect(perfRunHref('run-9', { tab: 'results' })).toBe('/perf-lab?run=run-9&tab=results')
    expect(securityRunHref('srun-1')).toBe('/security?run=srun-1&tab=scans')
    expect(scmJobHref('job-1')).toBe('/security/jobs/job-1')
    expect(securityJobsHref()).toBe('/security?tab=jobs')
    expect(securityJobsHref({ status: 'running', q: 'smoke' })).toBe(
      '/security?tab=jobs&status=running&q=smoke',
    )
    expect(syntheticsHref('chk-1')).toBe('/synthetics?check=chk-1')
    expect(traceReplayHref('abc', 'waterfall')).toBe('/traces/abc?replay=waterfall')
    expect(truncateId('abcdefghijklmnop', 8)).toBe('abcdefgh…')
  })

  it('maps high-value tags to links and skips empties', () => {
    expect(tagLink('load_run_id', 'r1')?.to).toBe('/traces?load_run_id=r1')
    expect(tagLink('security_run_id', 'srun-9')?.to).toBe('/security?run=srun-9&tab=scans')
    expect(tagLink('session_id', 's1')?.to).toContain('/rum?session=s1')
    expect(tagLink('check_id', 'c1')?.to).toContain('/synthetics?check=c1')
    expect(tagLink('service', '')).toBe(null)
    expect(tagLink('unknown_tag', 'x')).toBe(null)
  })

  it('collects correlation tags from spans', () => {
    const links = collectCorrelationTags([
      { tags: { load_run_id: 'run-a', session_id: 'sess-b', noise: 'x' } },
      { tags: { load_run_id: 'run-a' } },
    ])
    expect(links.map((l) => l.kind).sort()).toEqual(['load_run', 'session'])
  })

  it('builds span attribute chips', () => {
    const chips = spanAttributeLinks({
      service: 'shop',
      name: 'GET /cart',
      url_path: '/cart',
      status: 'error',
      tags: { load_run_id: 'lr1' },
    })
    expect(chips.some((c) => c.kind === 'service')).toBe(true)
    expect(chips.some((c) => c.kind === 'load_run')).toBe(true)
    expect(chips.some((c) => c.kind === 'status')).toBe(true)
  })
})
