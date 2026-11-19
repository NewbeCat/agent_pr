import { state, update, AGENTS, presentAgents, TASKS, showTip, hideTip, pct, emptyRule } from "./state.js";
import { hasRule, effect, describe, sameRule, judge, blocks as closes, BAR } from "./rule.js";
const d3 = window.d3;

export function renderV3() {
  drawRuleBar();
  drawBars();
  drawScatter();
  drawPolicy();
}

function policySentence(r) {
  const who = r.agents.length ? `opened by ${r.agents.join(" or ")}` : "opened by coding agents";
  const task = r.tasks.length ? ` for ${r.tasks.join(" / ")} tasks` : "";
  const conds = [];
  if (r.minLines != null) conds.push(`change more than ${r.minLines} lines`);
  if (r.noCommitH != null) conds.push(`get no new commit within ${r.noCommitH} h after review feedback`);
  if (r.noRespH != null) conds.push(`receive no maintainer response within ${r.noRespH} h of opening`);
  const onlySegment = !conds.length;
  return `Pull requests ${who}${task}${onlySegment ? " are not accepted" : ` that ${conds.join(" and ")} are closed automatically`}.`;
}

function contributingSnippet(r, sentence) {
  const lines = ["## AI coding agents", "", sentence];
  if (r.noCommitH != null) lines.push("If you need more time to address feedback, reply on the PR before the deadline.");
  if (r.minLines != null) lines.push(`Please split larger changes into PRs of at most ${r.minLines} changed lines.`);
  if (!r.minLines && !r.noCommitH && !r.noRespH) lines.push("Human-authored PRs for these changes remain welcome.");
  return lines.join("\n");
}

function actionSnippet(r) {
  const h = r.noCommitH ?? r.noRespH;
  if (h == null) return null;
  const days = Math.max(1, Math.round(h / 24));
  return [
    "# .github/workflows/agent-pr-timeout.yml",
    "# Approximation: actions/stale counts ANY inactivity, not only missing commits.",
    "name: Agent PR timeout",
    "on:",
    "  schedule: [{ cron: \"0 */6 * * *\" }]",
    "permissions: { pull-requests: write }",
    "jobs:",
    "  timeout:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/stale@v9",
    "        with:",
    "          only-pr-labels: agent          # label agent PRs first (e.g. with actions/labeler)",
    "          days-before-issue-stale: -1",
    `          days-before-pr-stale: ${days}`,
    "          days-before-pr-close: 0",
    `          close-pr-message: "Closed automatically: no update within ${h} h. Reopen when you are ready."`,
  ].join("\n");
}

function drawPolicy() {
  const root = d3.select("#v3-policy").html("");
  const r = state.rule;
  if (!hasRule(r)) {
    root.append("div").attr("class", "label").text("Policy output appears here once a rule is set (from a V2 response or + add).");
    return;
  }
  const j = judge(state.prs, r), e = j.e, closed = j.n;
  const sentence = policySentence(r);

  const left = root.append("div");
  left.append("div").attr("class", "label").text("Policy (current rule)");
  left.append("div").attr("class", "policy").append("b").text(sentence);
  left.append("p").html(closed
    ? `Tested on ${e.n} past agent PRs: it would have closed <b>${closed}</b>. It
       <b style="color:#2f6b50">agrees</b> with the maintainers on ${e.blockedRejected} (rejected anyway) and
       <b style="color:var(--rejected)">overrules</b> them on ${e.blockedMerged} (merged).`
    : `Tested on ${e.n} past agent PRs: it would not have closed any PR.`);
  if (closed) left.append("p").html(j.ok
    ? `<b>Recommended:</b> closes ≥ ${BAR.minN} PRs, agrees more often than not (95% lower bound ${pct(j.lb)}), and beats closing every agent PR (${pct(j.base)} rejected anyway, p ${j.p < 0.001 ? "< 0.001" : "= " + j.p.toFixed(3)}).`
    : `<b>Not recommended:</b> it ${j.fails.join("; ")}.`);
  left.append("p").attr("class", "note").text("Retrospective what-if: assumes authors and agents would not have changed their behavior.");

  const hit = state.prs.filter(p => closes(p, r)).sort((a, b) => d3.ascending(a.outcome, b.outcome) || b.lines - a.lines);
  if (hit.length) {
    left.append("div").attr("class", "label").text("PRs it would have closed (overruled first)");
    const t = left.append("div").attr("id", "v3-closed").append("table");
    t.append("tr").html("<th>PR</th><th>agent</th><th>task</th><th>lines</th><th>outcome</th>");
    t.selectAll("tr.r").data(hit).join("tr").attr("class", "r").html(p =>
      `<td><a href="https://github.com/${p.repo}/pull/${p.pr}" target="_blank" rel="noopener">${p.repo.split("/")[1]}#${p.pr}</a></td>
       <td>${p.agent}</td><td>${p.task}</td><td>${p.lines}</td>
       <td style="color:${p.outcome === "merged" ? "var(--rejected)" : "#2f6b50"}">${p.outcome === "merged" ? "merged · overruled" : "rejected · agrees"}</td>`);
  }

  const right = root.append("div");
  const blocks = [["CONTRIBUTING.md", contributingSnippet(r, sentence)]];
  const yml = actionSnippet(r);
  if (yml) blocks.push(["GitHub Actions (sketch)", yml]);
  blocks.forEach(([name, text]) => {
    const head = right.append("div").attr("class", "row");
    head.append("span").attr("class", "label").text(name);
    head.append("button").text("Copy").on("click", function () {
      navigator.clipboard?.writeText(text).then(() => d3.select(this).text("Copied"), () => {});
    });
    right.append("pre").text(text);
  });
}

//!!!!rule bar
function drawRuleBar() {
  const root = d3.select("#v3-rule").html("");
  const r = state.rule;
  root.append("span").attr("class", "label").text("Rule (auto-close agent PRs if):");
  const chip = (text, onRemove, input) => {
    const c = root.append("span").attr("class", "chip");
    c.append("span").text(text);
    if (input) input(c);
    c.append("button").text("×").attr("title", "remove").on("click", onRemove);
  };
  const set = patch => update({ rule: { ...state.rule, ...patch } });

  r.agents.forEach(a => chip(`agent: ${a}`, () => set({ agents: r.agents.filter(x => x !== a) })));
  r.tasks.forEach(t => chip(`task: ${t}`, () => set({ tasks: r.tasks.filter(x => x !== t) })));
  const num = (key, before, after) => chip(before, () => set({ [key]: null }), c => {
    c.append("input").attr("type", "number").attr("min", 0).property("value", r[key])
      .on("change", e => set({ [key]: Math.max(0, +e.target.value || 0) }));
    c.append("span").text(after);
  });
  if (r.minLines != null) num("minLines", "lines changed >", "");
  if (r.noCommitH != null) num("noCommitH", "no new commit within", "h after feedback");
  if (r.noRespH != null) num("noRespH", "no human response within", "h after opening");
  if (!hasRule(r)) root.append("span").attr("class", "label").text("(no condition yet: only the before bars are shown)");
  root.append("button").text("+ add").on("click", e => openAdd(e.currentTarget));
  root.append("button").text("clear").property("disabled", !hasRule(r)).on("click", () => update({ rule: emptyRule() }));

  const already = state.saved.some(s => sameRule(s.rule, r));
  root.append("button").attr("class", "primary").property("disabled", !hasRule(r) || already)
    .text(already ? "Saved" : "Save rule").on("click", saveRule);

  root.append("span").style("margin-left", "auto").attr("class", "label").text("Columns:");
  ["task", "agent"].forEach(m => root.append("button").classed("on", state.v3Cols === m)
    .text(m === "task" ? "task types" : "agents").on("click", () => update({ v3Cols: m })));
}

function openAdd(anchor) {
  d3.selectAll(".popover").remove();
  const r = state.rule, box = anchor.getBoundingClientRect();
  const pop = d3.select("body").append("div").attr("class", "popover")
    .style("left", box.left + window.scrollX + "px").style("top", box.bottom + window.scrollY + 4 + "px");
  const add = patch => { pop.remove(); update({ rule: { ...state.rule, ...patch } }); };

  pop.append("b").text("Agent");
  const ag = pop.append("div").attr("class", "grid");
  AGENTS.filter(a => !r.agents.includes(a)).forEach(a => ag.append("button").text(a).on("click", () => add({ agents: [...r.agents, a] })));
  pop.append("b").text("Task type");
  const tk = pop.append("div").attr("class", "grid");
  TASKS.filter(t => !r.tasks.includes(t)).forEach(t => tk.append("button").text(t).on("click", () => add({ tasks: [...r.tasks, t] })));
  pop.append("b").text("Size / time");
  if (r.minLines == null) pop.append("label").append("button").text("lines changed > 500").on("click", () => add({ minLines: 500 }));
  if (r.noCommitH == null) pop.append("label").append("button").text("no new commit within 48 h after feedback").on("click", () => add({ noCommitH: 48 }));
  if (r.noRespH == null) pop.append("label").append("button").text("no human response within 48 h after opening").on("click", () => add({ noRespH: 48 }));
  pop.append("div").style("text-align", "right").append("button").text("close").on("click", () => pop.remove());
}

function saveRule() {
  const id = state.saved.length + 1;
  update({ saved: [...state.saved, { id, name: `R${id}`, rule: structuredClone(state.rule) }] });
}

//beforeafter bars
function drawBars() {
  const root = d3.select("#v3-bars").html("");
  const r = state.rule, on = hasRule(r);
  const agentPRs = state.prs.filter(p => p.group === "agent");
  const keys = state.v3Cols === "task" ? TASKS : presentAgents();
  const field = state.v3Cols === "task" ? "task" : "agent";
  const cols = [{ name: "All agent PRs", e: effect(agentPRs, r) },
    ...keys.map(k => ({ name: k === "maintenance" ? "maint." : k, e: effect(agentPRs.filter(p => p[field] === k), r) }))];
  const W = root.node().clientWidth, H = 250, L = 44, top = 64, bottom = 20;
  const cw = (W - L) / cols.length, bw = Math.min(28, cw * 0.3);
  const y = d3.scaleLinear().domain([0, 1]).range([H - bottom, top]);
  const svg = root.append("svg").attr("width", W).attr("height", H);

  const defs = svg.append("defs");
  [["hatchGood", "var(--merged)", "#e6f2ec"], ["hatchBad", "var(--rejected)", "#f7e0e6"]].forEach(([id, fg, bg]) => {
    const p = defs.append("pattern").attr("id", id).attr("patternUnits", "userSpaceOnUse").attr("width", 6).attr("height", 6)
      .attr("patternTransform", "rotate(45)");
    p.append("rect").attr("width", 6).attr("height", 6).attr("fill", bg);
    p.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 6).attr("stroke", fg).attr("stroke-width", 3);
  });

  svg.append("g").attr("transform", `translate(${L - 4},0)`)
    .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(".0%"))).call(g => g.select(".domain").remove());
  cols.forEach((c, i) => {
    const cx = L + i * cw + cw / 2, e = c.e, n = e.n || 1;
    const g = svg.append("g")
      .on("mousemove", ev => showTip(ev, `<b>${c.name}</b> (agent PRs: ${e.n})<br>
        agrees: ${e.blockedRejected} closed PRs were rejected anyway<br>
        overrules: ${e.blockedMerged} closed PRs were merged`))
      .on("mouseleave", hideTip);
    const seg = (x, a, b, fill) => b > a && g.append("rect").attr("x", x).attr("width", bw)
      .attr("y", y(b / n)).attr("height", y(a / n) - y(b / n)).attr("fill", fill);
    const bx = on ? cx - bw - 2 : cx - bw / 2;
    seg(bx, 0, e.merged, "var(--merged-light)");
    seg(bx, e.merged, e.n, "var(--rejected)");
    if (on) {
      const ax = cx + 2;
      const k1 = e.keptMerged, k2 = k1 + e.blockedRejected, k3 = k2 + e.blockedMerged;
      seg(ax, 0, k1, "var(--merged-light)");
      seg(ax, k1, k2, "url(#hatchGood)");
      seg(ax, k2, k3, "url(#hatchBad)");
      seg(ax, k3, e.n, "var(--rejected)");
      if (e.n) [[bx, e.merged], [ax, k2]].forEach(([xx, v]) => g.append("line")
        .attr("x1", xx - 2).attr("x2", xx + bw + 2).attr("y1", y(v / n)).attr("y2", y(v / n))
        .attr("stroke", "#222").attr("stroke-width", 2.5));
      const net = e.blockedRejected - e.blockedMerged;
      g.append("text").attr("x", cx).attr("y", top - 6).attr("text-anchor", "middle").attr("font-size", 10)
        .attr("fill", net > 0 ? "#2f6b50" : net < 0 ? "var(--rejected)" : "var(--muted)")
        .text(`${e.blockedRejected} agree · ${e.blockedMerged} overrule`);
      if (i === 0) {
        g.append("text").attr("x", bx + bw / 2).attr("y", H - 6).attr("text-anchor", "middle").attr("font-size", 9).attr("fill", "var(--muted)").text("before");
        g.append("text").attr("x", ax + bw / 2).attr("y", H - 6).attr("text-anchor", "middle").attr("font-size", 9).attr("fill", "var(--muted)").text("after");
      }
    }
    g.append("text").attr("x", cx).attr("y", top - 22).attr("text-anchor", "middle").attr("font-weight", 700).text(c.name);
    if (i === 0) svg.append("line").attr("x1", L + cw).attr("x2", L + cw).attr("y1", top - 30).attr("y2", H - bottom).attr("stroke", "#ccc");
  });

  //legend
  const lg = svg.append("g").attr("transform", `translate(${L},10)`);
  let lx = 0;
  [["var(--merged-light)", "merged"], ["url(#hatchGood)", "agrees: closed, was rejected"],
   ["url(#hatchBad)", "overrules: closed, was merged"], ["var(--rejected)", "rejected"]].forEach(([f, t]) => {
    lg.append("rect").attr("x", lx).attr("y", -9).attr("width", 12).attr("height", 10).attr("fill", f).attr("stroke", "#999").attr("stroke-width", .5);
    const tx = lg.append("text").attr("x", lx + 16).attr("y", 0).attr("font-size", 11).text(t);
    lx += 16 + tx.node().getComputedTextLength() + 24;
  });
  lg.append("line").attr("x1", lx).attr("x2", lx + 14).attr("y1", -4).attr("y2", -4).attr("stroke", "#222").attr("stroke-width", 2.5);
  lg.append("text").attr("x", lx + 18).attr("y", 0).attr("font-size", 11).text("green / red boundary");
}

//right scatter
function drawScatter() {
  const root = d3.select("#v3-scatter").html("");
  const W = 300, H = 250, m = { l: 44, r: 12, t: 22, b: 36 };
  const cur = hasRule(state.rule) ? effect(state.prs, state.rule) : null;
  const pts = state.saved.map(s => {
    const e = effect(state.prs, s.rule);
    return { ...s, cost: e.blockedMerged, benefit: e.blockedRejected, current: sameRule(s.rule, state.rule) };
  });
  if (cur && !pts.some(p => p.current)) pts.push({ name: "current", rule: state.rule, cost: cur.blockedMerged, benefit: cur.blockedRejected, current: true, unsaved: true });
  const max = Math.max(10, d3.max(pts, p => Math.max(p.cost, p.benefit)) || 0) * 1.1;
  const x = d3.scaleLinear().domain([0, max]).range([m.l, W - m.r]).nice();
  const y = d3.scaleLinear().domain([0, max]).range([H - m.b, m.t]).nice();
  const svg = root.append("svg").attr("width", W).attr("height", H);
  svg.append("text").attr("x", m.l).attr("y", 13).attr("font-weight", 700).text("Saved rules: overrule vs agree");
  svg.append("g").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5));
  svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5));
  svg.append("text").attr("x", (m.l + W - m.r) / 2).attr("y", H - 4).attr("text-anchor", "middle").attr("font-size", 10).text("overrules: merged PRs closed →");
  svg.append("text").attr("transform", `translate(11,${(H - m.b + m.t) / 2}) rotate(-90)`).attr("text-anchor", "middle").attr("font-size", 10).text("agrees: rejected PRs closed →");
  const d = Math.min(x.domain()[1], y.domain()[1]);
  svg.append("line").attr("x1", x(0)).attr("y1", y(0)).attr("x2", x(d)).attr("y2", y(d)).attr("stroke", "#aaa").attr("stroke-dasharray", "4,3");
  svg.append("text").attr("x", m.l + 6).attr("y", m.t + 12).attr("font-size", 10).attr("font-style", "italic").attr("fill", "var(--muted)").text("better ↖");

  if (!pts.length) {
    svg.append("text").attr("x", (m.l + W) / 2).attr("y", H / 2).attr("text-anchor", "middle").attr("fill", "var(--muted)").attr("font-size", 11).text("Save a rule to compare it here");
    return;
  }
  const g = svg.selectAll("g.pt").data(pts).join("g").attr("class", "pt").style("cursor", p => p.unsaved ? "default" : "pointer")
    .attr("transform", p => `translate(${x(p.cost)},${y(p.benefit)})`)
    .on("click", (e, p) => !p.unsaved && update({ rule: structuredClone(p.rule) }))
    .on("mousemove", (e, p) => showTip(e, `<b>${p.name}</b>: ${describe(p.rule)}<br>agrees ${p.benefit} · overrules ${p.cost}`))
    .on("mouseleave", hideTip);
  g.append("circle").attr("r", 7)
    .attr("fill", p => p.unsaved ? "#fff" : p.current ? "var(--select)" : "#7a8594")
    .attr("stroke", p => p.current ? "#000" : "#fff").attr("stroke-width", 1.5);
  g.append("text").attr("x", 10).attr("y", 4).attr("font-size", 11).attr("font-weight", p => p.current ? 700 : 400).text(p => p.name);
}
