/**
 * Surfaces from OPA-Hub docs/ownership.md — "Unimplemented dashboard scaffolds".
 * These call hub URLs today but no backend exists on hub or edge (both 404).
 * Do not invent fake hub routes; flip readiness only after the agent (or hub)
 * handler and ClickHouse tables land.
 */
export const HUB_DEFERRED_SURFACES = {
  network: {
    title: 'Network observability',
    routes: 'GET /api/network/{summary,flows,dependencies,dns,tls,discovered,host-profiles}',
  },
  cloud: {
    title: 'Cloud inventory / cost',
    routes: 'GET /api/cloud/{summary,resources,cost,tags,scrapes}',
  },
  catalog: {
    title: 'Service catalog',
    routes: 'GET /api/catalog, /scorecards, /teams, /groups, /entities/{id}',
  },
  automation: {
    title: 'Declarative mgmt (GitOps)',
    routes: 'GET /api/mgmt/v1, /revisions, /export, /openapi.json',
  },
  callgraphCompare: {
    title: 'Call-graph window compare',
    routes: 'GET /api/callgraph/compare',
  },
  exploreFacets: {
    title: 'Trace explore facets',
    routes: 'GET /api/explore/facets',
  },
}

export function isHubDeferred(id) {
  return Object.prototype.hasOwnProperty.call(HUB_DEFERRED_SURFACES, id)
}

export function hubDeferredCopy(id) {
  const meta = HUB_DEFERRED_SURFACES[id]
  if (!meta) return null
  return {
    title: 'Not available on hub yet',
    hint:
      `${meta.title} is deferred — UI scaffold only. No hub or edge backend exists for ${meta.routes}. `
      + 'Implement the agent (or hub) handler and ClickHouse tables first; do not add fake hub routes.',
  }
}
