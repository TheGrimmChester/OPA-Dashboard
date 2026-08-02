/* Control pillar — Agents · Policies · Gate · Inventory
   Agents: three layout variants (A cards · B jump stack · C master–detail) */

const { useState, useMemo, useEffect } = React;

function TriSelect({ value, onChange, options, ariaLabel }) {
  const v = value === null || value === undefined ? "" : String(value === true ? "true" : value === false ? "false" : value);
  return (
    <select
      className="ag-select"
      value={v}
      aria-label={ariaLabel}
      onChange={(e) => {
        const next = e.target.value;
        if (next === "") onChange(null);
        else if (next === "true") onChange(true);
        else if (next === "false") onChange(false);
        else onChange(next);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function boolOpts(field, effective, sources) {
  const src = sources[field] || "builtin";
  const eff = effective[field];
  const effLabel = typeof eff === "boolean" ? (eff ? "On" : "Off") : String(eff ?? "—");
  return [
    { value: "", label: `Inherit · ${effLabel} (${src})` },
    { value: "true", label: "On" },
    { value: "false", label: "Off" },
  ];
}

function stringOpts(base, field, effective, sources) {
  const src = sources[field] || "builtin";
  const eff = effective[field];
  return base.map((o) => (
    o.value === ""
      ? { ...o, label: `Inherit · ${eff ?? "—"} (${src})` }
      : o
  ));
}

function domainPulse(id, effective) {
  if (id === "bugbot") return { on: true, tone: "ok", detail: effective.trigger_mode || "pr_open" };
  if (id === "security") return { on: !!effective.security_auto_pr_reviews, tone: effective.security_auto_pr_reviews ? "ok" : "warn", detail: effective.inline_findings ? "inline" : "summary" };
  if (id === "approval") return { on: !!effective.auto_approve, tone: effective.auto_approve ? "warn" : "info", detail: effective.auto_approve ? "auto" : "manual" };
  if (id === "cloud") return { on: !!effective.cloud_enabled, tone: effective.cloud_enabled ? "warn" : "", detail: effective.autofix_mode || "off" };
  return { on: false, tone: "", detail: "" };
}

function AgentsScopeBar({ level, setLevel, connectorId, setConnectorId, repo, setRepo, dirty, onSave, onReset }) {
  return (
    <div className="ag-scope">
      <label className="ag-scope-field">
        <span>Scope</span>
        <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Preference scope">
          <option value="org">Global (all repos)</option>
          <option value="installation">Installation</option>
          <option value="repo">Repository</option>
        </select>
      </label>
      {(level === "installation" || level === "repo") && (
        <label className="ag-scope-field">
          <span>Installation</span>
          <select value={connectorId} onChange={(e) => setConnectorId(e.target.value)} aria-label="Installation">
            {CONNECTORS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
      )}
      {level === "repo" && (
        <label className="ag-scope-field grow">
          <span>Repository</span>
          <select value={repo} onChange={(e) => setRepo(e.target.value)} aria-label="Repository">
            {WATCHED_SEED.map((w) => <option key={w.repo} value={w.repo}>{w.repo}</option>)}
          </select>
        </label>
      )}
      <Pill tone="info">inherit · override</Pill>
      <div className="ag-scope-actions">
        {dirty ? <Pill tone="warn">unsaved</Pill> : null}
        <button type="button" className="opa-btn ghost sm" onClick={onReset} disabled={!dirty}>Reset</button>
        <button type="button" className="opa-btn primary sm" onClick={onSave} disabled={!dirty}>Save</button>
      </div>
    </div>
  );
}

function SandboxStrip({ effective }) {
  const hot = !!effective.cloud_enabled || !!effective.checkup_enabled || effective.autofix_mode === "branch";
  return (
    <div className={`ag-killstrip ${hot ? "hot" : ""}`} role="status">
      <strong>{hot ? "Sandbox required" : "Job sandbox"}</strong>
      <span>
        {hot
          ? "Cloud / checkup / branch autofix need OPA_JOB_SANDBOX=docker. Cap SANDBOX_REQUIRED is pinned for repo-code stages."
          : "Set OPA_JOB_SANDBOX=docker when enabling Cloud or checkup. Disable the run graph with OPA_AGENTS_RUN_GRAPH=0 (legacy path)."}
      </span>
    </div>
  );
}

function PrefBool({ label, hint, field, draft, setField, effective, sources, effectOn, effectOff }) {
  const stored = field in draft ? draft[field] : null;
  const on = stored === null || stored === undefined ? !!effective[field] : !!stored;
  return (
    <PrefRow
      label={label}
      hint={hint}
      on={on}
      effectOn={effectOn || null}
      effectOff={effectOff || null}
    >
      <TriSelect
        ariaLabel={label}
        value={stored}
        onChange={(v) => setField(field, v)}
        options={boolOpts(field, effective, sources)}
      />
    </PrefRow>
  );
}

function PrefString({ label, hint, field, draft, setField, effective, sources, options }) {
  const stored = field in draft ? draft[field] : null;
  return (
    <PrefRow label={label} hint={hint}>
      <TriSelect
        ariaLabel={label}
        value={stored}
        onChange={(v) => setField(field, v)}
        options={stringOpts(options, field, effective, sources)}
      />
    </PrefRow>
  );
}

function PrefNumber({ label, hint, field, draft, setField, effective }) {
  const stored = field in draft ? draft[field] : "";
  return (
    <PrefRow label={label} hint={hint}>
      <input
        className="ag-input"
        type="number"
        min={1}
        max={50}
        placeholder={String(effective[field] ?? 10)}
        value={stored === null || stored === undefined ? "" : stored}
        onChange={(e) => {
          const v = e.target.value;
          setField(field, v === "" ? null : Number(v));
        }}
      />
    </PrefRow>
  );
}

function PrefText({ label, hint, field, draft, setField, effective }) {
  const stored = field in draft ? draft[field] : "";
  return (
    <PrefRow label={label} hint={hint}>
      <input
        className="ag-input"
        type="text"
        placeholder={effective[field] || ""}
        value={stored === null || stored === undefined ? "" : stored}
        onChange={(e) => setField(field, e.target.value === "" ? null : e.target.value)}
      />
    </PrefRow>
  );
}

function DomainFields({ domainId, draft, setField, effective, sources }) {
  if (domainId === "bugbot") {
    return (
      <>
        <PrefString label="Trigger Mode" hint="When Bugbot starts relative to PR activity on watched repos." field="trigger_mode" draft={draft} setField={setField} effective={effective} sources={sources} options={TRIGGER_OPTS} />
        <PrefBool label="Review Draft PRs" hint="Include draft pull requests in automatic Bugbot runs." field="review_draft_prs" draft={draft} setField={setField} effective={effective} sources={sources} />
        <PrefBool label="PR Summaries" hint="Post a résumé comment summarizing findings and gate status." field="pr_summaries" draft={draft} setField={setField} effective={effective} sources={sources} />
        <PrefBool label="Post PR risk score" hint="Publish the numeric risk score on the check summary and résumé." field="post_pr_risk_score" draft={draft} setField={setField} effective={effective} sources={sources} />
        <PrefBool label="Incremental Review" hint="Re-review only files changed since the last successful Bugbot SHA." field="incremental_review" draft={draft} setField={setField} effective={effective} sources={sources} />
        <PrefBool label="Context-Aware Analysis" hint="Pull related symbols/files beyond the raw diff for higher-signal findings." field="context_aware_analysis" draft={draft} setField={setField} effective={effective} sources={sources} />
        <PrefBool label="AI Reviewer Aware" hint="Treat existing AI review comments as context to avoid duplicate noise." field="ai_reviewer_aware" draft={draft} setField={setField} effective={effective} sources={sources} />
        <PrefNumber label="Max review units" hint="Soft budget per Bugbot run (not a billing meter)." field="bugbot_max_units" draft={draft} setField={setField} effective={effective} />
      </>
    );
  }
  if (domainId === "security") {
    return (
      <>
        <PrefBool label="Automated PR Reviews" hint="Run the Security / AppSec gate child on watched PR events." field="security_auto_pr_reviews" draft={draft} setField={setField} effective={effective} sources={sources} />
        <PrefBool label="Inline Findings" hint="Post line comments on the real GitHub PR (off by default)." field="inline_findings" draft={draft} setField={setField} effective={effective} sources={sources} />
        <PrefBool label="Repository Rules — project" hint="Apply project-authored reviewer context / policy rules." field="repository_rules" draft={draft} setField={setField} effective={effective} sources={sources} />
        <PrefBool label="Repository Rules — automatic learned" hint="Allow auto-learned candidate rules (still need promote to activate)." field="learned_rules" draft={draft} setField={setField} effective={effective} sources={sources} />
      </>
    );
  }
  if (domainId === "approval") {
    return (
      <>
        <PrefBool label="Automated PR Approval" hint="Let the approval child auto-approve when score and policy allow." field="auto_approve" draft={draft} setField={setField} effective={effective} sources={sources} />
        <PrefBool label="Reviewer Routing" hint="Route to human reviewer groups from linked contexts when policy asks." field="reviewer_routing" draft={draft} setField={setField} effective={effective} sources={sources} />
        <PrefText label="Policy-Aware Decisions" hint="Path on the base ref for the approval policy document." field="policy_file_path" draft={draft} setField={setField} effective={effective} />
        <PrefRow label="Zero Workflow Changes" hint="Hard guard: never edit .github workflows; keep legacy check names.">
          <Pill tone="ok">Enforced</Pill>
        </PrefRow>
      </>
    );
  }
  return (
    <>
      <PrefBool label="Cloud enabled" hint="Builtin default is on — set Off to disable the Cloud child for this scope." field="cloud_enabled" draft={draft} setField={setField} effective={effective} sources={sources} />
      <PrefString label="Autofix Mode" hint="off = never · suggest = proposal only · branch = open a fix PR." field="autofix_mode" draft={draft} setField={setField} effective={effective} sources={sources} options={AUTOFIX_OPTS} />
      <PrefString label="Autofix Severity Threshold" hint="Minimum finding severity that may trigger autofix work." field="autofix_severity_threshold" draft={draft} setField={setField} effective={effective} sources={sources} options={SEV_OPTS} />
      <PrefBool label="Run tests before land" hint="Execute project tests in the docker sandbox before proposing a land." field="cloud_run_tests" draft={draft} setField={setField} effective={effective} sources={sources} />
      <PrefBool label="Checkup enabled" hint="Allow AI-planned repository health tests (separate from PR autofix)." field="checkup_enabled" draft={draft} setField={setField} effective={effective} sources={sources} />
    </>
  );
}

function CandidatesPanel({ candidates, onPromote, onReject, busy }) {
  return (
    <div className="rw-panel ag-candidates">
      <div className="rw-panel-head">
        <h2>Repository Rules — learned candidates</h2>
        <Pill tone="warn">{candidates.length}</Pill>
      </div>
      {candidates.length === 0 ? (
        <div className="rw-panel-body">
          <p className="rw-lead">No learned candidates yet — high/critical findings can propose rules when learned rules are on.</p>
        </div>
      ) : (
        <table className="rw-table">
          <thead>
            <tr><th>Title</th><th>Repo</th><th>Kind</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {candidates.map((r) => (
              <tr key={r.id}>
                <td className="strong">{r.title}</td>
                <td className="mono small">{r.repo_full_name}</td>
                <td><Pill>{r.kind}</Pill></td>
                <td><Pill tone="warn">{r.status}</Pill></td>
                <td>
                  <div className="ag-row-actions">
                    <button type="button" className="opa-btn primary sm" disabled={!!busy} onClick={() => onPromote(r.id)}>Promote</button>
                    <button type="button" className="opa-btn ghost sm" disabled={!!busy} onClick={() => onReject(r.id)}>Reject</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EffectiveDrawer({ open, onToggle, effective, sources }) {
  const rows = useMemo(() => Object.keys(effective).sort().map((field) => ({
    field,
    value: effective[field],
    source: sources[field] || "builtin",
  })), [effective, sources]);

  return (
    <div className="ag-effective">
      <button type="button" className="opa-btn ghost sm" onClick={onToggle}>
        {open ? "Hide" : "Show"} effective prefs
      </button>
      {open ? (
        <div className="rw-panel" style={{ marginTop: 8 }}>
          <div className="rw-panel-body" style={{ padding: 0 }}>
            <p className="rw-lead" style={{ padding: "10px 12px 0" }}>
              Resolved values and where each field came from — useful when Bugbot skips a draft PR.
            </p>
            <table className="rw-table">
              <thead>
                <tr><th>Field</th><th>Effective</th><th>Source</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.field}>
                    <td className="mono small">{r.field}</td>
                    <td className="mono small">
                      {typeof r.value === "boolean" ? (r.value ? "On" : "Off") : String(r.value ?? "—")}
                    </td>
                    <td><Pill>{r.source}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* —— Variant A: capability strip + 2×2 cards —— */
function AgentsLayoutA(props) {
  const { draft, setField, effective, sources, candidates, onPromote, onReject, busy, showEffective, setShowEffective } = props;
  return (
    <div className="ag-layout ag-a" data-screen-label="Agents · A cards">
      <div className="ag-cap-strip" aria-label="Agent capabilities">
        {AGENT_DOMAINS.map((d) => {
          const pulse = domainPulse(d.id, effective);
          return (
            <div key={d.id} className={`ag-cap-chip ${pulse.on ? "on" : ""}`}>
              <StatusDot tone={pulse.tone} />
              <div>
                <strong>{d.label}</strong>
                <span className="mono small">{pulse.detail}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="ag-card-grid">
        {AGENT_DOMAINS.map((d) => (
          <section key={d.id} className="ag-card" id={`ag-a-${d.id}`}>
            <header>
              <h3>{d.label}</h3>
              <Pill tone={domainPulse(d.id, effective).on ? "ok" : ""}>
                {domainPulse(d.id, effective).on ? "active" : "quiet"}
              </Pill>
            </header>
            <p className="ag-card-blurb">{d.blurb}</p>
            <div className="ag-card-body">
              <DomainFields domainId={d.id} draft={draft} setField={setField} effective={effective} sources={sources} />
            </div>
          </section>
        ))}
      </div>

      <CandidatesPanel candidates={candidates} onPromote={onPromote} onReject={onReject} busy={busy} />
      <EffectiveDrawer open={showEffective} onToggle={() => setShowEffective((v) => !v)} effective={effective} sources={sources} />
    </div>
  );
}

/* —— Variant B: jump nav + stacked sections —— */
function AgentsLayoutB(props) {
  const { draft, setField, effective, sources, candidates, onPromote, onReject, busy, showEffective, setShowEffective, jump, setJump } = props;

  useEffect(() => {
    const el = document.getElementById(`ag-b-${jump}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [jump]);

  return (
    <div className="ag-layout ag-b" data-screen-label="Agents · B jump">
      <nav className="ag-jump" aria-label="Agent domains">
        {AGENT_DOMAINS.map((d) => {
          const pulse = domainPulse(d.id, effective);
          return (
            <button
              key={d.id}
              type="button"
              className={jump === d.id ? "active" : ""}
              onClick={() => setJump(d.id)}
            >
              <StatusDot tone={pulse.tone} />
              {d.label}
            </button>
          );
        })}
        <button type="button" className={jump === "rules" ? "active" : ""} onClick={() => setJump("rules")}>
          Rules
        </button>
      </nav>

      <div className="ag-stack-scroll">
        {AGENT_DOMAINS.map((d) => (
          <section key={d.id} className="rw-panel ag-stack-section" id={`ag-b-${d.id}`}>
            <div className="rw-panel-head">
              <h2>{d.label}</h2>
              <Pill tone={domainPulse(d.id, effective).on ? "ok" : "info"}>{domainPulse(d.id, effective).detail}</Pill>
            </div>
            <div className="rw-panel-body">
              <p className="rw-lead">{d.blurb}</p>
              <DomainFields domainId={d.id} draft={draft} setField={setField} effective={effective} sources={sources} />
            </div>
          </section>
        ))}
        <div id="ag-b-rules">
          <CandidatesPanel candidates={candidates} onPromote={onPromote} onReject={onReject} busy={busy} />
        </div>
        <EffectiveDrawer open={showEffective} onToggle={() => setShowEffective((v) => !v)} effective={effective} sources={sources} />
      </div>
    </div>
  );
}

/* —— Variant C: master–detail —— */
function AgentsLayoutC(props) {
  const {
    draft, setField, effective, sources, candidates, onPromote, onReject, busy,
    showEffective, setShowEffective, domain, setDomain,
  } = props;
  const active = AGENT_DOMAINS.find((d) => d.id === domain) || AGENT_DOMAINS[0];
  const pulse = domainPulse(active.id, effective);

  return (
    <div className="ag-layout ag-c" data-screen-label="Agents · C detail">
      <aside className="ag-domain-rail" aria-label="Domains">
        {AGENT_DOMAINS.map((d) => {
          const p = domainPulse(d.id, effective);
          const overrides = d.fields.filter((f) => f in draft && draft[f] !== null && draft[f] !== undefined).length;
          return (
            <button
              key={d.id}
              type="button"
              className={`ag-domain-item ${domain === d.id ? "active" : ""}`}
              onClick={() => setDomain(d.id)}
            >
              <div className="ag-domain-item-top">
                <StatusDot tone={p.tone} />
                <strong>{d.label}</strong>
              </div>
              <div className="ag-domain-item-meta">
                <span className="mono small">{p.detail}</span>
                {overrides > 0 ? <Pill tone="warn">{overrides} ov</Pill> : <span className="muted small">inherit</span>}
              </div>
            </button>
          );
        })}
      </aside>

      <div className="ag-detail">
        <div className="rw-panel grow" style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="rw-panel-head">
            <div>
              <h2>{active.label}</h2>
              <p className="ag-detail-blurb">{active.blurb}</p>
            </div>
            <Pill tone={pulse.on ? "ok" : "info"}>{pulse.on ? "active" : "quiet"} · {pulse.detail}</Pill>
          </div>
          <div className="rw-panel-body ag-detail-body">
            <DomainFields domainId={active.id} draft={draft} setField={setField} effective={effective} sources={sources} />
          </div>
        </div>
        <CandidatesPanel candidates={candidates} onPromote={onPromote} onReject={onReject} busy={busy} />
        <EffectiveDrawer open={showEffective} onToggle={() => setShowEffective((v) => !v)} effective={effective} sources={sources} />
      </div>
    </div>
  );
}

function AgentsWorkbench({ variant, onVariant, flash }) {
  const [level, setLevel] = useState("org");
  const [connectorId, setConnectorId] = useState(CONNECTORS[0].id);
  const [repo, setRepo] = useState("acme/checkout-api");
  const [draft, setDraft] = useState({});
  const [candidates, setCandidates] = useState(() => RULE_CANDIDATES.map((c) => ({ ...c })));
  const [busy, setBusy] = useState("");
  const [showEffective, setShowEffective] = useState(false);
  const [jump, setJump] = useState("bugbot");
  const [domain, setDomain] = useState("bugbot");

  const effective = AGENT_EFFECTIVE;
  const sources = AGENT_SOURCES;
  const dirty = Object.keys(draft).length > 0;

  const setField = (field, value) => {
    setDraft((prev) => {
      const next = { ...prev };
      if (value === null || value === undefined) delete next[field];
      else next[field] = value;
      return next;
    });
  };

  const onSave = () => {
    flash("Agent preferences saved (mock)");
    setDraft({});
  };
  const onReset = () => setDraft({});

  const onPromote = (id) => {
    setBusy(`${id}:promote`);
    setTimeout(() => {
      setCandidates((rows) => rows.filter((r) => r.id !== id));
      setBusy("");
      flash("Rule promoted");
    }, 280);
  };
  const onReject = (id) => {
    setBusy(`${id}:reject`);
    setTimeout(() => {
      setCandidates((rows) => rows.filter((r) => r.id !== id));
      setBusy("");
      flash("Candidate rejected");
    }, 280);
  };

  const shared = {
    draft, setField, effective, sources, candidates, onPromote, onReject, busy,
    showEffective, setShowEffective, jump, setJump, domain, setDomain,
  };

  return (
    <div className="ag-workbench">
      <div className="ag-variant-bar">
        {onVariant ? (
          <>
            <span className="ag-variant-label">Layout</span>
            {[
              { id: "a", label: "A · Cards" },
              { id: "b", label: "B · Jump" },
              { id: "c", label: "C · Detail" },
            ].map((v) => (
              <button
                key={v.id}
                type="button"
                className={variant === v.id ? "active" : ""}
                onClick={() => onVariant(v.id)}
              >
                {v.label}
              </button>
            ))}
          </>
        ) : (
          <span className="ag-variant-label">Layout {String(variant || "a").toUpperCase()}</span>
        )}
        {!effective.review_draft_prs ? (
          <span className="ag-draft-note muted">
            Review Draft PRs is Off — Bugbot skips draft PRs (security still runs).
          </span>
        ) : null}
      </div>

      <SandboxStrip effective={effective} />
      <AgentsScopeBar
        level={level}
        setLevel={setLevel}
        connectorId={connectorId}
        setConnectorId={setConnectorId}
        repo={repo}
        setRepo={setRepo}
        dirty={dirty}
        onSave={onSave}
        onReset={onReset}
      />

      {variant === "b" ? (
        <AgentsLayoutB {...shared} />
      ) : variant === "c" ? (
        <AgentsLayoutC {...shared} />
      ) : (
        <AgentsLayoutA {...shared} />
      )}
    </div>
  );
}

function ControlScreen({ onPillar, counts, initialSection, initialVariant, onSection, onVariant, forcedVariant }) {
  const [section, setSection] = useState(initialSection || "agents");
  const [variant, setVariant] = useState(initialVariant || forcedVariant || "a");
  const [minSev, setMinSev] = useState("high");
  const [toast, setToast] = useState("");
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2000); };

  useEffect(() => {
    if (initialSection) setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (forcedVariant) setVariant(forcedVariant);
    else if (initialVariant) setVariant(initialVariant);
  }, [forcedVariant, initialVariant]);

  const goSection = (id) => {
    setSection(id);
    onSection?.(id);
  };

  const goVariant = (id) => {
    setVariant(id);
    onVariant?.(id);
  };

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
      railNote="Redesign · Agents A/B/C · live menu chrome"
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
            onClick={() => goSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="sv-section-main" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {section === "agents" && (
          <AgentsWorkbench
            variant={forcedVariant || variant}
            onVariant={forcedVariant ? undefined : goVariant}
            flash={flash}
          />
        )}

        {section === "policies" && (
          <div className="rw-panel" style={{ overflow: "auto" }}>
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
          <div className="rw-panel" style={{ overflow: "auto" }}>
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
          <div className="rw-panel flush grow" style={{ minHeight: 360, overflow: "auto" }}>
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

Object.assign(window, { ControlScreen, AgentsWorkbench });
