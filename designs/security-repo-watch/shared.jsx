/* Shared chrome + controls for Watch + PR Jobs variants */

const { useState, useMemo, useEffect } = React;

function Pill({ tone, children }) {
  return <span className={`rw-pill ${tone || ""}`}>{children}</span>;
}

function Switch({ on, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      aria-label={label}
      disabled={disabled}
      className={`rw-switch ${on ? "on" : ""}`}
      onClick={() => !disabled && onChange?.(!on)}
    >
      <span className="rw-switch-knob"></span>
    </button>
  );
}

function PrefRow({ label, hint, on, effectOn, effectOff, children }) {
  const effect = on == null ? null : on ? effectOn : effectOff;
  return (
    <div className="rw-pref">
      <div className="rw-pref-copy">
        <div className="rw-pref-label">{label}</div>
        {hint ? <div className="rw-pref-hint">{hint}</div> : null}
        {effect ? (
          <div className="rw-pref-effect" role="status">
            <em>Now</em> {effect}
          </div>
        ) : null}
      </div>
      <div className="rw-pref-ctrl">
        {on != null ? <span className={`rw-pref-state ${on ? "on" : ""}`}>{on ? "On" : "Off"}</span> : null}
        {children}
      </div>
    </div>
  );
}

function CheckRow({ id, label, hint, checked, disabled, onChange }) {
  return (
    <label className={`rw-check ${checked ? "on" : ""} ${disabled ? "disabled" : ""}`} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span>
        <span className="rw-check-label">{label}</span>
        <span className="rw-check-hint">{hint}</span>
      </span>
    </label>
  );
}

function StatusDot({ tone, live }) {
  return <span className={`rw-dot ${tone || ""} ${live ? "live" : ""}`} aria-hidden="true"></span>;
}

function ShellChrome({
  tab = "watch",
  onTab,
  title,
  sub,
  actions,
  children,
  railNote,
  watchCount = 6,
  jobsCount = 3,
}) {
  const crumb = tab === "jobs" ? "PR Jobs" : "Repo Watch";
  return (
    <div className="rw-shell" data-screen-label={`${railNote || ""} · ${crumb}`}>
      <aside className="rw-rail">
        <div className="rw-rail-brand">
          <span className="rw-mark">OPA</span>
          <span>Security</span>
        </div>
        <div className="rw-rail-sec">SECURITY · SCM</div>
        <button
          type="button"
          className={`rw-rail-item ${tab === "watch" ? "active" : ""}`}
          onClick={() => onTab?.("watch")}
        >
          Repo Watch <span className="rw-count">{watchCount}</span>
        </button>
        <button
          type="button"
          className={`rw-rail-item ${tab === "jobs" ? "active" : ""}`}
          onClick={() => onTab?.("jobs")}
        >
          PR Jobs <span className="rw-count">{jobsCount}</span>
        </button>
        <button type="button" className="rw-rail-item">Agents</button>
        <button type="button" className="rw-rail-item">Webhooks</button>
        <div className="rw-rail-foot">{railNote || "Design mock · not live"}</div>
      </aside>
      <div className="rw-main">
        <header className="rw-top">
          <div className="rw-crumb">Security <span>/</span> {crumb}</div>
          <div className="rw-top-meta">
            <Pill tone="ok">acme-prod</Pill>
            <span className="rw-muted">auto-refresh 4s</span>
          </div>
        </header>
        <div className="rw-page">
          <div className="rw-page-head">
            <div>
              <h1>{title}</h1>
              <p>{sub}</p>
            </div>
            <div className="rw-page-actions">{actions}</div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function KpiRow({ watched }) {
  const enabled = watched.filter((w) => w.enabled).length;
  const disabled = watched.filter((w) => !w.enabled).length;
  const jobs = watched.reduce((s, w) => s + w.jobs24h, 0);
  const ai = watched.filter((w) => w.aiBlocking && w.enabled).length;
  return (
    <div className="rw-kpi-row">
      <div className="rw-kpi"><span className="rw-kpi-label">Watched & enabled</span><span className="rw-kpi-val ok">{enabled}</span></div>
      <div className="rw-kpi"><span className="rw-kpi-label">Disabled</span><span className="rw-kpi-val">{disabled}</span></div>
      <div className="rw-kpi"><span className="rw-kpi-label">Jobs 24h</span><span className="rw-kpi-val info">{jobs}</span></div>
      <div className="rw-kpi"><span className="rw-kpi-label">AI blocking on</span><span className="rw-kpi-val">{ai}</span></div>
    </div>
  );
}

function Toast({ text }) {
  if (!text) return null;
  return <div className="rw-toast">{text}</div>;
}

function useWatchState(seed) {
  const [watched, setWatched] = useState(() => seed.map((r) => ({ ...r, checks: [...r.checks] })));
  const [connector, setConnector] = useState(CONNECTORS[0].id);
  const [toast, setToast] = useState("");
  const [dirty, setDirty] = useState(false);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const patchRepo = (repo, patch) => {
    setWatched((rows) => rows.map((r) => (r.repo === repo ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const toggleCheck = (repo, checkId) => {
    setWatched((rows) =>
      rows.map((r) => {
        if (r.repo !== repo) return r;
        const has = r.checks.includes(checkId);
        return { ...r, checks: has ? r.checks.filter((c) => c !== checkId) : [...r.checks, checkId] };
      })
    );
    setDirty(true);
  };

  const save = (msg) => {
    setDirty(false);
    flash(msg || "Watch set saved");
  };

  return {
    watched, setWatched, connector, setConnector, toast, dirty, setDirty, flash, patchRepo, toggleCheck, save,
  };
}

function jobCounts(jobs) {
  const c = { inflight: 0, running: 0, waiting: 0, queued: 0, completed: 0, failed: 0, cancelled: 0, skipped: 0 };
  for (const j of jobs) {
    const s = j.status;
    if (s === "running" || s === "waiting" || s === "queued") c.inflight += 1;
    if (c[s] != null) c[s] += 1;
  }
  return c;
}

function childTone(status) {
  const s = String(status || "");
  if (s === "completed") return "ok";
  if (s === "failed" || s === "blocked" || s === "error") return "error";
  if (s === "running" || s === "waiting") return "warn";
  if (s === "queued") return "info";
  return "";
}

Object.assign(window, {
  Pill, Switch, PrefRow, CheckRow, StatusDot, ShellChrome, KpiRow, Toast, useWatchState, jobCounts, childTone,
});
