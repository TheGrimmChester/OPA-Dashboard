/* Scans pillar — start form + run timeline */

const { useState } = React;

function ScansScreen({ onPillar, counts, initialRunId }) {
  const [form, setForm] = useState({
    service: "checkout-api",
    profile: "full",
    path: "",
    image: "",
    scanners: ["secrets", "sast"],
  });
  const [runs, setRuns] = useState(RUNS_SEED);
  const [activeId, setActiveId] = useState(initialRunId || RUNS_SEED[0].id);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  const active = runs.find((r) => r.id === activeId) || runs[0];

  const toggleScanner = (id) => {
    setForm((f) => ({
      ...f,
      scanners: f.scanners.includes(id) ? f.scanners.filter((x) => x !== id) : [...f.scanners, id],
    }));
  };

  const startScan = () => {
    setBusy(true);
    const id = `srun-${Math.random().toString(16).slice(2, 8)}`;
    const next = {
      id,
      service: form.service,
      profile: form.profile,
      status: "running",
      age: "now",
      steps: (form.scanners.length ? form.scanners : ["secrets"]).map((s) => ({
        scanner: s,
        status: "queued",
        detail: "starting…",
      })),
      honesty: "Mock run — not wired to Agent.",
    };
    setTimeout(() => {
      setRuns((r) => [{
        ...next,
        status: "completed",
        age: "just now",
        steps: next.steps.map((st) => ({
          ...st,
          status: st.scanner === "container" && !form.image ? "skipped" : "completed",
          detail: st.scanner === "container" && !form.image ? "no image set" : "mock · 0–2 findings",
        })),
      }, ...r]);
      setActiveId(id);
      setBusy(false);
      flash(`Started ${id}`);
    }, 700);
  };

  return (
    <ShellChrome
      pillar="scans"
      onPillar={onPillar}
      counts={counts}
      railNote="Redesign · views · live menu chrome"
      actions={
        <button type="button" className="opa-btn primary" disabled={busy} onClick={startScan}>
          {busy ? "Starting…" : "Start scan"}
        </button>
      }
    >
      <div className="rw-split" style={{ flex: "0 0 auto", maxHeight: 280 }}>
        <div className="rw-panel grow">
          <div className="rw-panel-head"><h2>Start security scan</h2></div>
          <div className="rw-panel-body">
            <p className="rw-lead">
              Workspace <span className="mono">/workspace</span>. IAST is runtime-only and cannot be started here.
            </p>
            <div className="rw-grid-2">
              <label className="rw-field">
                Service
                <select value={form.service} onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))}>
                  <option>checkout-api</option>
                  <option>opa-agent</option>
                  <option>infra</option>
                  <option>workspace-scan</option>
                </select>
              </label>
              <label className="rw-field">
                Profile
                <select value={form.profile} onChange={(e) => setForm((f) => ({ ...f, profile: e.target.value }))}>
                  <option value="auto">auto</option>
                  <option value="php">php</option>
                  <option value="node">node</option>
                  <option value="iac">iac</option>
                  <option value="full">full</option>
                </select>
              </label>
              <label className="rw-field">
                Path
                <input className="mono" value={form.path} placeholder="(default root)" onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))} />
              </label>
              <label className="rw-field">
                Image (container stub)
                <input className="mono" value={form.image} placeholder="app:latest" onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))} />
              </label>
            </div>
            <div className="rw-checks compact" style={{ marginTop: 4 }}>
              {SCANNER_OPTS.map((s) => (
                <CheckRow
                  key={s.id}
                  id={`sc-${s.id}`}
                  label={`${s.label} · ${s.mode}`}
                  hint=""
                  checked={form.scanners.includes(s.id)}
                  onChange={() => toggleScanner(s.id)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="rw-panel" style={{ width: 420, flex: "0 0 420px" }}>
          <div className="rw-panel-head">
            <h2>Active · <span className="mono">{active?.id}</span></h2>
            <Pill tone={active?.status === "completed" ? "ok" : active?.status === "error" ? "error" : "warn"}>
              {active?.status}
            </Pill>
          </div>
          <div className="rw-panel-body">
            <div className="rw-child-list">
              {(active?.steps || []).map((st) => (
                <div key={st.scanner} className="rw-child-row" style={{ gridTemplateColumns: "12px 80px auto 1fr" }}>
                  <StatusDot tone={childTone(st.status)} live={st.status === "running"} />
                  <span className="strong">{st.scanner}</span>
                  <Pill tone={childTone(st.status)}>{st.status}</Pill>
                  <span className="rw-muted small">{st.detail}</span>
                </div>
              ))}
            </div>
            <div className="rw-inline" style={{ marginTop: 12 }}>
              <button type="button" className="rw-btn sm" onClick={() => onPillar?.("findings")}>View findings →</button>
              <button type="button" className="rw-btn sm" onClick={() => flash("Cleared active")}>Clear</button>
            </div>
            <div className="rw-callout" style={{ marginTop: 10 }}>
              <strong>Honesty</strong>
              <div>{active?.honesty}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rw-kpi-row" style={{ flex: "0 0 auto" }}>
        <div className="rw-kpi"><span className="rw-kpi-label">Runs</span><span className="rw-kpi-val">{runs.length}</span></div>
        <div className="rw-kpi"><span className="rw-kpi-label">Active</span><span className="rw-kpi-val" style={{ fontSize: 14 }}>{active?.status || "—"}</span></div>
        <div className="rw-kpi"><span className="rw-kpi-label">Secrets (run)</span><span className="rw-kpi-val">3</span></div>
        <div className="rw-kpi"><span className="rw-kpi-label">SAST + IaC</span><span className="rw-kpi-val">3</span></div>
      </div>

      <div className="rw-panel flush grow">
        <div className="rw-panel-head"><h2>Past runs</h2></div>
        <div style={{ overflow: "auto", flex: 1 }}>
          <table className="rw-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Service</th>
                <th>Profile</th>
                <th>Status</th>
                <th>Steps</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr
                  key={r.id}
                  className={r.id === activeId ? "selected" : ""}
                  onClick={() => setActiveId(r.id)}
                >
                  <td className="mono small strong">{r.id}</td>
                  <td>{r.service}</td>
                  <td><Pill>{r.profile}</Pill></td>
                  <td><Pill tone={r.status === "completed" ? "ok" : r.status === "error" ? "error" : "warn"}>{r.status}</Pill></td>
                  <td className="rw-muted small">{r.steps.map((s) => s.scanner).join(" · ")}</td>
                  <td className="mono small">{r.age}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Toast text={toast} />
    </ShellChrome>
  );
}

Object.assign(window, { ScansScreen });
