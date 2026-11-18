import { state, update, AGENTS, TASKS, rowFilter, showTip, hideTip, pct } from "./state.js";
const d3 = window.d3;

const SMALL_N = 5; //too small so make it non-cell

export function renderV1() {
  drawBars();
  drawHeat();
  document.querySelectorAll("#v1 .toggle").forEach(b => b.classList.toggle("on", b.dataset.mode === state.v1Mode));
}

function drawBars() {
  const root = d3.select("#v1-bars").html("");
  const W = root.node().clientWidth, H = 70, L = 60, R = 150;
  const groups = ["agent", "human"].map(g => {
    const ps = state.prs.filter(p => p.group === g);
    const rej = ps.filter(p => p.outcome === "rejected").length;
    return { g, n: ps.length, rej };
  });
  const x = d3.scaleLinear().domain([0, d3.max(groups, d => d.n)]).range([0, W - L - R]);
  const svg = root.append("svg").attr("width", W).attr("height", H);
  const row = svg.selectAll("g").data(groups).join("g").attr("transform", (d, i) => `translate(${L},${8 + i * 30})`);
  row.append("text").attr("x", -8).attr("y", 13).attr("text-anchor", "end").attr("font-weight", 600)
    .text(d => d.g === "agent" ? "Agent" : "Human");
  row.append("rect").attr("width", d => x(d.rej)).attr("height", 22).attr("fill", "var(--rejected)");
  row.append("rect").attr("x", d => x(d.rej)).attr("width", d => x(d.n - d.rej)).attr("height", 22).attr("fill", "var(--merged-light)");
  row.append("text").attr("x", 6).attr("y", 15).attr("fill", "#fff").attr("font-weight", 600).text(d => d.rej);
  row.append("text").attr("x", d => x(d.n) + 6).attr("y", 15).attr("fill", "var(--muted)")
    .text(d => `n=${d.n} · ${pct(d.rej / d.n)} rejected`);
  row.on("mousemove", (e, d) => showTip(e, `<b>${d.g}</b><br>rejected ${d.rej} · merged ${d.n - d.rej} · total ${d.n}`))
     .on("mouseleave", hideTip);
}

function drawHeat() {
  const root = d3.select("#v1-heat").html("");
  const rows = ["all", ...(state.v1Expanded ? AGENTS : []), "human"];
  const W = root.node().clientWidth, L = 100, top = 22, cellH = 36, gapHuman = 10;
  const cw = (W - L) / TASKS.length;
  const H = top + rows.length * cellH + gapHuman + 4;

  // per cell stats
  const cells = [];
  rows.forEach((r, i) => {
    const f = rowFilter(r);
    TASKS.forEach((t, j) => {
      const ps = state.prs.filter(p => f(p) && p.task === t);
      const rej = ps.filter(p => p.outcome === "rejected").length;
      cells.push({ row: r, task: t, i, j, n: ps.length, rej, rate: ps.length ? rej / ps.length : NaN });
    });
  });

  const color = state.v1Mode === "rate"
    ? d3.scaleSequential([0, 0.6], d3.interpolateRgb("#fff", "#7e1d36")).clamp(true)
    : d3.scaleSequential([0, d3.max(cells, c => c.rej) || 1], d3.interpolateRgb("#fff", "#7e1d36"));
  const val = c => state.v1Mode === "rate" ? c.rate : c.rej;
  const y = i => top + i * cellH + (rows[i] === "human" ? gapHuman : 0);

  const svg = root.append("svg").attr("width", W).attr("height", H);
  svg.selectAll("text.col").data(TASKS).join("text").attr("class", "col")
    .attr("x", (d, j) => L + j * cw + cw / 2).attr("y", 14).attr("text-anchor", "middle").attr("font-weight", 600)
    .text(d => d === "maintenance" ? "maint." : d);

  const lab = svg.selectAll("g.rl").data(rows).join("g").attr("class", "rl")
    .attr("transform", (d, i) => `translate(0,${y(i) + cellH / 2 + 4})`);
  lab.filter(d => d === "all").append("text").attr("x", 2).attr("class", "rowlabel")
    .text(state.v1Expanded ? "▾" : "▸")
    .on("click", () => update({ v1Expanded: !state.v1Expanded }));
  lab.append("text").attr("class", "rowlabel").attr("x", L - 8).attr("text-anchor", "end")
    .attr("font-weight", d => (d === "all" || d === "human") ? 700 : 400)
    .attr("fill", d => d === "human" ? "#55606b" : "var(--ink)")
    .text(d => d === "all" ? "All agents" : d === "human" ? "Human" : d)
    .on("click", (e, d) => update({ sel: { row: d, task: null }, exitPick: null }));

  const isSel = c => state.sel && state.sel.row === c.row && (state.sel.task === c.task || state.sel.task === null);
  const g = svg.selectAll("g.cell").data(cells).join("g").attr("class", "cell")
    .classed("sel", isSel)
    .attr("transform", c => `translate(${L + c.j * cw + 2},${y(c.i) + 2})`)
    .on("click", (e, c) => update({ sel: { row: c.row, task: c.task }, exitPick: null }))
    .on("mousemove", (e, c) => showTip(e, `<b>${c.row === "all" ? "All agents" : c.row} × ${c.task}</b><br>
        rejected ${c.rej} · merged ${c.n - c.rej} · total ${c.n}<br>rejection rate ${pct(c.rate)}`))
    .on("mouseleave", hideTip);
  g.append("rect").attr("class", "bg").attr("width", cw - 4).attr("height", cellH - 4).attr("rx", 2)
    .attr("fill", c => c.n ? color(val(c)) : "#f2f2f2");
  g.filter(c => c.n > 0 && c.n <= SMALL_N).append("rect")
    .attr("x", 2).attr("y", 2).attr("width", cw - 8).attr("height", cellH - 8)
    .attr("fill", "none").attr("stroke", "#555").attr("stroke-dasharray", "3,2");

  const dark = c => c.n && (state.v1Mode === "rate" ? c.rate > 0.3 : color.domain()[1] && c.rej / color.domain()[1] > 0.5);
  const small = c => c.n <= SMALL_N;
  g.append("text").attr("x", (cw - 4) / 2).attr("y", c => small(c) ? 15 : 15).attr("text-anchor", "middle")
    .attr("font-weight", 700).attr("font-size", c => small(c) ? 10 : 12)
    .attr("fill", c => dark(c) ? "#fff" : "var(--ink)")
    .text(c => !c.n ? "–" : small(c) ? `${c.rej} rej.` : state.v1Mode === "rate" ? pct(c.rate) : c.rej);
  g.append("text").attr("x", (cw - 4) / 2).attr("y", 27).attr("text-anchor", "middle").attr("font-size", 9)
    .attr("fill", c => dark(c) ? "#fff" : "var(--muted)")
    .text(c => !c.n ? "" : small(c) ? `(n=${c.n})` : `${c.rej}/${c.n}`);

  drawLegend(color);
}

function drawLegend(color) {
  const root = d3.select("#v1-legend").html("");
  const W = Math.min(340, root.node().clientWidth), svg = root.append("svg").attr("width", W).attr("height", 34);
  const id = "v1grad";
  const grad = svg.append("defs").append("linearGradient").attr("id", id);
  d3.range(0, 1.01, 0.1).forEach(t => grad.append("stop").attr("offset", t).attr("stop-color", color(color.domain()[0] + t * (color.domain()[1] - color.domain()[0]))));
  svg.append("rect").attr("x", 16).attr("y", 4).attr("width", W - 40).attr("height", 10).attr("fill", `url(#${id})`).attr("stroke", "#999");
  const ax = d3.scaleLinear().domain(color.domain()).range([16, W - 24]);
  const ticks = state.v1Mode === "rate" ? [0, 0.2, 0.4, 0.6] : ax.ticks(4);
  svg.selectAll("text").data(ticks).join("text").attr("x", ax).attr("y", 28).attr("text-anchor", "middle").attr("font-size", 10)
    .text(t => state.v1Mode === "rate" ? (t === 0.6 ? "≥60%" : pct(t)) : t);
}
