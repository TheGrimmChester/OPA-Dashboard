import { describe, expect, it } from 'vitest'
import {
  agentKindLabel,
  foldRunStatus,
  groupScmJobsForDisplay,
  inheritOptionLabel,
  jobHasRunMeta,
} from './scmRuns.js'

describe('scmRuns', () => {
  it('builds inherit labels from effective + sources', () => {
    expect(inheritOptionLabel('review_draft_prs', { review_draft_prs: false }, { review_draft_prs: 'installation' }))
      .toBe('Use Installation Default (Off)')
    expect(inheritOptionLabel('auto_approve', { auto_approve: true }, { auto_approve: 'org' }))
      .toBe('Use Org Default (On)')
    expect(inheritOptionLabel('trigger_mode', { trigger_mode: 'every_push' }, {}))
      .toBe('Use Built-in Default (every_push)')
  })

  it('labels agent kinds with product wording', () => {
    expect(agentKindLabel('bugbot')).toBe('Bugbot')
    expect(agentKindLabel('security')).toBe('Security')
    expect(agentKindLabel('')).toBe('')
  })

  it('keeps legacy jobs unchanged and nests run children', () => {
    const legacy = { id: 'legacy-1', status: 'completed', event: 'pull_request' }
    const parent = { id: 'run-1', kind: 'run', run_id: 'run-1', status: 'queued' }
    const child = {
      id: 'run-1-bugbot', kind: 'bugbot', run_id: 'run-1', parent_id: 'run-1', status: 'running',
    }
    const orphan = {
      id: 'orphan-sec', kind: 'security', run_id: 'missing', parent_id: 'missing', status: 'completed',
    }
    const rows = groupScmJobsForDisplay([legacy, parent, child, orphan])
    expect(rows.find((r) => r.id === 'legacy-1')).toMatchObject(legacy)
    expect(rows.find((r) => r.id === 'run-1-bugbot')).toBeUndefined()
    const run = rows.find((r) => r.id === 'run-1')
    expect(run.status).toBe('running')
    expect(run._runChildren.map((c) => c.kind)).toEqual(['bugbot'])
    expect(rows.find((r) => r.id === 'orphan-sec')).toBeTruthy()
  })

  it('folds child statuses', () => {
    expect(foldRunStatus([{ status: 'completed' }, { status: 'failed' }], 'queued')).toBe('completed_with_errors')
    expect(foldRunStatus([], 'queued')).toBe('queued')
  })

  it('detects run meta', () => {
    expect(jobHasRunMeta({ kind: 'run' })).toBe(true)
    expect(jobHasRunMeta({ event: 'pull_request' })).toBe(false)
  })
})
