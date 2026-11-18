import { state, update, STAGES, EXITS, EXIT_LABEL, selectionPRs, selectionLabel, showTip, hideTip, pct } from "./state.js";
const d3 = window.d3;

const EXIT_COLOR = { approved: "var(--approved)", maintainer: "var(--maintainer)", stale: "var(--stale)" };
const BAR_EXITS = ["maintainer", "stale"];
const FLOW_LABEL = { approved: "approved", maintainer: "rejected · closed by other", stale: "rejected · withdrawn" };

function stageStats(ps) {
  return STAGES.map((s, i) => {
    const reach = ps.filter(p => STAGES.indexOf(p.stage) >= i);
    const leave = ps.filter(p => p.stage === s);
    const exits = Object.fromEntries(EXITS.map(x => [x, leave.filter(p => p.exit === x).length]));
    return { stage: s, reach: reach.length, exits };
  });
}

export function renderV2() {
  const root = d3.select("#v2-flow").html("");
  const sel = state.sel;
  if (!sel) {
    d3.select("#v2-sel").text("");
    root.append("div").attr("class", "empty").text("Click a cell or a row label in V1 to see how those PRs moved through review.");
    return;
  }
  const ps = selectionPRs(sel);
  const rej = ps.filter(p => p.outcome === "rejected").length;
  d3.select("#v2-sel").text(`${selectionLabel(sel)} · n=${ps.length} · ${rej} rejected`);
  if (!ps.length) { root.append("div").attr("class", "empty").text("No PRs in this selection."); return; }
  //
  const isHuman = sel.row === "human";
  const ref = isHuman ? null : state.prs.filter(p => p.group === "human" && (!sel.task || p.task === sel.task));
  const S = stageStats(ps), R = ref ? stageStats(ref) : null;
  const W = root.node().clientWidth, top = 34, spineH = 110;
  const colW = (W - 20) / 3, x = i => 20 + i * colW;
  const k = spineH / ps.length;
  const leafTop = top + spineH + 40, leafGap = 30, exitH = 3 * leafGap - 12;
  const barTop = leafTop + 3 * leafGap + 50, barH = 70;
  const H = barTop + (isHuman ? 0 : barH + 40);
  const svg = root.append("svg").attr("width", W).attr("height", H);
  //
  const band = (x0, y0a, y0b, x1, y1a, y1b) => {
    const xs = d3.range(0, 1.0001, 1 / 30).map(t => [x0 + (x1 - x0) * t, (1 - Math.cos(Math.PI * t)) / 2]);
    const top = xs.map(([xx, s]) => [xx, y0a + (y1a - y0a) * s]);
    const bot = xs.map(([xx, s]) => [xx, y0b + (y1b - y0b) * s]).reverse();
    return "M" + top.concat(bot).map(p => p.join(",")).join("L") + "Z";
  };

  S.forEach((st, i) => {
    const sx = x(i), nodeW = 12;
    //stage node
    svg.append("rect").attr("x", sx).attr("y", top).attr("width", nodeW).attr("height", Math.max(st.reach * k, 1)).attr("fill", "#4a5568");
    svg.append("text").attr("x", sx).attr("y", top - 18).attr("font-weight", 700).attr("font-size", 13)
      .text(`${st.stage[0].toUpperCase() + st.stage.slice(1)} (${st.reach})`);
    svg.append("text").attr("x", sx).attr("y", top - 5).attr("fill", "var(--muted)").attr("font-size", 10).text("reached this stage");
    //band to next stage
    const next = S[i + 1];
    if (next && next.reach) svg.append("path").attr("d", band(sx + nodeW, top, top + next.reach * k, x(i + 1), top, top + next.reach * k))
      .attr("fill", "#c9ced4").attr("opacity", .7);
    //exit
    let yOut = top + (next ? next.reach : 0) * k, yBar = leafTop;
    const leaving = EXITS.reduce((a, ex) => a + st.exits[ex], 0);
    svg.append("rect").attr("x", sx + 40).attr("y", leafTop).attr("width", 8).attr("height", exitH).attr("fill", "none").attr("stroke", "#ccc");
    EXITS.forEach((ex, j) => {
      const n = st.exits[ex], h = n * k, bh = leaving ? exitH * n / leaving : 0, ly = leafTop + j * leafGap;
      const pick = state.exitPick && state.exitPick.stage === st.stage && state.exitPick.exit === ex;
      const g = svg.append("g").style("cursor", n ? "pointer" : "default")
        .on("mousemove", e => showTip(e, exitTip(st, ex, R && R[i])))
        .on("mouseleave", hideTip)
        .on("click", () => n && update({ exitPick: { stage: st.stage, exit: ex } }));
      if (n) {
        g.append("path").attr("d", band(sx + nodeW, yOut, yOut + h, sx + 40, yBar, yBar + bh))
          .attr("fill", EXIT_COLOR[ex]).attr("opacity", .55);
        g.append("rect").attr("x", sx + 40).attr("y", yBar).attr("width", 8).attr("height", bh).attr("fill", EXIT_COLOR[ex])
          .attr("stroke", pick ? "var(--select)" : "none").attr("stroke-width", 3);
      }
      g.append("rect").attr("x", sx + 56).attr("y", ly).attr("width", 9).attr("height", 9).attr("fill", n ? EXIT_COLOR[ex] : "#fff").attr("stroke", n ? "none" : "#bbb");
      g.append("text").attr("x", sx + 70).attr("y", ly + 9).attr("font-size", 11).attr("font-weight", pick ? 700 : 400)
        .attr("fill", n ? "var(--ink)" : "var(--muted)")
        .text(`${FLOW_LABEL[ex]}: ${n} (${pct(n / st.reach)})`);
      yOut += h;
      yBar += bh;
    });

    //bottom bars
    if (!isHuman) {
      const bx = sx + 20, bw = 22, ys = d3.scaleLinear().domain([0, 0.5]).range([0, barH]).clamp(true);
      const base = barTop + barH;
      svg.append("line").attr("x1", bx - 6).attr("x2", bx + BAR_EXITS.length * 70).attr("y1", base).attr("y2", base).attr("stroke", "#333");
      BAR_EXITS.forEach((ex, j) => {
        const a = st.reach ? st.exits[ex] / st.reach : 0, h = R[i].reach ? R[i].exits[ex] / R[i].reach : 0;
        const gx = bx + j * 70;
        [[a, "var(--agent)", "sel"], [h, "var(--human)", "Human"]].forEach(([v, c, who], m) => {
          svg.append("rect").attr("x", gx + m * (bw + 2)).attr("y", base - ys(v)).attr("width", bw).attr("height", ys(v)).attr("fill", c)
            .on("mousemove", e => showTip(e, `<b>${stageName(st.stage)} · ${EXIT_LABEL[ex]}</b><br>${who === "sel" ? selectionLabel(state.sel) : "Human × " + (state.sel.task ?? "all tasks")}: ${pct(v)}`))
            .on("mouseleave", hideTip);
          svg.append("text").attr("x", gx + m * (bw + 2) + bw / 2).attr("y", base - ys(v) - 3).attr("text-anchor", "middle").attr("font-size", 10).text(pct(v));
        });
        svg.append("text").attr("x", gx + bw).attr("y", base + 13).attr("text-anchor", "middle").attr("font-size", 10)
          .text(ex === "maintainer" ? "closed by other" : "withdrawn");
      });
    }
  });

  if (!isHuman) {
    const lg = svg.append("g").attr("transform", `translate(20,${barTop - 30})`);
    lg.append("text").attr("font-weight", 700).text("Rejection exits vs Human (% of PRs that reached the stage)");
    [["var(--agent)", selectionLabel(sel)], ["var(--human)", `Human × ${sel.task ?? "all tasks"}`]].forEach(([c, t], j) => {
      lg.append("rect").attr("x", j * 200).attr("y", 7).attr("width", 10).attr("height", 10).attr("fill", c);
      lg.append("text").attr("x", 14 + j * 200).attr("y", 16).attr("font-size", 11).text(t);
    });
  }
  if (state.meta.exitSource && state.meta.exitSource.startsWith("heuristic"))
    svg.append("text").attr("x", W - 4).attr("y", H - 4).attr("text-anchor", "end").attr("font-size", 9).attr("fill", "var(--muted)")
      .text(`exit type: ${state.meta.exitSource}`);

}

const stageName = s => s[0].toUpperCase() + s.slice(1);
function exitTip(st, ex, ref) {
  const a = `${st.exits[ex]} of ${st.reach} (${pct(st.exits[ex] / st.reach)})`;
  const h = ref ? `<br>Human: ${ref.exits[ex]} of ${ref.reach} (${pct(ref.exits[ex] / ref.reach)})` : "";
  return `<b>${stageName(st.stage)} → ${EXIT_LABEL[ex]}</b><br>${a}${h}<br><i>click to see responses and PRs below</i>`;
}
