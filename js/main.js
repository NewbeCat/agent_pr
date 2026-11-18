const d3 = window.d3; //bundled with - can run on offline, think of if we can do live though - github?
import { state, update, subscribe } from "./state.js";
import { renderV1 } from "./v1.js";
import { renderV2 } from "./v2.js";
import { renderV3 } from "./v3.js";
import { renderResp } from "./resp.js";

const data = await d3.json("data/prs.json");
state.prs = data.prs;
state.meta = data.meta;

const agents = data.prs.filter(p => p.group === "agent").length;
document.getElementById("meta").textContent =
  `${data.prs.length} closed PRs · ${agents} agent · ${data.prs.length - agents} human · 10 repositories · Aug–Sep 2026`;

//!!!V1 color-mode buttons are in the static HTML!!!
document.querySelectorAll("#v1 .toggle").forEach(b =>
  b.addEventListener("click", () => update({ v1Mode: b.dataset.mode })));

subscribe(renderV1);
subscribe(renderV2);
subscribe(renderResp);
subscribe(renderV3);
update({});

let t;
window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => update({}), 150); });
