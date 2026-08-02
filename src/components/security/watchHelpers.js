/**
 * Parse watched-repo checks_json (GET string) into a string[].
 */
export function parseChecksJson(raw) {
  if (Array.isArray(raw)) return raw.map(String)
  try {
    const v = JSON.parse(raw || '[]')
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

export const WATCH_CHECK_OPTS = [
  { id: 'secrets', label: 'Secrets', hint: 'Scan the PR diff for leaked credentials and API keys before merge.' },
  { id: 'sast', label: 'SAST', hint: 'Static analysis for common insecure patterns in changed files.' },
  { id: 'iac', label: 'IaC', hint: 'Check Terraform / K8s / CloudFormation diffs for misconfigurations.' },
  { id: 'sbom', label: 'SBOM', hint: 'Generate or update dependency inventory for this PR’s lockfiles.' },
  { id: 'ai_review', label: 'OPA Review (AI)', hint: 'Enqueue the Bugbot AI review child when this repo is watched.' },
]

export function checksFromPolicyMap(checksMap) {
  const list = Object.entries(checksMap || {}).filter(([, on]) => on).map(([id]) => id)
  return list.length ? list : ['secrets', 'sast', 'iac', 'sbom', 'ai_review']
}
