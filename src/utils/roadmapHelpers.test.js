import { describe, expect, it } from 'vitest'
import {
  buildRoadmapGenerateBody,
  mapWatchedRepoNames,
} from '../utils/roadmapHelpers.js'

describe('roadmapHelpers', () => {
  it('maps watched repo names from connector watched payload', () => {
    expect(mapWatchedRepoNames({
      watched: [
        { repo_full_name: 'acme/app' },
        { repo: 'acme/other' },
        'acme/plain',
      ],
    })).toEqual(['acme/app', 'acme/other', 'acme/plain'])
    expect(mapWatchedRepoNames({})).toEqual([])
    expect(mapWatchedRepoNames(null)).toEqual([])
  })

  it('builds generate POST body with contexts and competitor list', () => {
    expect(buildRoadmapGenerateBody({
      repo: 'acme/app',
      connectorId: 'conn-1',
      contexts: ['discovery', 'features'],
      competitorsText: 'Aperant, Cursor\nBugbot',
      audience: 'founders',
      publish: true,
    })).toEqual({
      repo_full_name: 'acme/app',
      connector_id: 'conn-1',
      contexts: ['discovery', 'features'],
      competitors: ['Aperant', 'Cursor', 'Bugbot'],
      audience_notes: 'founders',
      publish: true,
    })
  })
})
