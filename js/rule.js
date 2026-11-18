export function hasRule(r) {
  return r.agents.length > 0 || r.tasks.length > 0 || r.minLines != null || r.noCommitH != null || r.noRespH != null;
}

export function blocks(p, r) {
  if (p.group !== "agent" || !hasRule(r)) return false;
  if (r.agents.length && !r.agents.includes(p.agent)) return false;
  if (r.tasks.length && !r.tasks.includes(p.task)) return false;
  if (r.minLines != null && !(p.lines > r.minLines)) return false;
  if (r.noCommitH != null) {
    if (p.fbH == null) return false; //no feedback
    if (p.fbGapH != null && p.fbGapH <= r.noCommitH) return false; //yes author revised
    if (p.closeH <= p.fbH + r.noCommitH) return false; //dead
  }

  if (r.noRespH != null) {
    if (p.fbH != null && p.fbH <= r.noRespH) return false;
    if (p.closeH <= r.noRespH) return false;
  }
  return true;
}

//counts agent PRs under a rule
export function effect(prs, r) {
  const c = { n: 0, merged: 0, rejected: 0, keptMerged: 0, blockedMerged: 0, keptRejected: 0, blockedRejected: 0 };
  for (const p of prs) {
    if (p.group !== "agent") continue;
    c.n++;
    const b = blocks(p, r);
    if (p.outcome === "merged") { c.merged++; b ? c.blockedMerged++ : c.keptMerged++; }
    else { c.rejected++; b ? c.blockedRejected++ : c.keptRejected++; }
  }
  return c;
}

export function describe(r) {
  const parts = [];
  if (r.agents.length) parts.push(r.agents.join("/"));
  if (r.tasks.length) parts.push(r.tasks.join("/"));
  if (r.minLines != null) parts.push(`>${r.minLines} lines`);
  if (r.noCommitH != null) parts.push(`no commit ${r.noCommitH}h after feedback`);
  if (r.noRespH != null) parts.push(`no response ${r.noRespH}h`);
  return parts.join(" · ") || "(empty)";
}

export const sameRule = (a, b) => JSON.stringify(a) === JSON.stringify(b);
