import { emptyRule } from "./state.js";

const DEFAULT_N = 48;

//V1 selection
function segmentRule(sel) {
  const r = emptyRule();
  if (sel.row !== "all") r.agents = [sel.row];
  if (sel.task) r.tasks = [sel.task];
  return r;
}

const roundUp100 = v => Math.max(100, Math.ceil(v / 100) * 100);

export function responsesFor(stage, exit, sel, list) {
  if (exit === "approved" || sel.row === "human") return [];
  const seg = segmentRule(sel);
  const who = sel.row === "all" ? "agent" : sel.row;

  if (stage === "opened") return [
    { title: `Close ${who} PRs nobody responds to within ${DEFAULT_N} h`,
      why: "These PRs were never reviewed. The bottleneck is maintainer capacity, not the agent; a timeout keeps the queue short.",
      rule: { ...seg, noRespH: DEFAULT_N } },
    { title: "Auto-label unreviewed agent PRs for weekly triage",
      why: "Softer option: nothing is closed, the PRs are batched for one review session instead of interrupting maintainers.",
      rule: null },
  ];

  if (stage === "feedback") return [
    { title: `Close ${who} PRs with no new commit ${DEFAULT_N} h after feedback`,
      why: "Reviewers asked for changes and nothing came back. A timeout stops maintainers from waiting on PRs that will be abandoned.",
      rule: { ...seg, noCommitH: DEFAULT_N } },
    { title: "Turn on the agent's review-comment iteration",
      why: "Most coding agents can be re-triggered by review comments (e.g., an @-mention). If they respond, these PRs may not need closing at all.",
      rule: null },
  ];

  const sizes = list.map(p => p.lines).sort((a, b) => a - b);
  const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 500;
  const out = [
    { title: `Cap ${who} PRs at ${roundUp100(median)} changed lines`,
      why: `Half of these rejected PRs changed more than ${median} lines. Large agent PRs are harder to review and to fix through feedback.`,
      rule: { ...seg, minLines: roundUp100(median) } },
  ];
  if (sel.task) out.push({
    title: `Stop accepting ${who} PRs for ${sel.task}`,
    why: "Revision did not save these PRs. If this segment keeps failing, route this task type to people or to another agent instead.",
    rule: seg,
  });
  out.push({
    title: "Add task-scope guidance to AGENTS.md / CONTRIBUTING.md",
    why: "State which task types and sizes agent PRs are welcome for, so agents and their operators aim at what gets merged.",
    rule: null,
  });
  return out;
}
