/* Findings pillar — unified inbox + detail drawer */

const { useState, useMemo, useEffect } = React;

function FindingsScreen({ onPillar, onGotoScan, counts }) {
  const [type, setType] = useState("all");
  const [minSev, setMinSev] = useState("low");
  const [selectedId, setSelectedId] = useState(FINDINGS_SEED[0].id);
  const [toast, setToast] = useState("");
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2000); };

  const sevRank = { critical: 4, high: 3, medium: 2, low: 1 };
  const minRank = sevRank[minSev] || 1;

  const filtered = useMemo(() => {
    return FINDINGS_SEED.filter((f) => {
      if (type !== "all" && f.type !== type) return false;
      if ((sevRank[f.sev] || 0) < minRank) return false;
      return true;
    });
  }, [type, minSev]);

  const selected = filtered.find((f) => f.id === selectedId) || filtered[0] || null;
  const tc = findingCounts(FINDINGS_SEED);

  useEffect(() => {
    if (selected && !filtered.find((f) => f.id === selected.id) && filtered[0]) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selected]);

  return (
    <ShellChrome
      pillar="findings"
      onPillar={onPillar}
      counts={counts}
      railNote="Redesign · views · live menu chrome"
      actions={
        <>
          <label className="rw-field inline" style={{ margin: 0 }}>
            Min sev
            <select value={minSev} onChange={(e) => setMinSev(e.target.value)}>
              <option value="critical">critical</option>
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
            </select>
          </label>
          <button type="button" className="opa-btn primary" onClick={() => onGotoScan?.()}>
            Start scan
          </button>
        </>
      }
    >
      <div className="sv-type-chips" role="tablist" aria-label="Finding type">
        {TYPE_META.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={type === t.id}
            className={type === t.id ? "active" : ""}
            onClick={() => setType(t.id)}
          >
            {t.label} <strong className="mono">{tc[t.id] ?? tc.all}</strong>
          </button>
        ))}
      </div>

      <div className="rw-kpi-row">
        <div className="rw-kpi"><span className="rw-kpi-label">Open</span><span className="rw-kpi-val">{filtered.length}</span></div>
        <div className="rw-kpi"><span className="rw-kpi-label">Crit / High</span><span className="rw-kpi-val" style={{ color: "var(--error)" }}>{filtered.filter((f) => f.sev === "critical" || f.sev === "high").length}</span></div>
        <div className="rw-kpi"><span className="rw-kpi-label">Observed</span><span className="rw-kpi-val info">{FINDINGS_SEED.filter((f) => f.ctx === "observed").length}</span></div>
        <div className="rw-kpi"><span className="rw-kpi-label">Min sev</span><span className="rw-kpi-val" style={{ fontSize: 16 }}>{minSev}</span></div>
      </div>

      <div className="rw-split">
        <div className="rw-panel flush grow">
          <table className="rw-table">
            <thead>
              <tr>
                <th>Sev</th>
                <th>Type</th>
                <th>Target</th>
                <th>Finding</th>
                <th>Detector</th>
                <th>Ctx</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr
                  key={f.id}
                  className={selected?.id === f.id ? "selected" : ""}
                  onClick={() => setSelectedId(f.id)}
                >
                  <td><Pill tone={sevTone(f.sev)}>{f.sev}</Pill></td>
                  <td><Pill>{f.type}</Pill></td>
                  <td className="mono small">{f.target}</td>
                  <td>
                    <div className="strong">{f.finding}</div>
                    <div className="rw-muted small mono">{f.where}</div>
                  </td>
                  <td><Pill tone="info">{f.detector}</Pill></td>
                  <td className="mono small">{f.ctx}</td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 28 }} className="rw-muted">
                    No findings at this severity — start a scan or lower the filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rw-panel inspector" style={{ width: 340, flex: "0 0 340px" }}>
          <div className="rw-panel-head">
            <h2>Detail</h2>
            {selected?.ctx?.startsWith("srun") && (
              <button type="button" className="rw-btn sm" onClick={() => onGotoScan?.(selected.ctx)}>Open run</button>
            )}
          </div>
          <div className="rw-panel-body" style={{ overflow: "auto", maxHeight: 480 }}>
            {!selected ? (
              <div className="rw-muted">Select a finding.</div>
            ) : (
              <div className="sv-detail">
                <div className="rw-inline" style={{ marginBottom: 8 }}>
                  <Pill tone={sevTone(selected.sev)}>{selected.sev}</Pill>
                  <Pill>{selected.type}</Pill>
                  <span className="rw-muted small">{selected.detector}</span>
                </div>
                <div className="strong" style={{ fontSize: 14 }}>{selected.finding}</div>
                <div className="rw-muted small mono" style={{ marginTop: 4 }}>{selected.where}</div>
                <div className="rw-meta-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <div><span>Service</span><div className="mono small">{selected.service}</div></div>
                  <div><span>Context</span><div className="mono small">{selected.ctx}</div></div>
                </div>
                <div className="rw-callout">
                  <strong>Snippet</strong>
                  <div className="mono small">{selected.snippet}</div>
                </div>
                <div className="rw-inline" style={{ marginTop: 10 }}>
                  <button type="button" className="rw-btn sm" onClick={() => flash("Copied path")}>Copy path</button>
                  <button type="button" className="rw-btn sm" onClick={() => onPillar?.("scans")}>Scans</button>
                </div>
                <div className="rw-muted small" style={{ marginTop: 12 }}>
                  Honesty: detector badges stay (gitleaks vs lite, sast-lite, iac stub).
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <Toast text={toast} />
    </ShellChrome>
  );
}

Object.assign(window, { FindingsScreen });
