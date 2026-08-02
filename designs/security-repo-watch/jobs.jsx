/* PR Jobs views — A faithful · B workspace · C novel swimlane */

function EvidenceBody({ job, onAction }) {
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
  return {
    jobs, selectedId, setSelectedId, selected, status, setStatus, repo, setRepo, q, setQ, counts, repos, filtered,
  };
}

/** A — Faithful: polished production stack + evidence drawer */
function JobsA({ onFlash }) {
  const st = useJobsState();
  const [drawer, setDrawer] = useState(true);

  return (
    <>
      <div className="rw-jobs-summary">
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
            className={`rw-sum-chip ${st.status === id ? "active" : ""}`}
            onClick={() => st.setStatus(st.status === id ? "all" : id)}
          >
            <StatusDot tone={tone} live={id === "inflight" && n > 0} />
            <span>{label}</span>
            <strong className="mono">{n}</strong>
          </button>
        ))}
        <span className="rw-muted small">· active first</span>
      </div>

      <div className="rw-jobs-filters">
        <label className="rw-field inline">
          Status
          <select value={st.status} onChange={(e) => st.setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="inflight">In flight</option>
            <option value="running">running</option>
            <option value="waiting">waiting</option>
            <option value="queued">queued</option>
            <option value="completed">completed</option>
            <option value="failed">failed</option>
            <option value="cancelled">cancelled</option>
            <option value="skipped">skipped</option>
          </select>
        </label>
        <label className="rw-field inline">
          Repo
          <select value={st.repo} onChange={(e) => st.setRepo(e.target.value)}>
            <option value="all">All repos</option>
            {st.repos.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="rw-field inline grow">
          Search
          <input value={st.q} onChange={(e) => st.setQ(e.target.value)} placeholder="Job, repo, PR…" />
        </label>
        <span className="rw-muted small">{st.filtered.length}/{st.jobs.length}</span>
        <button type="button" className="rw-btn sm" onClick={() => setDrawer((v) => !v)}>
          {drawer ? "Hide evidence" : "Show evidence"}
        </button>
      </div>

      <div className={`rw-jobs-a ${drawer ? "with-drawer" : ""}`}>
        <div className="rw-panel flush grow">
          <table className="rw-table">
            <thead>
              <tr>
                <th>Job / PR</th>
                <th>Status</th>
                <th>Result</th>
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              {st.filtered.map((j) => (
                <tr
                  key={j.id}
                  className={j.id === st.selected?.id ? "selected" : ""}
                  onClick={() => { st.setSelectedId(j.id); setDrawer(true); }}
                >
                  <td>
                    <div className="mono strong">{j.repo} <Pill>#{j.pr}</Pill></div>
                    <div className="rw-muted small">{j.title}</div>
                  </td>
                  <td><span className="rw-inline"><StatusDot tone={j.tone} live={["running", "waiting"].includes(j.status)} /><Pill tone={j.tone}>{j.status}</Pill></span></td>
                  <td>{j.result}</td>
                  <td className="mono small">{j.age}</td>
                </tr>
              ))}
              {!st.filtered.length && (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: 24 }} className="rw-muted">No jobs match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {drawer && (
          <div className="rw-panel inspector jobs-drawer">
            <div className="rw-panel-head">
              <h2>Evidence</h2>
              <button type="button" className="rw-btn sm" onClick={() => setDrawer(false)}>Close</button>
            </div>
            <div className="rw-panel-body" style={{ overflow: "auto", maxHeight: 520 }}>
              <EvidenceBody job={st.selected} onAction={(a) => onFlash?.(`${a} · ${st.selected?.id}`)} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/** B — Workspace: always-on master–detail + action strip */
function JobsB({ onFlash, onOpenWatch }) {
  const st = useJobsState();

  return (
    <>
      <div className="rw-kpi-row" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {[
          ["inflight", "In flight", "warn", st.counts.inflight, `${st.counts.running} run · ${st.counts.waiting} wait · ${st.counts.queued} queue`],
          ["completed", "Completed", "ok", st.counts.completed, "sample window"],
          ["failed", "Failed", "error", st.counts.failed, "timeouts & blocks"],
          ["cancelled", "Cancelled", "", st.counts.cancelled, "supersede / merge"],
          ["skipped", "Skipped", "info", st.counts.skipped, "not watched"],
        ].map(([id, label, tone, n, hint]) => (
          <button
            key={id}
            type="button"
            className={`rw-kpi clickable ${st.status === id ? "active" : ""}`}
            onClick={() => st.setStatus(st.status === id ? "all" : id)}
          >
            <span className="rw-kpi-label"><StatusDot tone={tone} live={id === "inflight" && n > 0} /> {label}</span>
            <span className={`rw-kpi-val ${tone}`}>{n}</span>
            <span className="rw-muted small">{hint}</span>
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
          <input value={st.q} onChange={(e) => st.setQ(e.target.value)} placeholder="job, repo, PR, author…" />
        </label>
        <span className="rw-muted small">{st.filtered.length}/{st.jobs.length}</span>
      </div>

      <div className="rw-split">
        <div className="rw-panel flush grow">
          <div className="rw-panel-head">
            <h2>Queue</h2>
            <span className="rw-muted">Newest first</span>
          </div>
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
          <div className="rw-panel-head">
            <h2>Evidence</h2>
            {st.selected?.result === "not watched" && (
              <button type="button" className="rw-btn sm" onClick={onOpenWatch}>Watch repo</button>
            )}
          </div>
          <div className="rw-panel-body" style={{ overflow: "auto", maxHeight: 480 }}>
            <EvidenceBody job={st.selected} onAction={(a) => onFlash?.(`${a} · mock`)} />
          </div>
        </div>
      </div>
    </>
  );
}

/** C — Novel: status swimlanes + story inspector */
function JobsC({ onFlash }) {
  const st = useJobsState();
  const lanes = [
    { id: "queued", label: "Queued", tone: "info" },
    { id: "running", label: "Running", tone: "warn" },
    { id: "waiting", label: "Waiting", tone: "warn" },
    { id: "completed", label: "Done", tone: "ok" },
    { id: "failed", label: "Failed", tone: "error" },
  ];

  const inLane = (laneId) => st.jobs.filter((j) => {
    if (laneId === "completed") return j.status === "completed" || j.status === "cancelled" || j.status === "skipped";
    return j.status === laneId;
  }).filter((j) => {
    if (st.repo !== "all" && j.repo !== st.repo) return false;
    if (st.q) {
      const hay = `${j.id} ${j.repo} #${j.pr} ${j.title}`.toLowerCase();
      if (!hay.includes(st.q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <>
      <div className="rw-jobs-filters">
        <label className="rw-field inline">
          Repo
          <select value={st.repo} onChange={(e) => st.setRepo(e.target.value)}>
            <option value="all">All repos</option>
            {st.repos.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="rw-field inline grow">
          Filter
          <input value={st.q} onChange={(e) => st.setQ(e.target.value)} placeholder="Focus the board…" />
        </label>
        <span className="rw-muted small">{st.counts.inflight} in flight</span>
      </div>

      <div className="rw-swim">
        {lanes.map((lane) => (
          <div key={lane.id} className="rw-lane">
            <div className="rw-lane-head">
              <StatusDot tone={lane.tone} live={["running", "waiting"].includes(lane.id)} />
              <strong>{lane.label}</strong>
              <span className="rw-count">{inLane(lane.id).length}</span>
            </div>
            <div className="rw-lane-body">
              {inLane(lane.id).map((j) => (
                <button
                  key={j.id}
                  type="button"
                  className={`rw-lane-card ${j.id === st.selected?.id ? "selected" : ""}`}
                  onClick={() => st.setSelectedId(j.id)}
                >
                  <div className="mono strong small">{j.repo.split("/")[1]} #{j.pr}</div>
                  <div className="rw-muted small" style={{ marginTop: 4 }}>{j.result}</div>
                  <div className="rw-child-pips" aria-hidden="true">
                    {(j.children || []).slice(0, 5).map((c) => (
                      <span key={c.step} className={`pip ${childTone(c.status)}`} title={`${c.step}: ${c.status}`}></span>
                    ))}
                  </div>
                  <div className="rw-muted small" style={{ marginTop: 6 }}>{j.age}</div>
                </button>
              ))}
              {!inLane(lane.id).length && <div className="rw-muted small" style={{ padding: 8 }}>Empty</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="rw-gate-inspector" style={{ marginTop: 4 }}>
        <div className="rw-panel-head">
          <h2>Story · {st.selected ? `${st.selected.repo}#${st.selected.pr}` : "—"}</h2>
          {st.selected && <Pill tone={st.selected.tone}>{st.selected.status}</Pill>}
        </div>
        <div className="rw-panel-body">
          <EvidenceBody job={st.selected} onAction={(a) => onFlash?.(`${a} from swimlane`)} />
        </div>
      </div>
    </>
  );
}

Object.assign(window, { JobsA, JobsB, JobsC, EvidenceBody });
