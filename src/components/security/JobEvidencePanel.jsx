import React from 'react'
import { Link } from 'react-router-dom'
import { Badge, StatusPill } from '../ui'
import { scmJobHref } from '../../utils/entityLinks'
import { agentKindLabel } from '../../utils/scmRuns'

function toneForStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'completed': return 'ok'
    case 'running': return 'warn'
    case 'queued': return 'info'
    case 'waiting': return 'neutral'
    case 'cancelled': return 'neutral'
    case 'failed':
    case 'error': return 'error'
    default: return 'neutral'
  }
}

function sevTone(sev) {
  const v = String(sev || '').toLowerCase()
  if (v === 'blocker' || v === 'critical') return 'error'
  if (v === 'high') return 'alert'
  if (v === 'medium') return 'warn'
  if (v === 'low') return 'neutral'
  return 'neutral'
}

function findingsFromJob(job) {
  if (!job) return []
  if (Array.isArray(job.findings) && job.findings.length) return job.findings
  const summary = job.summary && typeof job.summary === 'object' ? job.summary : {}
  const ai = summary.ai && typeof summary.ai === 'object' ? summary.ai : {}
  if (Array.isArray(ai.findings)) return ai.findings
  if (Array.isArray(summary.ledger)) return summary.ledger
  return []
}

function frozenPrefs(job) {
  const summary = job?.summary && typeof job.summary === 'object' ? job.summary : {}
  return summary.prefs && typeof summary.prefs === 'object' ? summary.prefs : null
}

function cloudAutofixReady(prefs) {
  if (!prefs) return { ok: false, reason: 'No frozen prefs on this job — open the job or enable Cloud under Agents.' }
  if (!prefs.cloud_enabled) return { ok: false, reason: 'Disabled — enable Cloud on this repo in Agents first.' }
  const mode = String(prefs.autofix_mode || '').toLowerCase()
  if (!mode || mode === 'off') return { ok: false, reason: 'Autofix mode is off — set suggest or branch under Agents · Cloud.' }
  return {
    ok: true,
    reason: `Mode: ${mode} · threshold ${prefs.autofix_severity_threshold || 'high'}`,
  }
}

function ActionRow({ title, hint, effect, disabled, children }) {
  return (
    <div className={`opa-jobs-action-row${disabled ? ' disabled' : ''}`}>
      <div className="opa-jobs-action-copy">
        <span className="cell-strong">{title}</span>
        {hint ? <span className="opa-muted">{hint}</span> : null}
        {effect ? (
          <span className="opa-agents-pref-effect" role="status">
            <em>Now:</em> {effect}
          </span>
        ) : null}
      </div>
      <div className="opa-jobs-action-ctrl">{children}</div>
    </div>
  )
}

/**
 * Compact evidence preview for a selected SCM / PR job list row.
 * Uses list-summary fields (+ optional GET detail); deep ledger lives on the full job page.
 */
export default function JobEvidencePanel({
  job,
  honesty,
  detailLoading,
  actionBusy,
  onCancel,
  onRetry,
  onRerunBugbot,
  onRerunFull,
  onCloudAutofix,
}) {
  if (!job) {
    return (
      <div className="opa-jobs-evidence-empty">
        <strong>Select a job</strong>
        <span className="opa-muted">Evidence opens here — children, findings, and why it ran.</span>
      </div>
    )
  }

  const summary = job.summary && typeof job.summary === 'object' ? job.summary : {}
  const ai = summary.ai && typeof summary.ai === 'object' ? summary.ai : {}
  const gate = summary.gate && typeof summary.gate === 'object' ? summary.gate : {}
  const findings = findingsFromJob(job)
  const kids = Array.isArray(job._runChildren) && job._runChildren.length
    ? job._runChildren
    : Array.isArray(job.children) && job.children.length
      ? job.children
      : Object.entries(job._childStatus || job.child_status || summary.child_status || {}).map(([kind, status]) => ({ kind, status }))
  const prefs = frozenPrefs(job)
  const sha = summary.analyzed_sha || job.analyzed_sha || job.commit_sha || summary.worktree?.resolved_sha || ''
  const degraded = summary.degraded
  const risk = job.risk_score ?? summary.risk_score
  const riskFactors = job.risk_factors || summary.risk_factors || []
  const active = ['queued', 'waiting', 'running'].includes(String(job.status || '').toLowerCase())
  const cloud = cloudAutofixReady(prefs)
  const canAgent = !!job.pr_number && !active
  const busy = !!actionBusy

  return (
    <div className="opa-jobs-evidence">
      <div className="opa-jobs-evidence-head">
        <div className="opa-jobs-evidence-title">
          <span className="cell-strong">{job.repo_full_name || '—'}</span>
          {job.pr_number ? <Badge>#{job.pr_number}</Badge> : null}
          <StatusPill tone={toneForStatus(job.status)}>{job.status || '—'}</StatusPill>
          {detailLoading ? <span className="opa-muted" style={{ fontSize: 11 }}>Loading detail…</span> : null}
        </div>
        <div className="opa-jobs-evidence-meta opa-muted">
          <span className="opa-mono">{String(job.id || '').slice(0, 18)}</span>
          {sha ? <span className="opa-mono">SHA {String(sha).slice(0, 10)}</span> : null}
          {gate.status ? <span>gate {gate.status}</span> : null}
          {ai.status ? <span>ai {ai.status}</span> : null}
        </div>
        <div className="opa-jobs-evidence-actions">
          {active && onCancel ? (
            <button type="button" className="opa-btn ghost" disabled={busy} onClick={() => onCancel(job.id)}>Cancel</button>
          ) : null}
          {onRetry ? (
            <button type="button" className="opa-btn ghost" disabled={busy} onClick={() => onRetry(job.id)}>Retry</button>
          ) : null}
          <Link to={scmJobHref(job.id)} className="opa-btn primary">
            Open findings{findings.length ? ` (${findings.length})` : ''}
          </Link>
        </div>
      </div>

      {(honesty || degraded) ? (
        <div className={`opa-jobs-evidence-callout${degraded ? ' warn' : ''}`}>
          <strong>{degraded ? 'Degraded' : 'Honesty'}</strong>
          <span>{String(degraded || honesty)}</span>
        </div>
      ) : null}

      {risk != null && risk !== '' ? (
        <div className="opa-jobs-evidence-risk">
          <div className="opa-jobs-evidence-risk-label">
            <span className="opa-muted">Risk score</span>
            <span className="opa-mono">{risk}</span>
          </div>
          <div className="opa-jobs-evidence-risk-bar">
            <span style={{
              width: `${Math.min(100, Number(risk) || 0)}%`,
              background: Number(risk) >= 70 ? 'var(--error)' : Number(risk) >= 40 ? 'var(--warn)' : 'var(--ok)',
            }}
            />
          </div>
          {Array.isArray(riskFactors) && riskFactors.length ? (
            <div className="opa-jobs-evidence-factors">
              {riskFactors.slice(0, 6).map((f) => (
                <Badge key={String(f)}>{typeof f === 'string' ? f : (f.key || f.rule || JSON.stringify(f))}</Badge>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="opa-jobs-evidence-section">
        <h3>Run children</h3>
        {kids.length === 0 ? (
          <p className="opa-muted" style={{ margin: 0, fontSize: 12 }}>No child stages on this row.</p>
        ) : (
          <ul className="opa-jobs-evidence-children">
            {kids.map((c) => (
              <li key={c.id || c.kind}>
                <span className="opa-mono">{agentKindLabel(c.kind) || c.kind}</span>
                <StatusPill tone={toneForStatus(c.status)}>{c.status || '—'}</StatusPill>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="opa-jobs-evidence-section">
        <h3>Findings ({findings.length})</h3>
        {findings.length === 0 ? (
          <p className="opa-muted" style={{ margin: 0, fontSize: 12 }}>No findings on the list summary for this SHA.</p>
        ) : (
          <ul className="opa-jobs-evidence-findings">
            {findings.slice(0, 5).map((f, i) => (
              <li key={f.finding_key || f.key || f.rule || i}>
                <div className="opa-jobs-evidence-finding-head">
                  <span className="cell-strong">{f.rule || f.category || 'finding'}</span>
                  <StatusPill tone={sevTone(f.severity)}>{f.severity || '—'}</StatusPill>
                </div>
                {(f.file || f.path) ? (
                  <div className="opa-mono opa-muted" style={{ fontSize: 11 }}>
                    {f.file || f.path}{f.line != null ? `:${f.line}` : ''}
                  </div>
                ) : null}
                <div className="opa-muted" style={{ fontSize: 12 }}>
                  {f.problem || f.message || f.title || '—'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {prefs ? (
        <section className="opa-jobs-evidence-section">
          <h3>Frozen agent prefs</h3>
          <div className="opa-jobs-evidence-factors">
            {prefs.trigger_mode != null ? <Badge>bugbot · {String(prefs.trigger_mode)}</Badge> : null}
            <Badge>security {prefs.security_auto_pr_reviews ? 'on' : 'off'}</Badge>
            <Badge>approval {prefs.auto_approve ? 'auto' : 'manual'}</Badge>
            <Badge>cloud {prefs.cloud_enabled ? (prefs.autofix_mode || 'on') : 'off'}</Badge>
            {prefs.bugbot_max_units != null ? <Badge>max units {String(prefs.bugbot_max_units)}</Badge> : null}
          </div>
        </section>
      ) : null}

      {job.pr_number ? (
        <section className="opa-jobs-evidence-section">
          <h3>Agents on this PR</h3>
          <p className="opa-muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
            Prefs frozen at enqueue for {job.repo_full_name}. Changing Agents applies to the next job, not this one.
          </p>
          <div className="opa-jobs-action-list">
            <ActionRow
              title="Re-run Bugbot only"
              hint="Restart the AI review on this SHA without re-running AppSec scanners (ai_only)."
              effect="Uses current Bugbot prefs · keeps gate result · POST …/ai-review"
              disabled={!canAgent || busy}
            >
              <button
                type="button"
                className="opa-btn ghost"
                disabled={!canAgent || busy || !onRerunBugbot}
                onClick={() => onRerunBugbot?.(job)}
              >
                Run
              </button>
            </ActionRow>
            <ActionRow
              title="Re-run full OPA Review"
              hint="Enqueue prepare + Security gate + Bugbot (+ Cloud when prefs allow). Orchestrator has no security-only endpoint."
              effect="Updates Gate + OPA Review checks · POST …/ai-review ai_only=false"
              disabled={!canAgent || busy}
            >
              <button
                type="button"
                className="opa-btn ghost"
                disabled={!canAgent || busy || !onRerunFull}
                onClick={() => onRerunFull?.(job)}
              >
                Run
              </button>
            </ActionRow>
            <ActionRow
              title="Request Cloud autofix"
              hint="Ask Cloud to propose a patch for actionable findings (suggest or branch mode)."
              effect={cloud.reason}
              disabled={!canAgent || busy || !cloud.ok || findings.length === 0}
            >
              <button
                type="button"
                className="opa-btn ghost"
                disabled={!canAgent || busy || !cloud.ok || findings.length === 0 || !onCloudAutofix}
                title={!cloud.ok ? cloud.reason : (findings.length === 0 ? 'No findings to fix' : undefined)}
                onClick={() => onCloudAutofix?.(job, { createPr: String(prefs?.autofix_mode || '').toLowerCase() === 'branch' })}
              >
                Request
              </button>
            </ActionRow>
            <ActionRow
              title="Override approval"
              hint="Manually complete or reject a waiting approval child."
              effect="Not available — orchestrator has no override API; use Approval prefs or re-run."
              disabled
            >
              <button type="button" className="opa-btn ghost" disabled>Override</button>
            </ActionRow>
          </div>
        </section>
      ) : null}
    </div>
  )
}

export { findingsFromJob, frozenPrefs }
