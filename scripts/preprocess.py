import csv, json, os
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw")
STALE_DAYS = 7   # fallback only: a close after >= 7 quiet days counts as abandoned/stale

TASK = {"feat": "feat", "fix": "fix", "docs": "docs", "test": "test",
        "refactor": "refactor", "perf": "refactor", "style": "refactor",
        "chore": "maintenance", "ci": "maintenance", "build": "maintenance",
        "other": "other"}
STAGE = {"no_human_response": "opened", "human_feedback": "feedback",
         "revised_after_feedback": "revised"}


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def hrs(a, b):
    return round((b - a).total_seconds() / 3600, 2)


rows = list(csv.DictReader(open(os.path.join(RAW, "prs_v2.csv"), encoding="utf-8")))
events = json.load(open(os.path.join(RAW, "events_v2.json"), encoding="utf-8"))
closers_path = os.path.join(RAW, "closers.json")
closers = json.load(open(closers_path, encoding="utf-8")) if os.path.exists(closers_path) else None

out = []
for r in rows:
    key = f'{r["repo"]}#{r["pr"]}'
    ev = sorted(events[key], key=lambda e: e["t"])
    t_open = ts(next(e["t"] for e in ev if e["e"] == "opened"))
    close_ev = next(e for e in reversed(ev) if e["e"] in ("merged", "closed"))
    t_close = ts(close_ev["t"])

    fb = next((e for e in ev if e["actor"] == "human" and e["e"].startswith(("review", "comment"))), None)
    t_fb = ts(fb["t"]) if fb else None
    nxt = next((e for e in ev if t_fb and e["e"] == "commit" and ts(e["t"]) > t_fb), None)

    merged = r["outcome"] == "merged"
    if merged:
        exit_type = "approved"
    elif closers is not None and key in closers:
        exit_type = "maintainer" if closers[key] == "human" else "stale"
    else:
        last = [e for e in ev if e is not close_ev and ts(e["t"]) <= t_close]
        quiet = hrs(ts(last[-1]["t"]), t_close) if last else 0
        exit_type = "stale" if quiet >= STALE_DAYS * 24 else "maintainer"

    out.append({
        "key": key, "repo": r["repo"], "pr": int(r["pr"]), "title": r["title"],
        "group": r["group"], "agent": r["agent"], "task": TASK.get(r["task_type"], "other"),
        "lines": int(r["additions"]) + int(r["deletions"]),
        "outcome": "merged" if merged else "rejected",
        "stage": STAGE[r["end_stage"]], "exit": exit_type,
        "closeH": hrs(t_open, t_close),
        "fbH": hrs(t_open, t_fb) if t_fb else None,
        "fbGapH": hrs(t_fb, ts(nxt["t"])) if nxt else None,
        "humanReviews": int(r["human_reviews"]), "humanComments": int(r["human_comments"]),
    })

meta = {"exitSource": "closers.json" if closers is not None else f"heuristic ({STALE_DAYS} quiet days)",
        "n": len(out)}
os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
json.dump({"meta": meta, "prs": out}, open(os.path.join(ROOT, "data", "prs.json"), "w", encoding="utf-8"),
          separators=(",", ":"))
print(f"{len(out)} PRs -> data/prs.json  (exit type from {meta['exitSource']})")
