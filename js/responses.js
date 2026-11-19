import { emptyRule } from "./state.js";
import { judge } from "./rule.js";

//V1 selection
function segmentRule(sel) {
  const r = emptyRule();
  if (sel.row !== "all") r.agents = [sel.row];
  if (sel.task) r.tasks = [sel.task];
  return r;
}

const GRID = {
  opened: [...[24, 48, 168].map(h => ({ noRespH: h })), ...[200, 500, 1000, 2000].map(t => ({ minLines: t }))],
  feedback: [24, 48, 72, 168].map(h => ({ noCommitH: h })),
  revised: [200, 500, 1000, 2000].map(t => ({ minLines: t })),
};

function ruleTitle(who, c) {
  if (c.noRespH != null) return `Close ${who} PRs with no human response within ${c.noRespH} h`;
  if (c.noCommitH != null) return `Close ${who} PRs with no new commit within ${c.noCommitH} h after feedback`;
  return `Close ${who} PRs that change more than ${c.minLines} lines`;
}

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

export function recommend(prs, stage, sel, list) {
  const seg = segmentRule(sel);
  const tried = GRID[stage].map(c => {
    const rule = { ...seg, ...c };
    return { rule, cond: c, j: judge(prs, rule, list) };
  }).filter(t => t.j.n > 0);
  const byReach = (a, b) => b.j.hit - a.j.hit || (b.j.k / b.j.n) - (a.j.k / a.j.n);
  const pass = tried.filter(t => t.j.ok).sort(byReach);
  return { best: pass[0] ?? null, closest: pass.length ? null : tried.sort(byReach)[0] ?? null };
}

export function responsesFor(prs, stage, exit, sel, list) {
  if (exit === "approved" || sel.row === "human") return [];
  const who = sel.row === "all" ? "agent" : sel.row;
  const { best, closest } = recommend(prs, stage, sel, list);
  const out = [];
  if (best) out.push({ kind: "rec", title: ruleTitle(who, best.cond), j: best.j, rule: best.rule });
  else out.push({ kind: "none", title: "No rule passes the bar here: leave these to reviewers",
    j: closest?.j, rule: closest?.rule, closestTitle: closest && ruleTitle(who, closest.cond) });

  if (stage === "opened") out.push({ kind: "advice", title: "Say which agent PRs are welcome (CONTRIBUTING.md / AGENTS.md)",
    why: `These closed after a median of ${Math.round(median(list.map(p => p.closeH)))} h with no human comment: unwanted rather than unseen.` });
  else if (stage === "feedback") out.push({ kind: "advice", title: "Turn on the agent's review-comment iteration",
    why: "Most agents can be re-triggered by a review comment, so feedback can turn into a revision." });
  else out.push({ kind: "advice", title: "Ask for smaller, single-purpose agent PRs",
    why: `Revised and still rejected; median size ${median(list.map(p => p.lines))} lines.` });
  return out;
}
