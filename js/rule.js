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

export const BAR = { minN: 5, minAgree: 0.5, alpha: 0.05, minHit: 0.5 };

export function wilsonLow(k, n, z = 1.96) {
  if (!n) return 0;
  const ph = k / n, d = 1 + z * z / n;
  return (ph + z * z / (2 * n) - z * Math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n))) / d;
}

const lnFact = n => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
export function binomTail(k, n, p) {
  if (k <= 0) return 1;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const lnN = lnFact(n);
  let s = 0, lnI = lnFact(k - 1);
  for (let i = k; i <= n; i++) {
    lnI += Math.log(i);
    s += Math.exp(lnN - lnI - lnFact(n - i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return Math.min(1, s);
}

export function judge(prs, r, stall) {
  const e = effect(prs, r), n = e.blockedRejected + e.blockedMerged, k = e.blockedRejected;
  const base = e.n ? e.rejected / e.n : 0;
  const lb = wilsonLow(k, n), p = n ? binomTail(k, n, base) : 1;
  const hit = stall ? stall.filter(x => blocks(x, r)).length : null;
  const fails = [];
  if (n < BAR.minN) fails.push(`closes ${n} past PR${n === 1 ? "" : "s"} (needs ≥ ${BAR.minN})`);
  else {
    if (lb <= BAR.minAgree) fails.push(`agrees ${k}/${n}, not confidently more than half (95% lower bound ${Math.round(lb * 100)}%)`);
    if (p >= BAR.alpha) fails.push(`is no better than closing every agent PR (${Math.round(base * 100)}% are rejected anyway, p = ${p.toFixed(2)})`);
  }
  if (stall && hit < BAR.minHit * stall.length) fails.push(`catches ${hit} of ${stall.length} PRs here (needs most)`);
  return { e, n, k, base, lb, p, hit, fails, ok: !fails.length };
}
