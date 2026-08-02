/* Variant C — Novel gate map: stage rail + repo gate cards + run tray */

function VariantC({ initialTab = "watch" }) {
  const st = useWatchState(WATCHED_SEED);
  const [tab, setTab] = useState(initialTab);
  const [stage, setStage] = useState("gate");
  const [selected, setSelected] = useState(WATCHED_SEED[0].repo);
  const [trayOpen, setTrayOpen] = useState(false);
  const [reviewPrs, setReviewPrs] = useState({ "acme/checkout-api#412": true });
  const [briefOpen, setBriefOpen] = useState(false);
  const inflight = jobCounts(JOBS_SEED).inflight;
  const watchEnabled = st.watched.filter((w) => w.enabled).length;

  const row = st.watched.find((w) => w.repo === selected) || st.watched[0];
  const stages = [
    { id: "connect", label: "Connect", n: "01" },
    { id: "gate", label: "Gate", n: "02" },
    { id: "review", label: "Review", n: "03" },
    { id: "brief", label: "Brief", n: "04" },
  ];

  const openTray = () => {
    setStage("review");
    setTrayOpen(true);
  };

  if (tab === "jobs") {
    return (
      <ShellChrome
        tab={tab}
        onTab={setTab}
        title="PR Jobs"
        sub="Jobs as a swimlane board — status columns plus a story strip for the selected run."
        railNote="C · Novel gate map"
        watchCount={watchEnabled}
        jobsCount={inflight}
        actions={
          <>
            <button type="button" className="rw-btn" onClick={() => setTab("watch")}>Back to gates</button>
            <button type="button" className="rw-btn primary" onClick={() => st.flash("Stack from board (mock)")}>Enqueue stack</button>
          </>
        }
      >
        <JobsC onFlash={st.flash} />
        <Toast text={st.toast} />
      </ShellChrome>
    );
  }

  return (
    <ShellChrome
      tab={tab}
      onTab={setTab}
      title="Repo Watch"
      sub="Repos as gates on a map — stage rail for Connect → Gate → Review → Brief; Run lives in a tray."
      railNote="C · Novel gate map"
      watchCount={watchEnabled}
      jobsCount={inflight}
      actions={
        <>
          <button type="button" className="rw-btn" onClick={openTray}>Open run tray</button>
          <button type="button" className="rw-btn" onClick={() => setTab("jobs")}>Open PR Jobs</button>
          <button type="button" className="rw-btn primary" disabled={!st.dirty} onClick={() => st.save("Gate map saved")}>
            Save gates
          </button>
        </>
      }
    >
      <div className="rw-stage-layout">
        <nav className="rw-stages" aria-label="Watch stages">
          {stages.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`rw-stage ${stage === s.id ? "active" : ""}`}
              onClick={() => {
                setStage(s.id);
                if (s.id === "review") setTrayOpen(true);
                if (s.id === "brief") setBriefOpen(true);
                if (s.id !== "review") setTrayOpen(false);
              }}
            >
              <span className="rw-stage-n">{s.n}</span>
              <span className="rw-stage-label">{s.label}</span>
            </button>
          ))}
          <div className="rw-stage-hint">
            Spend only happens when a gate is <em>enabled</em>. Install alone is free.
          </div>
        </nav>

        <div className="rw-stage-main">
          {stage === "connect" && (
            <div className="rw-panel">
              <div className="rw-panel-head"><h2>Connect</h2></div>
              <div className="rw-panel-body stack">
                <label className="rw-field">
                  Active connector
                  <select value={st.connector} onChange={(e) => st.setConnector(e.target.value)}>
                    {CONNECTORS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
                <div className="rw-callout info">
                  <strong>Installed ≠ watched ≠ spend</strong>
                  <div>GitHub App install stores receipts. Only Dashboard-watched + enabled repos enqueue AI.</div>
                </div>
                <KpiRow watched={st.watched} />
                <button type="button" className="rw-btn primary" onClick={() => setStage("gate")}>Continue to gates →</button>
              </div>
            </div>
          )}

          {(stage === "gate" || stage === "review" || stage === "brief") && (
            <>
              <div className="rw-map-head">
                <div>
                  <h2 className="rw-map-title">Watch set</h2>
                  <p className="rw-muted">Click a gate to edit policy. Rings show enablement · AI blocking.</p>
                </div>
                <div className="rw-inline">
                  <button type="button" className="rw-btn sm" onClick={() => setStage("connect")}>Connector</button>
                  <button type="button" className="rw-btn sm" onClick={() => { setBriefOpen(true); setStage("brief"); }}>Briefs</button>
                </div>
              </div>

              <div className="rw-gate-map">
                {st.watched.map((r) => (
                  <button
                    key={r.repo}
                    type="button"
                    className={`rw-gate-card ${r.repo === selected ? "selected" : ""} ${r.enabled ? "live" : "dormant"}`}
                    onClick={() => { setSelected(r.repo); setBriefOpen(false); }}
                  >
                    <div className={`rw-rings ${r.enabled ? "on" : ""} ${r.aiBlocking ? "block" : ""}`} aria-hidden="true">
                      <span></span><span></span>
                    </div>
                    <div className="rw-gate-body">
                      <div className="mono strong">{r.repo.split("/")[1]}</div>
                      <div className="rw-muted small">{r.repo.split("/")[0]} · {r.jobs24h} / 24h</div>
                      <div className="rw-gate-tags">
                        {r.checks.slice(0, 3).map((c) => <span key={c}>{c.replace("_review", "")}</span>)}
                      </div>
                    </div>
                    <div className="rw-gate-state">
                      {r.enabled ? <Pill tone="ok">gated</Pill> : <Pill>idle</Pill>}
                    </div>
                  </button>
                ))}
                <button type="button" className="rw-gate-card add" onClick={() => st.flash("Add repos sheet (mock)")}>
                  <span className="rw-plus">+</span>
                  <span>Add repo gate</span>
                </button>
              </div>

              {row && !briefOpen && (
                <div className="rw-gate-inspector">
                  <div className="rw-panel-head">
                    <h2 className="mono">{row.repo}</h2>
                    {st.dirty ? <Pill tone="warn">unsaved</Pill> : <Pill tone="ok">synced</Pill>}
                  </div>
                  <div className="rw-inspector-grid">
                    <div className="stack">
                      <PrefRow
                        label="Gate enabled"
                        hint="Master spend switch for this repo."
                        on={row.enabled}
                        effectOn="Webhooks create jobs."
                        effectOff="Audit receipts only."
                      >
                        <Switch label="Enabled" on={row.enabled} onChange={(v) => st.patchRepo(row.repo, { enabled: v })} />
                      </PrefRow>
                      <PrefRow
                        label="AI blocking"
                        on={row.aiBlocking}
                        effectOn="Merge check can fail."
                        effectOff="Advisory only."
                      >
                        <Switch
                          label="AI block"
                          on={row.aiBlocking}
                          disabled={!row.enabled}
                          onChange={(v) => st.patchRepo(row.repo, { aiBlocking: v })}
                        />
                      </PrefRow>
                      <PrefRow label="Min score">
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
                    </div>
                    <div>
                      <div className="rw-checks-title">Checks</div>
                      <div className="rw-checks compact">
                        {CHECK_OPTS.map((c) => (
                          <CheckRow
                            key={c.id}
                            id={`c-${row.repo}-${c.id}`}
                            label={c.label}
                            hint={c.hint}
                            checked={row.checks.includes(c.id)}
                            disabled={!row.enabled}
                            onChange={() => st.toggleCheck(row.repo, c.id)}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="rw-inspector-actions">
                      <button type="button" className="rw-btn primary" onClick={openTray}>Review open PRs</button>
                      <button type="button" className="rw-btn" onClick={() => { setBriefOpen(true); setStage("brief"); }}>Edit brief</button>
                      <div className="rw-muted small" style={{ marginTop: 8 }}>
                        CLI key {AI_STATUS.keySet ? "set" : "missing"} · {AI_STATUS.scope} · {AI_STATUS.model}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {briefOpen && (
                <div className="rw-gate-inspector">
                  <div className="rw-panel-head">
                    <h2>Brief · {row.repo}</h2>
                    <button type="button" className="rw-btn sm" onClick={() => setBriefOpen(false)}>Back to gate</button>
                  </div>
                  <div className="rw-panel-body stack">
                    <label className="rw-field">
                      Title
                      <input defaultValue={CONTEXTS_SEED.find((c) => c.repo === row.repo)?.title || ""} />
                    </label>
                    <textarea className="rw-textarea mono" rows={5} defaultValue={"## System\n## PR intent\n## Invariants\n"}></textarea>
                    <div className="rw-inline">
                      <button type="button" className="rw-btn primary" onClick={() => st.flash("Brief saved")}>Save brief</button>
                      <button type="button" className="rw-btn" onClick={() => st.flash("AI brief (mock)")}>Generate</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {trayOpen && (
        <div className="rw-tray" role="dialog" aria-label="Run OPA Review">
          <div className="rw-tray-head">
            <div>
              <strong>Run tray</strong>
              <span className="rw-muted"> · enqueue stack without leaving the map</span>
            </div>
            <button type="button" className="rw-btn sm" onClick={() => setTrayOpen(false)}>Close</button>
          </div>
          <div className="rw-tray-body">
            {st.watched.filter((w) => w.enabled).slice(0, 4).map((r) => (
              <div key={r.repo} className="rw-tray-repo">
                <div className="mono small strong">{r.repo}</div>
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
                        #{p.n}
                      </label>
                    );
                  })}
                  {!r.openPrs.length && <span className="rw-muted">—</span>}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="rw-btn primary"
              disabled={!Object.values(reviewPrs).some(Boolean)}
              onClick={() => st.flash("Stack from tray (mock)")}
            >
              Run stack
            </button>
          </div>
        </div>
      )}

      <Toast text={st.toast} />
    </ShellChrome>
  );
}

Object.assign(window, { VariantC });
