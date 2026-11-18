import os, csv, json, time
from datetime import datetime
import requests

TOKEN = os.environ.get("GITHUB_TOKEN")
assert TOKEN, "Set GITHUB_TOKEN first"
S = requests.Session()
S.headers.update({"Authorization": f"Bearer {TOKEN}",
                  "Accept": "application/vnd.github+json"})
API = "https://api.github.com"


def get(url, params=None):
    while True:
        r = S.get(url, params=params)
        if r.status_code in (403, 429) and r.headers.get("X-RateLimit-Remaining") == "0":
            wait = int(r.headers.get("X-RateLimit-Reset", time.time() + 60)) - time.time() + 2
            print(f"  rate limit, sleeping {int(wait)}s")
            time.sleep(max(wait, 5))
            continue
        if r.status_code in (403, 429):
            time.sleep(60)
            continue
        r.raise_for_status()
        return r.json()


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def actor(user, author_login):
    if not user:
        return "bot"
    if user["login"] == author_login:
        return "author"
    if user["type"] == "Bot" or user["login"].endswith("[bot]"):
        return "bot"
    return "human"


rows = list(csv.DictReader(open("prs.csv", encoding="utf-8")))
old_events = json.load(open("events.json", encoding="utf-8"))
new_events = {}

for i, r in enumerate(rows, 1):
    repo, n = r["repo"], r["pr"]
    key = f"{repo}#{n}"
    pr = get(f"{API}/repos/{repo}/pulls/{n}")
    author = pr["user"]["login"]
    reviews = get(f"{API}/repos/{repo}/pulls/{n}/reviews", {"per_page": 100})
    comments = get(f"{API}/repos/{repo}/issues/{n}/comments", {"per_page": 100})

    ev = [{"t": pr["created_at"], "e": "opened", "actor": "author"}]
    ev += [{"t": e["t"], "e": "commit", "actor": "author"}
           for e in old_events.get(key, []) if e["e"] == "commit"]
    ev += [{"t": rv["submitted_at"], "e": "review_" + rv["state"].lower(),
            "actor": actor(rv.get("user"), author)}
           for rv in reviews if rv.get("submitted_at")]
    ev += [{"t": c["created_at"], "e": "comment", "actor": actor(c.get("user"), author)}
           for c in comments]
    ev.append({"t": pr["closed_at"], "e": "merged" if pr["merged_at"] else "closed",
               "actor": "human"})
    ev.sort(key=lambda e: e["t"])
    new_events[key] = ev

    human = [e for e in ev if e["actor"] == "human" and e["e"].startswith(("review", "comment"))]
    first_human = human[0]["t"] if human else None
    revised = first_human and any(e["e"] == "commit" and e["t"] > first_human for e in ev)

    r["title"] = pr["title"]
    r["human_reviews"] = sum(e["e"].startswith("review") for e in human)
    r["human_comments"] = sum(e["e"] == "comment" for e in human)
    r["bot_reviews"] = sum(e["actor"] == "bot" and e["e"].startswith("review") for e in ev)
    r["bot_comments"] = sum(e["actor"] == "bot" and e["e"] == "comment" for e in ev)
    r["hours_to_first_human_response"] = (
        round((ts(first_human) - ts(pr["created_at"])).total_seconds() / 3600, 2) if first_human else "")
    r["end_stage"] = ("revised_after_feedback" if revised
                      else "human_feedback" if first_human
                      else "no_human_response")
    if i % 50 == 0:
        print(f"{i}/{len(rows)}")

with open("prs_v2.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=rows[0].keys())
    w.writeheader()
    w.writerows(rows)
with open("events_v2.json", "w", encoding="utf-8") as f:
    json.dump(new_events, f)
print(f"Done: {len(rows)} PRs -> prs_v2.csv, events_v2.json")
