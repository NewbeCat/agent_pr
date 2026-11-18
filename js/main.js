const d3 = window.d3; //bundled with - can run on offline, think of if we can do live though - github?
import { state, update, subscribe, setRepo } from "./state.js";
import { renderV1 } from "./v1.js";
import { renderV2 } from "./v2.js";
import { renderV3 } from "./v3.js";
import { renderResp } from "./resp.js";

const data = await d3.json("data/prs.json");
state.allPrs = data.prs;
state.prs = data.prs;
state.meta = data.meta;

function renderMeta() {
  const agents = state.prs.filter(p => p.group === "agent").length;
  const repos = new Set(state.prs.map(p => p.repo)).size;
  document.getElementById("meta").textContent =
    `${state.prs.length} closed PRs · ${agents} agent · ${state.prs.length - agents} human · ${repos} repositor${repos === 1 ? "y" : "ies"} · Aug–Sep 2026`;
}
const repoSel = d3.select("#repo");
const repoList = d3.groups(data.prs, p => p.repo).map(([repo, ps]) => ({
  repo, n: ps.length,
  agents: [...new Set(ps.filter(p => p.group === "agent").map(p => p.agent))].join(", "),
})).sort((a, b) => d3.ascending(a.repo.toLowerCase(), b.repo.toLowerCase()));
repoSel.append("option").attr("value", "all").text(`All repositories (${data.prs.length} PRs)`);
repoList.forEach(r => repoSel.append("option").attr("value", r.repo).text(`${r.repo} · ${r.agents} (${r.n})`));
repoSel.on("change", e => setRepo(e.target.value));

//!!!V1 color-mode buttons are in the static HTML!!!
document.querySelectorAll("#v1 .toggle").forEach(b =>
  b.addEventListener("click", () => update({ v1Mode: b.dataset.mode })));

subscribe(renderMeta);
subscribe(renderV1);
subscribe(renderV2);
subscribe(renderResp);
subscribe(renderV3);
update({});

let t;
window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => update({}), 150); });
