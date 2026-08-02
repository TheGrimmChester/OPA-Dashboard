/* Variant A — Faithful polish: production IA, clearer hierarchy + sticky jump */

function VariantA({ initialTab = "watch" }) {
  const st = useWatchState(WATCHED_SEED);
  const [tab, setTab] = useState(initialTab);
  const [section, setSection] = useState("setup");
  const [picked, setPicked] = useState(() =>
    Object.fromEntries(AVAILABLE.slice(0, 3).map((r) => [r.full_name, true]))
  );
  const [reviewRepos, setReviewRepos] = useState({ "acme/checkout-api": true, "acme-platform/infra": true });
  const [reviewPrs, setReviewPrs] = useState({ "acme/checkout-api#412": true, "acme-platform/infra#88": true });
  const [ctxForm, setCtxForm] = useState({ repo: "acme/checkout-api", title: "", body: "", design: false });
  const [globalChecks, setGlobalChecks] = useState({
    secrets: true, sast: true, iac: true, sbom: false, ai_review: true,
  });
  const [policy, setPolicy] = useState({ aiBlocking: true, autoReviewer: true, minScore: 72 });
  const inflight = jobCounts(JOBS_SEED).inflight;
  const watchEnabled = st.watched.filter((w) => w.enabled).length;

  const jump = (id) => {
    setSection(id);
    const el = document.getElementById(`a-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (tab === "jobs") {
    return (
      <ShellChrome
        tab={tab}
        onTab={setTab}
        title="PR Jobs"
        sub="Production queue, polished: status chips, filters, and an evidence drawer beside the table."
        railNote="A · Faithful polish"
        watchCount={watchEnabled}
        jobsCount={inflight}
        actions={
          <>
            <button type="button" className="rw-btn" onClick={() => st.flash("Resume stalled (mock)")}>Resume stalled</button>
            <button type="button" className="rw-btn" onClick={() => setTab("watch")}>Run from Watch</button>
            <button type="button" className="rw-btn primary" onClick={() => st.flash("Refresh (mock)")}>Refresh</button>
          </>
        }
      >
        <JobsA onFlash={st.flash} />
        <Toast text={st.toast} />
      </ShellChrome>
    );
  }

  return (
    <ShellChrome
      tab={tab}
      onTab={setTab}
      title="Repo Watch"
      sub="Production IA, polished: sticky section jump, clearer panels, same stacked workflow."
      railNote="A · Faithful polish"
      watchCount={watchEnabled}
      jobsCount={inflight}
      actions={
        <>
          <button type="button" className="rw-btn">Simulate PR</button>
          <button type="button" className="rw-btn primary" disabled={!st.dirty} onClick={() => st.save("Watched repos saved")}>
            Save watched repos
          </button>
        </>
      }
    >
      <nav className="rw-jump" aria-label="Sections">
        {[
          ["setup", "Setup"],
          ["available", "Available"],
          ["watched", "Watched"],
          ["run", "Run Review"],
          ["contexts", "Contexts"],
          ["ai", "AI key"],
        ].map(([id, label]) => (
          <button key={id} type="button" className={section === id ? "active" : ""} onClick={() => jump(id)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="rw-scroll">
        <KpiRow watched={st.watched} />

        <section id="a-setup" className="rw-panel" onFocus={() => setSection("setup")}>
          <div className="rw-panel-head">
            <h2>Setup</h2>
            <span className="rw-muted">Connector · default checks · gate prefs</span>
          </div>
          <div className="rw-panel-body">
            <p className="rw-lead">
              Pick an SCM connector, then choose repositories to watch. Connectors live under Settings.
              App configured: <strong>yes</strong>.
            </p>
            <label className="rw-field">
              Active connector
              <select value={st.connector} onChange={(e) => st.setConnector(e.target.value)}>
                {CONNECTORS.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
            <div className="rw-checks-title">Checks included in each PR job (defaults for new watches)</div>
            <div className="rw-checks">
              {CHECK_OPTS.map((c) => (
                <CheckRow
                  key={c.id}
                  id={`a-g-${c.id}`}
                  label={c.label}
                  hint={c.hint}
                  checked={!!globalChecks[c.id]}
                  onChange={(v) => setGlobalChecks((p) => ({ ...p, [c.id]: v }))}
                />
              ))}
            </div>
            <PrefRow
              label="AI blocking"
              hint="Fail the GitHub Check Run when Bugbot/approval blocks."
              on={policy.aiBlocking}
              effectOn="OPA Review check fails when AI blocks."
              effectOff="Findings stay advisory."
            >
              <Switch label="AI blocking" on={policy.aiBlocking} onChange={(v) => setPolicy((p) => ({ ...p, aiBlocking: v }))} />
            </PrefRow>
            <PrefRow
              label="Auto-request as reviewer"
              hint="Request the OPA Review bot on PR open."
              on={policy.autoReviewer}
              effectOn="Bot appears in reviewers list."
              effectOff="Checks/comments only — no reviewer request."
            >
              <Switch label="Auto reviewer" on={policy.autoReviewer} onChange={(v) => setPolicy((p) => ({ ...p, autoReviewer: v }))} />
            </PrefRow>
            <PrefRow label="Min approve score" hint="0 = COMMENT only; 1–100 = APPROVE when confidence ≥ score.">
              <input
                type="number"
                min={0}
                max={100}
                value={policy.minScore}
                onChange={(e) => setPolicy((p) => ({ ...p, minScore: Number(e.target.value) || 0 }))}
                style={{ width: 72 }}
              />
            </PrefRow>
          </div>
        </section>

        <section id="a-available" className="rw-panel">
          <div className="rw-panel-head">
            <h2>Available repositories</h2>
            <button type="button" className="rw-btn sm">Reload list</button>
          </div>
          <div className="rw-panel-body">
            <div className="rw-row-between">
              <span className="rw-muted">{AVAILABLE.length} repos</span>
              <div className="rw-inline">
                <button type="button" className="rw-btn sm" onClick={() => setPicked(Object.fromEntries(AVAILABLE.map((r) => [r.full_name, true])))}>Select all</button>
                <button type="button" className="rw-btn sm" onClick={() => setPicked({})}>Clear</button>
              </div>
            </div>
            <div className="rw-repo-pick">
              {AVAILABLE.map((r) => (
                <label key={r.full_name} className="rw-pick-row">
                  <input
                    type="checkbox"
                    checked={!!picked[r.full_name]}
                    onChange={() => setPicked((p) => ({ ...p, [r.full_name]: !p[r.full_name] }))}
                  />
                  <span className="mono">{r.full_name}</span>
                  {r.private ? <Pill>private</Pill> : null}
                </label>
              ))}
            </div>
          </div>
        </section>

        <section id="a-watched" className="rw-panel flush">
          <div className="rw-panel-head">
            <h2>Watched repositories</h2>
            <span className="rw-muted">{st.watched.length} in set</span>
          </div>
          <table className="rw-table">
            <thead>
              <tr>
                <th>Repo</th>
                <th>Service</th>
                <th>Checks</th>
                <th>AI block</th>
                <th>On</th>
              </tr>
            </thead>
            <tbody>
              {st.watched.map((r) => (
                <tr key={r.repo}>
                  <td className="mono strong">{r.repo}</td>
                  <td>{r.service}</td>
                  <td className="mono muted small">{r.checks.join(" · ")}</td>
                  <td>
                    <Switch
                      label={`AI block ${r.repo}`}
                      on={r.aiBlocking}
                      onChange={(v) => st.patchRepo(r.repo, { aiBlocking: v })}
                    />
                  </td>
                  <td>
                    <Switch
                      label={`Enable ${r.repo}`}
                      on={r.enabled}
                      onChange={(v) => st.patchRepo(r.repo, { enabled: v })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section id="a-run" className="rw-panel">
          <div className="rw-panel-head">
            <h2>Run OPA Review</h2>
          </div>
          <div className="rw-panel-body">
            <p className="rw-lead">Select watched repos and open PRs, then enqueue one stack.</p>
            <div className="rw-chip-pick">
              {st.watched.map((r) => (
                <label key={r.repo} className={`rw-chip ${reviewRepos[r.repo] ? "on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={!!reviewRepos[r.repo]}
                    onChange={(e) => setReviewRepos((p) => ({ ...p, [r.repo]: e.target.checked }))}
                  />
                  <span className="mono">{r.repo}</span>
                </label>
              ))}
            </div>
            <div className="rw-pr-blocks">
              {Object.keys(reviewRepos).filter((k) => reviewRepos[k]).map((repo) => {
                const row = st.watched.find((w) => w.repo === repo);
                return (
                  <div key={repo} className="rw-pr-block">
                    <div className="mono small">{repo}</div>
                    <div className="rw-chip-pick">
                      {(row?.openPrs || []).map((p) => {
                        const key = `${repo}#${p.n}`;
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
                      {!row?.openPrs?.length && <span className="rw-muted">No open PRs</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="rw-btn primary"
              disabled={!Object.values(reviewPrs).some(Boolean)}
              onClick={() => st.flash("OPA Review stack queued (mock)")}
            >
              Run OPA Review stack
            </button>
          </div>
        </section>

        <section id="a-contexts" className="rw-panel">
          <div className="rw-panel-head"><h2>Reviewer contexts</h2></div>
          <div className="rw-panel-body">
            <div className="rw-grid-2">
              <label className="rw-field">
                Repo
                <select value={ctxForm.repo} onChange={(e) => setCtxForm((f) => ({ ...f, repo: e.target.value }))}>
                  {st.watched.map((r) => <option key={r.repo} value={r.repo}>{r.repo}</option>)}
                </select>
              </label>
              <label className="rw-field">
                Title
                <input
                  value={ctxForm.title}
                  onChange={(e) => setCtxForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Auth & trust boundaries"
                />
              </label>
            </div>
            <label className="rw-pick-row" style={{ marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={ctxForm.design}
                onChange={(e) => setCtxForm((f) => ({ ...f, design: e.target.checked }))}
              />
              Design / UI enforcement context
            </label>
            <textarea
              className="rw-textarea mono"
              rows={4}
              placeholder={"## System\n## Scope\n## Risk areas"}
              value={ctxForm.body}
              onChange={(e) => setCtxForm((f) => ({ ...f, body: e.target.value }))}
            ></textarea>
            <div className="rw-inline" style={{ marginTop: 8 }}>
              <button type="button" className="rw-btn primary" onClick={() => st.flash("Context saved (mock)")}>Save context</button>
              <button type="button" className="rw-btn" onClick={() => st.flash("Generate skipped — mock")}>Generate with AI</button>
            </div>
            <table className="rw-table" style={{ marginTop: 12 }}>
              <thead><tr><th>Repo</th><th>Title</th><th>Tags</th><th></th></tr></thead>
              <tbody>
                {CONTEXTS_SEED.map((c) => (
                  <tr key={c.id}>
                    <td className="mono small">{c.repo}</td>
                    <td>{c.title}</td>
                    <td>{c.tags.map((t) => <Pill key={t}>{t}</Pill>)}</td>
                    <td><button type="button" className="rw-btn sm">Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="a-ai" className="rw-panel">
          <div className="rw-panel-head"><h2>OPA Review AI</h2></div>
          <div className="rw-panel-body rw-inline" style={{ gap: 12 }}>
            <Pill tone="ok">CLI key set · {AI_STATUS.scope}</Pill>
            <span className="rw-muted">model {AI_STATUS.model} · user {AI_STATUS.user} · org {AI_STATUS.org}</span>
            <button type="button" className="rw-btn sm">Manage in Account</button>
          </div>
        </section>
      </div>
      <Toast text={st.toast} />
    </ShellChrome>
  );
}

Object.assign(window, { VariantA });
