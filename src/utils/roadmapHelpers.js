/** Pure helpers for Roadmap page (kept free of React for unit tests). */

export function mapWatchedRepoNames(payload) {
  const rows = payload?.watched || payload?.repos || []
  if (!Array.isArray(rows)) return []
  return rows.map((w) => w.repo_full_name || w.repo || w).filter(Boolean)
}

export function buildRoadmapGenerateBody({ repo, connectorId, contexts, competitorsText, audience, publish }) {
  return {
    repo_full_name: repo,
    connector_id: connectorId || undefined,
    contexts,
    competitors: String(competitorsText || '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
    audience_notes: audience || '',
    publish: !!publish,
  }
}
