/* Control pillar — Agents · Policies · Gate · Inventory */

const { useState } = React;

function ControlScreen({ onPillar, counts, initialSection }) {
  const [section, setSection] = useState(initialSection || "agents");
  const [level, setLevel] = useState("repo");
  const [repo, setRepo] = useState("acme/checkout-api");
  const [minSev, setMinSev] = useState("high");
  const [prefs, setPrefs] = useState({
    trigger: "pr_open",
    autofix: "suggest",
    sev: "high",
    bugbot: true,
    cloud: false,
    blocking: true,
  });
  const [toast, setToast] = useState("");
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2000); };

  const sections = [
    { id: "agents", label: "Agents" },
    { id: "policies", label: "Policies" },
    { id: "gate", label: "Gate" },
    { id: "inventory", label: "Inventory" },
  ];

  return (
    <ShellChrome
      pillar="control"
      onPillar={onPillar}
      counts={counts}
      railNote="Redesign · views · live menu chrome"
      actions={
        section === "agents" ? (
          <button type="button" className="opa-btn primary" onClick={() => flash("Saved prefs (mock)")}>Save prefs</button>
        ) : null
      }
    >
      <div className="opa-tabs sv-subtabs" role="tablist" aria-label="Control sections">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            className={`opa-tab ${section === s.id ? "active" : ""}`}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="sv-section-main" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {section === "agents" && (
            <>
              <div className="rw-inline" style={{ marginBottom: 12 }}>
                <label className="rw-field inline">
                  Scope
                  <select value={level} onChange={(e) => setLevel(e.target.value)}>
                    <option value="org">Organization</option>
                    <option value="installation">Installation</option>
                    <option value="repo">Repository</option>
                  </select>
                </label>
                <label className="rw-field inline">
                  Repo
                  <select value={repo} onChange={(e) => setRepo(e.target.value)} disabled={level !== "repo"}>
                    {WATCHED_SEED.map((w) => <option key={w.repo} value={w.repo}>{w.repo}</option>)}
                  </select>
                </label>
                <Pill tone="info">inherit · override</Pill>
              </div>
              <div className="rw-grid-2">
                <div className="rw-panel">
                  <div className="rw-panel-head"><h2>Security agent</h2></div>
                  <div className="rw-panel-body">
                    <label className="rw-field">
                      Trigger
                      <select value={prefs.trigger} onChange={(e) => setPrefs((p) => ({ ...p, trigger: e.target.value }))}>
                        <option value="">Inherit</option>
                        <option value="every_push">Every push</option>
                        <option value="pr_open">PR open</option>
                        <option value="on_demand">On demand</option>
                      </select>
                    </label>
                    <label className="rw-field">
                      Min severity
                      <select value={prefs.sev} onChange={(e) => setPrefs((p) => ({ ...p, sev: e.target.value }))}>
                        <option value="">Inherit</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                    <label className="rw-field">
                      Autofix
                      <select value={prefs.autofix} onChange={(e) => setPrefs((p) => ({ ...p, autofix: e.target.value }))}>
                        <option value="">Inherit</option>
                        <option value="off">Off</option>
                        <option value="suggest">Suggest</option>
                        <option value="branch">Branch</option>
                      </select>
                    </label>
                  </div>
                </div>
                <div className="rw-panel">
                  <div className="rw-panel-head"><h2>Bugbot · Cloud</h2></div>
                  <div className="rw-panel-body">
                    <PrefRow label="Bugbot enabled" hint="AI review on watched PRs" on={prefs.bugbot} effectOn="Enqueue Bugbot" effectOff="Skip AI step">
                      <Switch on={prefs.bugbot} onChange={(v) => setPrefs((p) => ({ ...p, bugbot: v }))} label="Bugbot" />
                    </PrefRow>
                    <PrefRow label="AI blocking" hint="Fail check on AI findings" on={prefs.blocking} effectOn="Blocks merge" effectOff="Advisory">
                      <Switch on={prefs.blocking} onChange={(v) => setPrefs((p) => ({ ...p, blocking: v }))} label="Blocking" />
                    </PrefRow>
                    <PrefRow label="Cloud autofix" hint="Optional cloud agent" on={prefs.cloud} effectOn="May open fix PR" effectOff="Off">
                      <Switch on={prefs.cloud} onChange={(v) => setPrefs((p) => ({ ...p, cloud: v }))} label="Cloud" />
                    </PrefRow>
                  </div>
                </div>
              </div>
            </>
          )}

          {section === "policies" && (
            <div className="rw-panel">
              <div className="rw-panel-head"><h2>Policies</h2></div>
              <div className="rw-panel-body">
                <p className="rw-lead">Dashboard threshold is local. Agent env still owns ingest auth and IAST block.</p>
                <label className="rw-field" style={{ maxWidth: 280 }}>
                  Dashboard min severity
                  <select value={minSev} onChange={(e) => setMinSev(e.target.value)}>
                    <option value="critical">critical</option>
                    <option value="high">high</option>
                    <option value="medium">medium</option>
                    <option value="low">low</option>
                  </select>
                </label>
                <div className="rw-meta-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                  <div><span>Agent env</span><div className="mono small">OPA_SECURITY_MIN_SEVERITY</div></div>
                  <div><span>Ingest</span><div className="mono small">OPA_SECURITY_INGEST_TOKEN</div></div>
                  <div><span>PHP block</span><div className="mono small">opa.iast_block</div></div>
                </div>
                <div className="rw-callout info">
                  <strong>Effective</strong>
                  Findings inbox filters at <span className="mono">{minSev}</span>. Agent may still ingest lower severities.
                </div>
              </div>
            </div>
          )}

          {section === "gate" && (
            <div className="rw-panel">
              <div className="rw-panel-head"><h2>AppSec Gate</h2></div>
              <div className="rw-panel-body">
                <p className="rw-lead">
                  Prefer scoped checks with <span className="mono">security_run_id</span> from Repo Watch / Scans.
                </p>
                <div className="rw-callout">
                  <strong>CI snippet · scoped</strong>
                  <pre className="mono small" style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{`curl -X POST "$OPA/v1/security/pr-check" \\
  -H "X-OPA-Security-Token: $TOKEN" \\
  -d '{"security_run_id":"srun-8f2a1c"}'`}</pre>
                </div>
                <div className="rw-meta-grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 12 }}>
                  <div><span>OPA Review key</span><div>set</div></div>
                  <div><span>Webhook</span><div className="mono small">https://opa…/hooks/github</div></div>
                </div>
              </div>
            </div>
          )}

          {section === "inventory" && (
            <div className="rw-panel flush grow" style={{ minHeight: 360 }}>
              <div className="rw-panel-head"><h2>Service dependencies</h2></div>
              <table className="rw-table">
                <thead>
                  <tr><th>Service</th><th>Eco</th><th>Package</th><th>Version</th><th>Release</th></tr>
                </thead>
                <tbody>
                  {INVENTORY_SEED.map((r, i) => (
                    <tr key={i}>
                      <td>{r.service}</td>
                      <td><Pill>{r.eco}</Pill></td>
                      <td className="mono small">{r.pkg}</td>
                      <td className="mono small">{r.version}</td>
                      <td>{r.release}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
      <Toast text={toast} />
    </ShellChrome>
  );
}

Object.assign(window, { ControlScreen });
