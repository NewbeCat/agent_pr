export const AGENTS = ["Claude Code", "Devin", "Copilot", "Codex", "Cursor"];
export const TASKS = ["feat", "fix", "refactor", "test", "maintenance", "docs", "other"];
export const STAGES = ["opened", "feedback", "revised"];
export const EXITS = ["approved", "maintainer", "stale"];
export const EXIT_LABEL = { approved: "approved", maintainer: "rejected · maintainer closed", stale: "rejected · abandoned/stale" };

export const emptyRule = () => ({ agents: [], tasks: [], minLines: null, noCommitH: null, noRespH: null });

export const state = {
  prs: [],
  meta: {},
  v1Mode: "rate", // rate or count
  v1Expanded: false,
  sel: null,
  exitPick: null, //click for v2
  rule: emptyRule(),
  saved: [], //rule saved corner
  v3Cols: "task", // task or agent
};

const subs = [];
export function subscribe(fn) { subs.push(fn); }
export function update(patch) {
  Object.assign(state, patch);
  subs.forEach(fn => fn(state));
}

export function rowFilter(row) {
  if (row === "all") return p => p.group === "agent";
  if (row === "human") return p => p.group === "human";
  return p => p.agent === row;
}

export function selectionPRs(sel) {
  if (!sel) return [];
  const f = rowFilter(sel.row);
  return state.prs.filter(p => f(p) && (!sel.task || p.task === sel.task));
}

export function selectionLabel(sel) {
  if (!sel) return "";
  const r = sel.row === "all" ? "All agents" : sel.row === "human" ? "Human" : sel.row;
  return `${r} × ${sel.task ?? "all tasks"}`;
}

//!!tooltip!!
const tip = () => document.getElementById("tip");
export function showTip(evt, html) {
  const t = tip();
  t.innerHTML = html;
  t.style.display = "block";
  const x = Math.min(evt.clientX + 12, window.innerWidth - t.offsetWidth - 8);
  t.style.left = x + "px";
  t.style.top = (evt.clientY + 12) + "px";
}
export function hideTip() { tip().style.display = "none"; }

export const pct = v => (isFinite(v) ? Math.round(v * 100) + "%" : "–");
