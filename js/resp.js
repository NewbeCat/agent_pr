import { state, update, EXIT_LABEL, selectionPRs, selectionLabel } from "./state.js";
import { responsesFor } from "./responses.js";
const d3 = window.d3;

const stageName = s => s[0].toUpperCase() + s.slice(1);
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function renderResp() {
  const cardsRoot = d3.select("#resp-cards").html("");
  const listRoot = d3.select("#resp-list").html("");
  const pick = state.exitPick, sel = state.sel;
  if (!sel || !pick) {
    d3.select("#resp-sel").text("click an exit in V2");
    cardsRoot.append("div").attr("class", "label").text("Pick where PRs stopped (an exit in V2) to see what a maintainer can do about it.");
    return;
  }
  const list = selectionPRs(sel).filter(p => p.stage === pick.stage && p.exit === pick.exit);
  d3.select("#resp-sel").text(`${selectionLabel(sel)} · ${stageName(pick.stage)} → ${EXIT_LABEL[pick.exit]} (${list.length} PRs)`);

  //left: responses
  const resp = responsesFor(state.prs, pick.stage, pick.exit, sel, list);
  if (!resp.length) {
    cardsRoot.append("div").attr("class", "label").text(pick.exit === "approved"
      ? "These PRs were merged: nothing to fix here."
      : "Responses are shown for agent selections; Human PRs serve as the reference.");
  } else {
    cardsRoot.append("div").attr("class", "label").text("Responses");
    const cards = cardsRoot.append("div").attr("class", "cards");
    const test = rule => () => {
      update({ rule: structuredClone(rule) });
      document.getElementById("v3").scrollIntoView({ behavior: "smooth" });
    };
    resp.forEach(r => {
      const c = cards.append("div").attr("class", `card ${r.kind}`);
      c.append("b").text(r.title);
      if (r.kind === "rec") {
        c.append("p").html(`Would have closed ${r.j.n} past PRs: <b>${r.j.k}</b> agree with the maintainers (rejected anyway),
          <b>${r.j.n - r.j.k}</b> overrule them (merged). Catches ${r.j.hit} of ${list.length} PRs here.`);
        c.append("button").attr("class", "primary").text("Test in V3 ↓").on("click", test(r.rule));
      } else if (r.kind === "none") {
        if (r.rule) {
          c.append("p").text(`Closest: ${r.closestTitle.toLowerCase()}. It ${r.j.fails.join("; ")}.`);
          c.append("button").text("Test closest in V3 ↓").on("click", test(r.rule));
        } else c.append("p").text("No candidate rule closes any past PR in this segment.");
      } else {
        c.append("p").text(r.why);
        c.append("span").attr("class", "note").text("advice · not testable with this data");
      }
    });
  }

  //right: PR behind this exit
  listRoot.append("div").attr("class", "label").text("PRs at this exit");
  const t = listRoot.append("table");
  t.append("tr").html("<th>PR</th><th>agent</th><th>title</th><th>lines</th><th>open (h)</th>");
  t.selectAll("tr.r").data(list).join("tr").attr("class", "r").html(p =>
    `<td><a href="https://github.com/${p.repo}/pull/${p.pr}" target="_blank" rel="noopener">${p.repo.split("/")[1]}#${p.pr}</a></td>
     <td>${p.agent}</td><td>${escapeHtml(p.title)}</td><td>${p.lines}</td><td>${Math.round(p.closeH)}</td>`);
}
