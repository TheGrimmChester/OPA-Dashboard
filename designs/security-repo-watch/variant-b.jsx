/* Variant B — Workspace IA: mode tabs + master–detail per-repo gate */

function VariantB({ initialTab = "watch" }) {
  const st = useWatchState(WATCHED_SEED);
  const [tab, setTab] = useState(initialTab);
  const [mode, setMode] = useState("watch");
  const [selected, setSelected] = useState(WATCHED_SEED[0].repo);
  const [reviewPrs, setReviewPrs] = useState({ "acme/checkout-api#412": true, "acme-platform/infra#88": true });
  const [force, setForce] = useState(false);
  const [aiOnly, setAiOnly] = useState(false);
  const [ctxRepo, setCtxRepo] = useState("acme/checkout-api");
  const [ctxTitle, setCtxTitle] = useState("Auth & trust boundaries");
  const [addOpen, setAddOpen] = useState(false);
  const inflight = jobCounts(JOBS_SEED).inflight;
  const watchEnabled = st.watched.filter((w) => w.enabled).length;

  const row = st.watched.find((w) => w.repo === selected) || st.watched[0];

  const modes = [
    { id: "watch", label: "Watch", hint: "Repos & per-repo gate" },
    { id: "run", label: "Run", hint: "OPA Review stack" },
    { id: "contexts", label: "Contexts", hint: "Briefs & links" },
  ];

  if (tab === "jobs") {
    return (
      <ShellChrome
        tab={tab}
        onTab={setTab}
        title="PR Jobs"
        sub="Sparse queue with live evidence beside it — cause, children, and verdict without leaving the list."
        railNote="B · Workspace IA"
        watchCount={watchEnabled}
        jobsCount={inflight}
        actions={
          <>
            <button type="button" className="rw-btn" onClick={() => st.flash("Simulate (mock)")}>Simulate review</button>
            <button type="button" className="rw-btn primary" onClick={() => setTab("watch")}>Run OPA Review</button>
          </>
        }
      >
        <JobsB onFlash={st.flash} onOpenWatch={() => setTab("watch")} />
        <Toast text={st.toast} />
      </ShellChrome>
    );
  }

  return (
    <ShellChrome
      tab={tab}
      onTab={setTab}
      title="Repo Watch"
      sub="One workspace, three modes — watch setup never competes with Run or Contexts on the same scroll."
      railNote="B · Workspace IA"
      watchCount={watchEnabled}
      jobsCount={inflight}
      actions={
        <>
          <button type="button" className="rw-btn" onClick={() => setAddOpen((v) => !v)}>
            {addOpen ? "Hide catalog" : "Add repos"}
          </button>
          <button type="button" className="rw-btn primary" disabled={!st.dirty} onClick={() => st.save(`Saved ${row.repo}`)}>
            Save watch set
          </button>
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
        <span className="rw-muted">Installed ≠ watched ≠ spend</span>
        <button type="button" className="rw-btn sm">Manage connector</button>
      </div>

      <KpiRow watched={st.watched} />

      <div className="rw-mode-tabs" role="tablist">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            className={mode === m.id ? "active" : ""}
            onClick={() => setMode(m.id)}
          >
            <strong>{m.label}</strong>
            <span>{m.hint}</span>
          </button>
        ))}
      </div>

      {mode === "watch" && (
        <div className="rw-split">
          <div className="rw-panel flush grow">
            <div className="rw-panel-head">
              <h2>Watched</h2>
              <span className="rw-muted">{st.watched.filter((w) => w.enabled).length} enabled</span>
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
                    <div className="rw-muted small">{r.checks.join(" · ") || "no checks"} · {r.jobs24h} jobs/24h</div>
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
                <div className="rw-panel-head tight"><h3>Available to watch</h3></div>
                {AVAILABLE.filter((a) => !st.watched.some((w) => w.repo === a.full_name)).map((a) => (
                  <label key={a.full_name} className="rw-pick-row">
                    <input type="checkbox" />
                    <span className="mono">{a.full_name}</span>
                  </label>
                ))}
                <button type="button" className="rw-btn sm primary" style={{ margin: 10 }} onClick={() => st.flash("Repos added (mock)")}>
                  Add selected
                </button>
              </div>
            )}
          </div>

          <div className="rw-panel inspector">
            <div className="rw-panel-head">
              <h2 className="mono">{row?.repo}</h2>
              {st.dirty ? <Pill tone="warn">unsaved</Pill> : null}
            </div>
            {row && (
              <div className="rw-panel-body stack">
                <PrefRow
                  label="Enabled"
                  hint="Master gate — whether PR webhooks create paid jobs."
                  on={row.enabled}
                  effectOn="PR events enqueue jobs + agent children."
                  effectOff="Receipts only — no AI spend."
                >
                  <Switch label="Enabled" on={row.enabled} onChange={(v) => st.patchRepo(row.repo, { enabled: v })} />
                </PrefRow>
                <PrefRow
                  label="AI blocking"
                  hint="Fail GitHub Check Run when AI/approval blocks."
                  on={row.aiBlocking}
                  effectOn="Check fails on AI block."
                  effectOff="Advisory findings only."
                >
                  <Switch
                    label="AI blocking"
                    on={row.aiBlocking}
                    disabled={!row.enabled}
                    onChange={(v) => st.patchRepo(row.repo, { aiBlocking: v })}
                  />
                </PrefRow>
                <PrefRow
                  label="Auto-request reviewer"
                  hint="Request OPA Review bot on open/reopen."
                  on={row.autoReviewer}
                  effectOn="Bot in reviewers list."
                  effectOff="Checks/comments only."
                >
                  <Switch
                    label="Auto reviewer"
                    on={row.autoReviewer}
                    disabled={!row.enabled}
                    onChange={(v) => st.patchRepo(row.repo, { autoReviewer: v })}
                  />
                </PrefRow>
                <PrefRow label="Min approve score" hint="0 = COMMENT only.">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={row.minScore}
                    disabled={!row.enabled}
                    onChange={(e) => st.patchRepo(row.repo, { minScore: Number(e.target.value) || 0 })}
                    style={{ width: 72 }}
                  />
                </PrefRow>
                <div className="rw-checks-title">Checks for this repo</div>
                <div className="rw-checks compact">
                  {CHECK_OPTS.map((c) => (
                    <CheckRow
                      key={c.id}
                      id={`b-${row.repo}-${c.id}`}
                      label={c.label}
                      hint={c.hint}
                      checked={row.checks.includes(c.id)}
                      disabled={!row.enabled}
                      onChange={() => st.toggleCheck(row.repo, c.id)}
                    />
                  ))}
                </div>
                <div className="rw-meta-grid">
                  <div><span>Service</span><strong>{row.service}</strong></div>
                  <div><span>Last job</span><strong>{row.lastJob}</strong></div>
                  <div><span>Jobs 24h</span><strong className="mono">{row.jobs24h}</strong></div>
                </div>
                <div className="rw-inline">
                  <button type="button" className="rw-btn sm" onClick={() => setMode("run")}>Run review…</button>
                  <button type="button" className="rw-btn sm" onClick={() => { setCtxRepo(row.repo); setMode("contexts"); }}>Edit context</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {mode === "run" && (
        <div className="rw-panel">
          <div className="rw-panel-head">
            <h2>Run OPA Review stack</h2>
            <span className="rw-muted">One stack · concurrency drains extras</span>
          </div>
          <div className="rw-panel-body">
            <div className="rw-run-grid">
              {st.watched.filter((w) => w.enabled).map((r) => (
                <div key={r.repo} className="rw-run-card">
                  <div className="rw-row-between">
                    <span className="mono strong">{r.repo}</span>
                    <Pill>{r.openPrs.length} open</Pill>
                  </div>
                  <div className="rw-chip-pick">
                    {r.openPrs.map((p) => {
                      const key = `${r.repo}#${p.n}`;
                      return (
                        <label key={key} className={`rw-chip ${reviewPrs[key] ? "on" : ""}`}>
                          <input
                            type="checkbox"
                            checked={!!reviewPrs[key]}
                            onChange={(e) => setReviewPrs((prev) => ({ ...prev, [key]: e.target.checked }))}
                          />
                          #{p.n} {p.title}{p.draft ? " (draft)" : ""}
                        </label>
                      );
                    })}
                    {!r.openPrs.length && <span className="rw-muted">No open PRs</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="rw-inline" style={{ marginTop: 12 }}>
              <label className="rw-pick-row"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Force (include drafts)</label>
              <label className="rw-pick-row"><input type="checkbox" checked={aiOnly} onChange={(e) => setAiOnly(e.target.checked)} /> OPA Review only</label>
            </div>
            <div className="rw-inline" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="rw-btn primary"
                disabled={!Object.values(reviewPrs).some(Boolean)}
                onClick={() => st.flash("Stack queued · mock")}
              >
                Run OPA Review stack
              </button>
              <button type="button" className="rw-btn">Cancel stack</button>
            </div>
          </div>
        </div>
      )}

      {mode === "contexts" && (
        <div className="rw-split">
          <div className="rw-panel grow">
            <div className="rw-panel-head"><h2>Contexts</h2></div>
            <table className="rw-table">
              <thead><tr><th>Repo</th><th>Title</th><th>Source</th><th>Tags</th></tr></thead>
              <tbody>
                {CONTEXTS_SEED.map((c) => (
                  <tr
                    key={c.id}
                    className={c.repo === ctxRepo ? "selected" : ""}
                    onClick={() => { setCtxRepo(c.repo); setCtxTitle(c.title); }}
                  >
                    <td className="mono small">{c.repo}</td>
                    <td>{c.title}</td>
                    <td><Pill>{c.source}</Pill></td>
                    <td>{c.tags.map((t) => <Pill key={t}>{t}</Pill>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rw-panel inspector">
            <div className="rw-panel-head"><h2>Edit brief</h2></div>
            <div className="rw-panel-body stack">
              <label className="rw-field">
                Repo
                <select value={ctxRepo} onChange={(e) => setCtxRepo(e.target.value)}>
                  {st.watched.map((w) => <option key={w.repo} value={w.repo}>{w.repo}</option>)}
                </select>
              </label>
              <label className="rw-field">
                Title
                <input value={ctxTitle} onChange={(e) => setCtxTitle(e.target.value)} />
              </label>
              <textarea className="rw-textarea mono" rows={6} defaultValue={"## System\n## Scope\n## Risk areas\n"}></textarea>
              <div className="rw-inline">
                <button type="button" className="rw-btn primary" onClick={() => st.flash("Context updated")}>Save</button>
                <button type="button" className="rw-btn" onClick={() => st.flash("AI draft (mock)")}>Generate</button>
              </div>
              <div className="rw-callout">
                <strong>AI key</strong>
                <div className="rw-muted">CLI key set · {AI_STATUS.scope} · model {AI_STATUS.model}</div>
                <button type="button" className="rw-btn sm" style={{ marginTop: 8 }}>Manage in Account</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toast text={st.toast} />
    </ShellChrome>
  );
}

Object.assign(window, { VariantB });
