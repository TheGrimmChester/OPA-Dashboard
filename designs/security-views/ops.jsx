/* PR Ops pillar — Watch / Run / Contexts / Jobs / Webhooks (Variant B workspace IA) */

const { useState, useMemo } = React;

function EvidenceBody({ job, onAction, onOpenWatch }) {
  if (!job) {
    return (
      <div className="rw-jobs-empty">
        <div className="rw-muted">Select a job to inspect cause, children, and verdict.</div>
      </div>
    );
  }
  return (
    <div className="rw-ev stack">
      <div className="rw-ev-head">
        <div>
          <div className="mono strong">{job.repo} <Pill>#{job.pr}</Pill></div>
          <div className="rw-muted small">{job.title}</div>
        </div>
        <Pill tone={job.tone}>{job.status}</Pill>
      </div>
      <div className="rw-muted small mono">{job.id} · {job.sha} · {job.age}</div>
      <div className="rw-inline" style={{ marginTop: 6 }}>
        <button type="button" className="rw-btn sm" onClick={() => onAction?.("retry")}>Retry</button>
        <button type="button" className="rw-btn sm" onClick={() => onAction?.("rerun")}>Re-run Bugbot</button>
        <button type="button" className="rw-btn sm primary" onClick={() => onAction?.("fix")}>Cloud autofix</button>
      </div>
      {job.risk != null && (
        <div className="rw-risk">
          <div className="rw-row-between"><span className="rw-muted small">Risk</span><strong className="mono">{job.risk}</strong></div>
          <div className="rw-risk-bar"><span style={{ width: `${Math.min(100, job.risk)}%` }}></span></div>
        </div>
      )}
      <div className="rw-callout">
        <strong>Honesty</strong>
        <div>{job.honesty}</div>
      </div>
      <div>
        <div className="rw-checks-title">Run children</div>
        <div className="rw-child-list">
          {(job.children || []).map((c) => (
            <div key={c.step} className="rw-child-row">
              <StatusDot tone={childTone(c.status)} live={c.status === "running"} />
              <span className="strong">{c.step}</span>
              <Pill tone={childTone(c.status)}>{c.status}</Pill>
              <span className="rw-muted small">{c.detail}</span>
            </div>
          ))}
          {!job.children?.length && <span className="rw-muted">No children</span>}
        </div>
      </div>
      {!!job.findings?.length && (
        <div>
          <div className="rw-checks-title">Findings</div>
          {job.findings.map((f, i) => (
            <div key={i} className="rw-finding">
              <Pill tone={f.sev === "critical" || f.sev === "high" ? "error" : f.sev === "medium" ? "warn" : ""}>{f.sev}</Pill>
              <span className="mono small">{f.rule}</span>
              <span className="rw-muted small">{f.where}</span>
            </div>
          ))}
        </div>
      )}
      <div className="rw-verdict">{job.verdict}</div>
      {job.result === "not watched" && (
        <button type="button" className="rw-btn sm" style={{ marginTop: 8 }} onClick={onOpenWatch}>Watch repo</button>
      )}
    </div>
  );
}

function useJobsState() {
  const [jobs] = useState(JOBS_SEED);
  const [selectedId, setSelectedId] = useState(JOBS_SEED.find((j) => j.status === "waiting")?.id || JOBS_SEED[0].id);
  const [status, setStatus] = useState("all");
  const [repo, setRepo] = useState("all");
  const [q, setQ] = useState("");
  const counts = useMemo(() => jobCounts(jobs), [jobs]);
  const repos = useMemo(() => [...new Set(jobs.map((j) => j.repo))].sort(), [jobs]);
  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (status === "inflight" && !["running", "waiting", "queued"].includes(j.status)) return false;
      if (status !== "all" && status !== "inflight" && j.status !== status) return false;
      if (repo !== "all" && j.repo !== repo) return false;
      if (q) {
        const hay = `${j.id} ${j.repo} #${j.pr} ${j.title} ${j.result} ${j.author}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [jobs, status, repo, q]);
  const selected = jobs.find((j) => j.id === selectedId) || filtered[0];
  return { jobs, selectedId, setSelectedId, selected, status, setStatus, repo, setRepo, q, setQ, counts, repos, filtered };
}

function OpsJobs({ onFlash, onOpenWatch }) {
  const st = useJobsState();
  return (
    <>
      <div className="rw-kpi-row" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {[
          ["inflight", "In flight", "warn", st.counts.inflight],
          ["completed", "Completed", "ok", st.counts.completed],
          ["failed", "Failed", "error", st.counts.failed],
          ["cancelled", "Cancelled", "", st.counts.cancelled],
          ["skipped", "Skipped", "info", st.counts.skipped],
        ].map(([id, label, tone, n]) => (
          <button
            key={id}
            type="button"
            className={`rw-kpi clickable ${st.status === id ? "active" : ""}`}
            onClick={() => st.setStatus(st.status === id ? "all" : id)}
          >
            <span className="rw-kpi-label"><StatusDot tone={tone} live={id === "inflight" && n > 0} /> {label}</span>
            <span className={`rw-kpi-val ${tone}`}>{n}</span>
          </button>
        ))}
      </div>
      <div className="rw-jobs-filters">
        <label className="rw-field inline">
          Repo
          <select value={st.repo} onChange={(e) => st.setRepo(e.target.value)}>
            <option value="all">All repos</option>
            {st.repos.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="rw-field inline grow">
          Search
          <input value={st.q} onChange={(e) => st.setQ(e.target.value)} placeholder="job, repo, PR…" />
        </label>
        <span className="rw-muted small">{st.filtered.length}/{st.jobs.length}</span>
        <button type="button" className="rw-btn sm" onClick={() => onFlash("Resume stalled (mock)")}>Resume stalled</button>
      </div>
      <div className="rw-split">
        <div className="rw-panel flush grow">
          <div className="rw-panel-head"><h2>Queue</h2><span className="rw-muted">Newest first</span></div>
          <div className="rw-list">
            {st.filtered.map((j) => (
              <button
                key={j.id}
                type="button"
                className={`rw-list-row ${j.id === st.selected?.id ? "selected" : ""}`}
                onClick={() => st.setSelectedId(j.id)}
              >
                <div>
                  <div className="mono strong">{j.repo} <Pill>#{j.pr}</Pill></div>
                  <div className="rw-muted small">{j.title}</div>
                  <div className="rw-muted small mono">{j.id}</div>
                </div>
                <div className="rw-list-badges" style={{ flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <Pill tone={j.tone}>{j.status}</Pill>
                  <span className="rw-muted small">{j.age}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="rw-panel inspector" style={{ width: 400, flex: "0 0 400px" }}>
          <div className="rw-panel-head"><h2>Evidence</h2></div>
          <div className="rw-panel-body" style={{ overflow: "auto", maxHeight: 480 }}>
            <EvidenceBody
              job={st.selected}
              onAction={(a) => onFlash(`${a} · ${st.selected?.id}`)}
              onOpenWatch={onOpenWatch}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function OpsWatch({ st, selected, setSelected, addOpen, setAddOpen }) {
  const row = st.watched.find((w) => w.repo === selected) || st.watched[0];
  return (
    <div className="rw-split">
      <div className="rw-panel flush grow">
        <div className="rw-panel-head">
          <h2>Watched repositories</h2>
          <div className="rw-inline">
            <button type="button" className="rw-btn sm" onClick={() => setAddOpen((v) => !v)}>
              {addOpen ? "Hide catalog" : "Add repos"}
            </button>
          </div>
        </div>
        <div className="rw-list">
          {st.watched.map((r) => (
            <button
              key={r.repo}
              type="button"
              className={`rw-list-row ${r.repo === selected ? "selected" : ""} ${r.enabled ? "" : "dim"}`}
              onClick={() => setSelected(r.repo)}
            >
              <div>
                <div className="mono strong">{r.repo}</div>
                <div className="rw-muted small">{r.checks.join(" · ") || "no checks"}{r.service ? ` · ${r.service}` : ""}</div>
              </div>
              <div className="rw-list-badges">
                {r.aiBlocking ? <Pill tone="warn">AI block</Pill> : null}
                <Pill tone={r.enabled ? "ok" : ""}>{r.enabled ? "on" : "off"}</Pill>
              </div>
            </button>
          ))}
        </div>
        {addOpen && (
          <div className="rw-catalog">
            <div className="rw-muted small" style={{ padding: "8px 2px" }}>{AVAILABLE.length} available</div>
            {AVAILABLE.map((r) => (
              <label key={r.full_name} className="rw-pick-row">
                <input type="checkbox" defaultChecked={st.watched.some((w) => w.repo === r.full_name)} />
                <span className="mono small strong">{r.full_name}</span>
                {r.private ? <Pill>private</Pill> : null}
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="rw-panel inspector">
        <div className="rw-panel-head">
          <h2>{row?.repo || "Select a repo"}</h2>
        </div>
        <div className="rw-panel-body stack">
          {!row ? <div className="rw-muted">Pick a watched repository.</div> : (
            <>
              <PrefRow
                label="Enabled"
                hint="Installed ≠ watched ≠ spend"
                on={row.enabled}
                effectOn="Webhooks enqueue PR jobs"
                effectOff="Receipts only — no agent spend"
              >
                <Switch on={row.enabled} onChange={(v) => st.patch(row.repo, { enabled: v })} label="Enabled" />
              </PrefRow>
              <div className="rw-checks-title">Checks</div>
              <div className="rw-checks compact">
                {CHECK_OPTS.map((c) => (
                  <CheckRow
                    key={c.id}
                    id={`chk-${c.id}`}
                    label={c.label}
                    hint={c.hint}
                    checked={row.checks.includes(c.id)}
                    onChange={() => st.toggleCheck(row.repo, c.id)}
                  />
                ))}
              </div>
              <PrefRow
                label="AI blocking"
                hint="Fail the check when Bugbot finds above threshold"
                on={row.aiBlocking}
                effectOn="Merge blocked on AI fail"
                effectOff="Advisory only"
              >
                <Switch on={row.aiBlocking} onChange={(v) => st.patch(row.repo, { aiBlocking: v })} label="AI blocking" />
              </PrefRow>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OpsScreen({ onPillar, counts, initialMode }) {
  const st = useWatchState(WATCHED_SEED);
  const [mode, setMode] = useState(initialMode || "jobs");
  const [selected, setSelected] = useState(WATCHED_SEED[0].repo);
  const [addOpen, setAddOpen] = useState(false);
  const [reviewPrs, setReviewPrs] = useState({ "acme/checkout-api#412": true });
  const inflight = jobCounts(JOBS_SEED).inflight;
  const watchEnabled = st.watched.filter((w) => w.enabled).length;

  const modes = [
    { id: "watch", label: "Watch" },
    { id: "run", label: "Run" },
    { id: "contexts", label: "Contexts" },
    { id: "jobs", label: "PR Jobs" },
    { id: "webhooks", label: "Webhooks" },
  ];

  return (
    <ShellChrome
      pillar="ops"
      onPillar={onPillar}
      counts={{ ...counts, ops: inflight }}
      railNote="Redesign · views · live menu chrome"
      actions={
        <>
          {mode === "watch" && (
            <button type="button" className="opa-btn primary" disabled={!st.dirty} onClick={() => st.save()}>
              Save watch set
            </button>
          )}
          {mode === "jobs" && (
            <button type="button" className="opa-btn ghost" onClick={() => st.flash("Simulate (mock)")}>Simulate review</button>
          )}
          <button type="button" className="opa-btn ghost" onClick={() => setMode("run")}>Run OPA Review</button>
        </>
      }
    >
      <div className="rw-conn-bar">
        <label className="rw-field inline">
          Connector
          <select value={st.connector} onChange={(e) => st.setConnector(e.target.value)}>
            {CONNECTORS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <Pill tone="ok">live</Pill>
        <span className="rw-muted">Installed ≠ watched ≠ spend · {watchEnabled} enabled</span>
      </div>

      <div className="opa-tabs sv-subtabs" role="tablist" aria-label="PR Ops modes">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            className={`opa-tab ${mode === m.id ? "active" : ""}`}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "watch" && (
        <OpsWatch st={st} selected={selected} setSelected={setSelected} addOpen={addOpen} setAddOpen={setAddOpen} />
      )}

      {mode === "run" && (
        <div className="rw-panel grow">
          <div className="rw-panel-head"><h2>Run OPA Review</h2></div>
          <div className="rw-panel-body" style={{ overflow: "auto" }}>
            <p className="rw-lead">Pick open PRs on watched repos. Force re-runs even when a job is in flight.</p>
            <div className="rw-pr-blocks">
              {st.watched.filter((w) => w.enabled && w.openPrs?.length).map((w) => (
                <div key={w.repo} className="rw-pr-block">
                  <div className="mono strong">{w.repo}</div>
                  {w.openPrs.map((pr) => {
                    const key = `${w.repo}#${pr.n}`;
                    return (
                      <label key={key} className="rw-pick-row">
                        <input
                          type="checkbox"
                          checked={!!reviewPrs[key]}
                          onChange={(e) => setReviewPrs((p) => ({ ...p, [key]: e.target.checked }))}
                        />
                        <span>#{pr.n} {pr.title}</span>
                        {pr.draft ? <Pill>draft</Pill> : null}
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="rw-btn primary"
              onClick={() => {
                st.flash("Enqueued mock stack");
                setMode("jobs");
              }}
            >
              Enqueue review
            </button>
          </div>
        </div>
      )}

      {mode === "contexts" && (
        <div className="rw-split">
          <div className="rw-panel flush grow">
            <div className="rw-panel-head"><h2>Reviewer contexts</h2></div>
            <table className="rw-table">
              <thead><tr><th>Repo</th><th>Title</th><th>Source</th><th>Tags</th></tr></thead>
              <tbody>
                {CONTEXTS_SEED.map((c) => (
                  <tr key={c.id}>
                    <td className="mono small">{c.repo}</td>
                    <td>{c.title}</td>
                    <td><Pill>{c.source}</Pill></td>
                    <td className="rw-muted small">{c.tags.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rw-panel inspector">
            <div className="rw-panel-head"><h2>OPA Review AI</h2></div>
            <div className="rw-panel-body">
              <div className="rw-meta-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div><span>Key</span><div>{AI_STATUS.keySet ? "set" : "missing"}</div></div>
                <div><span>Scope</span><div className="mono small">{AI_STATUS.scope}</div></div>
                <div><span>Model</span><div className="mono small">{AI_STATUS.model}</div></div>
                <div><span>User</span><div className="mono small">{AI_STATUS.user}</div></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === "jobs" && (
        <OpsJobs onFlash={st.flash} onOpenWatch={() => setMode("watch")} />
      )}

      {mode === "webhooks" && (
        <div className="rw-panel flush grow">
          <div className="rw-panel-head"><h2>Webhook deliveries</h2></div>
          <table className="rw-table">
            <thead>
              <tr><th>When</th><th>Event</th><th>Repo</th><th>Outcome</th><th>Job</th><th>Sig</th></tr>
            </thead>
            <tbody>
              {WEBHOOKS_SEED.map((w, i) => (
                <tr key={i}>
                  <td className="mono small">{w.when}</td>
                  <td className="mono small">{w.event}</td>
                  <td className="mono small">{w.repo}</td>
                  <td>{w.outcome}</td>
                  <td className="mono small">{w.job}</td>
                  <td><Pill tone="ok">{w.sig}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Toast text={st.toast} />
    </ShellChrome>
  );
}

Object.assign(window, { OpsScreen });
