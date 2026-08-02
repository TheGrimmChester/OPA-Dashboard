/* Shared chrome — matches live OPA AppShell (SideRail + TopBar + opa-tabs) */

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

function jobCounts(jobs) {
  const c = { inflight: 0, running: 0, waiting: 0, queued: 0, completed: 0, failed: 0, cancelled: 0, skipped: 0 };
  jobs.forEach((j) => {
    if (c[j.status] != null) c[j.status] += 1;
    if (["running", "waiting", "queued"].includes(j.status)) c.inflight += 1;
  });
  return c;
}

function childTone(s) {
  if (s === "completed") return "ok";
  if (s === "failed" || s === "blocked" || s === "error") return "error";
  if (s === "running" || s === "waiting") return "warn";
  if (s === "queued" || s === "skipped") return "info";
  return "";
}

/** App-level rail — same groups/labels as SideRail.jsx (mock, no router). */
const APP_NAV = [
  {
    label: "Monitor",
    items: [
      { id: "services", label: "Services" },
      { id: "catalog", label: "Catalog" },
      { id: "traces", label: "Traces" },
      { id: "errors", label: "Errors" },
      { id: "logs", label: "Logs" },
    ],
  },
  {
    label: "Reliability",
    items: [
      { id: "alerts", label: "Alerts" },
      { id: "slos", label: "SLOs" },
      { id: "synthetics", label: "Synthetics" },
      { id: "security", label: "Security", active: true },
      { id: "diagnostics", label: "Diagnostics" },
    ],
  },
  {
    label: "Analyze",
    items: [
      { id: "sql", label: "SQL" },
      { id: "service-map", label: "Service map" },
      { id: "rum", label: "Browser" },
      { id: "performance", label: "Performance" },
    ],
  },
  {
    label: "Infra",
    items: [
      { id: "hosts", label: "Hosts" },
      { id: "cloud", label: "Cloud" },
      { id: "metrics", label: "Metrics" },
      { id: "dashboards", label: "Dashboards" },
    ],
  },
  {
    label: "Admin",
    items: [
      { id: "connectors", label: "Connectors" },
      { id: "automation", label: "Automation" },
      { id: "ai", label: "AI settings" },
    ],
  },
];

const SECURITY_TABS = [
  { id: "findings", label: "Findings" },
  { id: "scans", label: "Scans" },
  { id: "ops", label: "PR Ops" },
  { id: "control", label: "Control" },
];

/**
 * Live OPA chrome: SideRail + TopBar + page head + horizontal opa-tabs.
 * Pillar views render as children under the Security page tabs.
 */
function ShellChrome({
  pillar = "findings",
  onPillar,
  title,
  sub,
  actions,
  children,
  railNote,
}) {
  return (
    <div className="opa-shell rw-shell" data-screen-label={`Security · ${title || pillar}`}>
      <nav className="opa-rail" aria-label="App">
        <div className="opa-rail-brand">
          <span className="opa-rail-brand-mark" aria-hidden="true">◎</span>
          <span>Open Profiling</span>
        </div>
        <div className="opa-rail-nav">
          {APP_NAV.map((g) => (
            <div key={g.label}>
              <div className="opa-rail-group-label">{g.label}</div>
              {g.items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`opa-rail-item ${it.active || it.id === "security" ? "active" : ""}`}
                  title={it.label}
                >
                  <span className="opa-rail-item-dot" aria-hidden="true"></span>
                  <span className="opa-rail-item-label">{it.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="opa-rail-foot-note">{railNote || "Redesign mock · views only"}</div>
      </nav>

      <div className="opa-main">
        <header className="opa-topbar">
          <div className="opa-breadcrumb">
            <span className="crumb-current">Security</span>
          </div>
          <div className="opa-topbar-right">
            <div className="opa-seg">
              <button type="button" className="active">1h</button>
              <button type="button">6h</button>
              <button type="button">24h</button>
              <button type="button">7d</button>
            </div>
            <Pill tone="ok">acme-prod</Pill>
            <button type="button" className="opa-btn ghost sm">Refresh</button>
          </div>
        </header>

        <div className="opa-content">
          <div className="opa-page-head">
            <div>
              <h1 className="opa-page-title">Security</h1>
              <div className="opa-page-sub">
                CVE reachability · IAST · secrets · SAST · IaC · scan runs · Repo Watch · AppSec Gate · OPA Review
              </div>
            </div>
            <div className="opa-page-actions">{actions}</div>
          </div>

          <div className="opa-tabs" role="tablist" aria-label="Security">
            {SECURITY_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={pillar === t.id}
                className={`opa-tab ${pillar === t.id ? "active" : ""}`}
                onClick={() => onPillar?.(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="opa-stack sv-view">{children}</div>
        </div>
      </div>
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
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState("");
  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };
  const patch = (repo, next) => {
    setWatched((rows) => rows.map((r) => (r.repo === repo ? { ...r, ...next } : r)));
    setDirty(true);
  };
  const toggleCheck = (repo, id) => {
    setWatched((rows) =>
      rows.map((r) => {
        if (r.repo !== repo) return r;
        const has = r.checks.includes(id);
        return { ...r, checks: has ? r.checks.filter((c) => c !== id) : [...r.checks, id] };
      })
    );
    setDirty(true);
  };
  const save = (msg) => {
    setDirty(false);
    flash(msg || "Saved watch set");
  };
  return { watched, setWatched, connector, setConnector, dirty, toast, flash, patch, toggleCheck, save };
}

Object.assign(window, {
  Pill,
  Switch,
  PrefRow,
  CheckRow,
  StatusDot,
  ShellChrome,
  Toast,
  useWatchState,
  jobCounts,
  childTone,
  SECURITY_TABS,
  APP_NAV,
});
