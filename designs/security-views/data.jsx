/* Findings / Scans / Control mock data — SCM seeds live in scm-data.jsx */

const FINDINGS_SEED = [
  { id: "f1", sev: "critical", type: "secret", target: "acme/checkout-api", finding: "AWS_ACCESS_KEY_ID", where: ".env:12", detector: "gitleaks", ctx: "srun-8f2a", snippet: "AWS_ACCESS_KEY_ID=AKIA••••", service: "checkout-api" },
  { id: "f2", sev: "high", type: "cve", target: "payments-api", finding: "CVE-2024-1234", where: "lodash@4.17.20", detector: "reachability", ctx: "observed", snippet: "Observed on /checkout path · 14d", service: "payments-api" },
  { id: "f3", sev: "high", type: "sast", target: "acme/opa-agent", finding: "sqli-concat", where: "db.php:88", detector: "sast-lite", ctx: "srun-8f2a", snippet: "mysqli_query($sql . $id)", service: "opa-agent" },
  { id: "f4", sev: "medium", type: "iast", target: "php-shop", finding: "sql sink", where: "POST /checkout", detector: "runtime", ctx: "blocked", snippet: "taint → mysqli · blocked=1", service: "php-shop" },
  { id: "f5", sev: "medium", type: "iac", target: "infra/k8s", finding: "privileged:true", where: "deploy.yaml", detector: "iac-lite", ctx: "srun-1c90", snippet: "securityContext.privileged", service: "infra" },
  { id: "f6", sev: "low", type: "sast", target: "edge-gateway", finding: "hardcoded-timeout", where: "cfg.ts:40", detector: "sast-lite", ctx: "srun-1c90", snippet: "timeoutMs = 5000", service: "edge" },
  { id: "f7", sev: "high", type: "secret", target: "acme/billing-worker", finding: "GH_TOKEN", where: "ci.yml:22", detector: "gitleaks", ctx: "srun-8f2a", snippet: "echo $GH_TOKEN", service: "billing" },
  { id: "f8", sev: "medium", type: "cve", target: "checkout-api", finding: "CVE-2023-8911", where: "express@4.18.1", detector: "reachability", ctx: "not observed", snippet: "No prod path hit yet", service: "checkout-api" },
  { id: "f9", sev: "low", type: "iac", target: "infra/tf", finding: "sg-open-22", where: "sg.tf:40", detector: "iac-lite", ctx: "srun-1c90", snippet: "cidr_blocks = [\"0.0.0.0/0\"]", service: "infra" },
  { id: "f10", sev: "medium", type: "iast", target: "php-shop", finding: "command sink", where: "GET /export", detector: "runtime", ctx: "open", snippet: "shell_exec · not blocked", service: "php-shop" },
];

const TYPE_META = [
  { id: "all", label: "All" },
  { id: "cve", label: "CVE" },
  { id: "iast", label: "IAST" },
  { id: "secret", label: "Secrets" },
  { id: "sast", label: "SAST" },
  { id: "iac", label: "IaC" },
];

const SCANNER_OPTS = [
  { id: "secrets", label: "Secrets", mode: "gitleaks|lite" },
  { id: "sast", label: "SAST", mode: "lite" },
  { id: "iac", label: "IaC", mode: "lite" },
  { id: "container", label: "Container", mode: "stub" },
];

const RUNS_SEED = [
  {
    id: "srun-8f2a1c",
    service: "checkout-api",
    profile: "full",
    status: "completed",
    age: "12m",
    steps: [
      { scanner: "secrets", status: "completed", detail: "gitleaks · 3 findings" },
      { scanner: "sast", status: "completed", detail: "lite · 2 findings" },
      { scanner: "iac", status: "completed", detail: "stub · 1 finding" },
      { scanner: "container", status: "skipped", detail: "no image set" },
    ],
    honesty: "Secrets via gitleaks; SAST/IaC lite/stub. IAST is runtime-only.",
  },
  {
    id: "srun-1c90de",
    service: "infra",
    profile: "iac",
    status: "completed",
    age: "2h",
    steps: [
      { scanner: "iac", status: "completed", detail: "stub · 4 findings" },
      { scanner: "secrets", status: "completed", detail: "lite · 0 findings" },
    ],
    honesty: "Profile iac — secrets still run when present in tree.",
  },
  {
    id: "srun-44be90",
    service: "opa-agent",
    profile: "php",
    status: "error",
    age: "1d",
    steps: [
      { scanner: "secrets", status: "completed", detail: "gitleaks · 0" },
      { scanner: "sast", status: "failed", detail: "timeout 120s" },
    ],
    honesty: "SAST lite timed out on large tree.",
  },
];

const WEBHOOKS_SEED = [
  { when: "9m", event: "pull_request.synchronize", repo: "acme/checkout-api", outcome: "enqueued", job: "scmjob-8f2a1c", sig: "ok" },
  { when: "14m", event: "pull_request.synchronize", repo: "acme/checkout-api", outcome: "supersede", job: "scmjob-44be90", sig: "ok" },
  { when: "1d", event: "pull_request.opened", repo: "acme/docs-site", outcome: "skipped · not watched", job: "scmjob-skip01", sig: "ok" },
  { when: "2d", event: "installation", repo: "—", outcome: "ignored", job: "—", sig: "ok" },
];

const INVENTORY_SEED = [
  { service: "checkout-api", eco: "npm", pkg: "lodash", version: "4.17.20", release: "prod" },
  { service: "checkout-api", eco: "npm", pkg: "express", version: "4.18.1", release: "prod" },
  { service: "php-shop", eco: "composer", pkg: "symfony/http-foundation", version: "5.4.21", release: "prod" },
  { service: "opa-agent", eco: "npm", pkg: "axios", version: "1.6.2", release: "staging" },
  { service: "infra", eco: "go", pkg: "aws-sdk-go", version: "1.44.0", release: "prod" },
];

/** Effective agent prefs + provenance (mirrors /api/agents/prefs). */
const AGENT_EFFECTIVE = {
  trigger_mode: "pr_open",
  review_draft_prs: false,
  pr_summaries: true,
  post_pr_risk_score: true,
  incremental_review: true,
  context_aware_analysis: true,
  ai_reviewer_aware: true,
  bugbot_max_units: 10,
  security_auto_pr_reviews: true,
  inline_findings: false,
  repository_rules: true,
  learned_rules: true,
  auto_approve: false,
  reviewer_routing: true,
  policy_file_path: ".opa/approval-policy.json",
  cloud_enabled: false,
  autofix_mode: "suggest",
  autofix_severity_threshold: "high",
  cloud_run_tests: true,
  checkup_enabled: false,
};

const AGENT_SOURCES = {
  trigger_mode: "org",
  review_draft_prs: "builtin",
  pr_summaries: "installation",
  post_pr_risk_score: "org",
  incremental_review: "org",
  context_aware_analysis: "org",
  ai_reviewer_aware: "builtin",
  bugbot_max_units: "builtin",
  security_auto_pr_reviews: "org",
  inline_findings: "builtin",
  repository_rules: "repo",
  learned_rules: "repo",
  auto_approve: "org",
  reviewer_routing: "installation",
  policy_file_path: "builtin",
  cloud_enabled: "builtin",
  autofix_mode: "org",
  autofix_severity_threshold: "org",
  cloud_run_tests: "org",
  checkup_enabled: "builtin",
};

const RULE_CANDIDATES = [
  { id: "ctx-91", title: "Require secrets scan on .env* diffs", repo_full_name: "acme/checkout-api", kind: "should", status: "candidate" },
  { id: "ctx-92", title: "Route auth/* to security-reviewers", repo_full_name: "acme/opa-agent", kind: "must", status: "candidate" },
  { id: "ctx-93", title: "Skip AI on docs-only PRs", repo_full_name: "acme/docs-site", kind: "should", status: "candidate" },
];

const AGENT_DOMAINS = [
  {
    id: "bugbot",
    label: "Bugbot",
    blurb: "AI code review on pull requests — findings, summaries, and incremental re-review.",
    fields: ["trigger_mode", "review_draft_prs", "pr_summaries", "post_pr_risk_score", "incremental_review", "context_aware_analysis", "ai_reviewer_aware", "bugbot_max_units"],
  },
  {
    id: "security",
    label: "Security",
    blurb: "Secrets, SAST-lite, and gate checks — separate from Bugbot so scanners always run.",
    fields: ["security_auto_pr_reviews", "inline_findings", "repository_rules", "learned_rules"],
  },
  {
    id: "approval",
    label: "Approval",
    blurb: "Deterministic approve / comment from the shared findings ledger — never from model confidence alone.",
    fields: ["auto_approve", "reviewer_routing", "policy_file_path"],
  },
  {
    id: "cloud",
    label: "Cloud",
    blurb: "Autofix proposals and optional fix branches — gated patch, never trusts the agent working tree.",
    fields: ["cloud_enabled", "autofix_mode", "autofix_severity_threshold", "cloud_run_tests", "checkup_enabled"],
  },
];

const TRIGGER_OPTS = [
  { value: "", label: "Inherit" },
  { value: "every_push", label: "Every push" },
  { value: "pr_open", label: "PR open" },
  { value: "on_demand", label: "On demand" },
  { value: "cron", label: "Cron" },
];
const AUTOFIX_OPTS = [
  { value: "", label: "Inherit" },
  { value: "off", label: "Off" },
  { value: "suggest", label: "Suggest" },
  { value: "branch", label: "Branch" },
];
const SEV_OPTS = [
  { value: "", label: "Inherit" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function sevTone(sev) {
  if (sev === "critical" || sev === "high") return "error";
  if (sev === "medium") return "warn";
  return "";
}

function findingCounts(rows) {
  const out = { all: rows.length, cve: 0, iast: 0, secret: 0, sast: 0, iac: 0 };
  rows.forEach((r) => { if (out[r.type] != null) out[r.type] += 1; });
  return out;
}

Object.assign(window, {
  FINDINGS_SEED,
  TYPE_META,
  SCANNER_OPTS,
  RUNS_SEED,
  WEBHOOKS_SEED,
  INVENTORY_SEED,
  AGENT_EFFECTIVE,
  AGENT_SOURCES,
  RULE_CANDIDATES,
  AGENT_DOMAINS,
  TRIGGER_OPTS,
  AUTOFIX_OPTS,
  SEV_OPTS,
  sevTone,
  findingCounts,
});
