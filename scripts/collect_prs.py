
import os, re, csv, json, time, collections
import requests

# ---- settings ----
START, END = "2026-07-01", "2026-09-30"   # PR 만들어진 시간
TOP_REPOS = 10                             # repos with the most agent PRs
MIN_STARS = 300                            # 개인이나 작은거 제거
MIN_AGENT_PRS = 10
MONTHS = [("2026-07-01", "2026-07-31"), ("2026-08-01", "2026-08-31"), ("2026-09-01", "2026-09-30")]
MAX_PER_GROUP = 60
AGENTS = {
    "copilot-swe-agent": "Copilot",
    "Copilot": "Copilot",
    "chatgpt-codex-connector": "Codex",
    "claude": "Claude Code",
    "devin-ai-integration": "Devin",
    "google-labs-jules": "Jules",
    "cursor": "Cursor",
}

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


def search(q, limit):
    items, page = [], 1
    while len(items) < limit and page <= 10:
        d = get(f"{API}/search/issues", {"q": q, "per_page": 100, "page": page})
        items += d["items"]
        if len(d["items"]) < 100:
            break
        page += 1
        time.sleep(2.2)
    time.sleep(2.2)
    return items[:limit]


def bare(login):
    return login.removesuffix("[bot]")


def task_type(title):
    m = re.match(r"\s*(feat|fix|docs|test|refactor|chore|perf|ci|build|style)\b", title, re.I)
    if m:
        return m.group(1).lower()
    t = title.lower()
    for k, words in {"fix": ["fix", "bug", "error"], "docs": ["doc", "readme"],
                     "test": ["test"], "refactor": ["refactor", "clean"],
                     "feat": ["add", "implement", "support", "feature"]}.items():
        if any(w in t for w in words):
            return k
    return "other"


def hours(a, b):
    from datetime import datetime
    f = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00"))
    return round((f(b) - f(a)).total_seconds() / 3600, 2) if a and b else ""


#### 1. agent PRs 가장 많은 repo들 찾기
repo_count = collections.Counter()
for login, name in AGENTS.items():
    if login == "Copilot":
        continue
    found = []
    for a, b in MONTHS:
        try:
            found += search(f"is:pr is:closed author:app/{login} created:{a}..{b}", 1000)
        except requests.HTTPError as e:
            print(f"{name} {a}: search failed ({e})")
    print(f"{name}: {len(found)} closed PRs found")
    for it in found:
        repo_count[it["repository_url"].split("/repos/")[1]] += 1

CODEX_MARK = "chatgpt.com/codex/tasks"
found = []
for a, b in MONTHS:
    found += search(f'is:pr is:closed "{CODEX_MARK}" in:body created:{a}..{b}', 1000)
print(f"Codex: {len(found)} closed PRs found")
for it in found:
    repo_count[it["repository_url"].split("/repos/")[1]] += 1

repos = []
for r, cnt in repo_count.most_common():
    if cnt < MIN_AGENT_PRS or len(repos) >= TOP_REPOS:
        break
    try:
        stars = get(f"{API}/repos/{r}")["stargazers_count"]
    except requests.HTTPError:
        continue
    if stars >= MIN_STARS:
        repos.append(r)
        print(f"  picked {r} ({stars} stars, {cnt} agent PRs)")
print("Top repos:", repos)

#2. per repo
rows, events = [], {}
for repo in repos:
    items = search(f"repo:{repo} is:pr is:closed created:{START}..{END}", 1000)
    picked = {"agent": 0, "human": 0}
    for it in items:
        user = it["user"]
        login = bare(user["login"])
        if login in AGENTS:
            group, agent = "agent", AGENTS[login]
        elif CODEX_MARK in (it.get("body") or ""):
            group, agent = "agent", "Codex"
        elif user["type"] == "Bot":
            continue
        else:
            group, agent = "human", "human"
        if picked[group] >= MAX_PER_GROUP:
            continue
        picked[group] += 1

        n = it["number"]
        base = f"{API}/repos/{repo}/pulls/{n}"
        pr = get(base)
        reviews = [rv for rv in get(f"{base}/reviews", {"per_page": 100})
                   if rv.get("user") and rv["user"]["login"] != user["login"] and rv.get("submitted_at")]
        commits = get(f"{base}/commits", {"per_page": 100})

        first_review = min((rv["submitted_at"] for rv in reviews), default=None)
        commit_times = [c["commit"]["committer"]["date"] for c in commits]
        after_review = sum(1 for t in commit_times if first_review and t > first_review)

        rows.append({
            "repo": repo, "pr": n, "group": group, "agent": agent,
            "task_type": task_type(pr["title"]),
            "additions": pr["additions"], "deletions": pr["deletions"],
            "files_changed": pr["changed_files"],
            "comments": pr["comments"] + pr["review_comments"],
            "reviews": len(reviews),
            "changes_requested": sum(rv["state"] == "CHANGES_REQUESTED" for rv in reviews),
            "commits_after_review": after_review,
            "hours_to_first_review": hours(pr["created_at"], first_review),
            "hours_to_close": hours(pr["created_at"], pr["closed_at"]),
            "outcome": "merged" if pr["merged_at"] else "closed",
            "created_at": pr["created_at"],
        })
        events[f"{repo}#{n}"] = (
            [{"t": pr["created_at"], "e": "opened"}]
            + [{"t": rv["submitted_at"], "e": "review_" + rv["state"].lower()} for rv in reviews]
            + [{"t": t, "e": "commit"} for t in commit_times]
            + [{"t": pr["closed_at"], "e": "merged" if pr["merged_at"] else "closed"}]
        )
    print(f"{repo}: agent {picked['agent']}, human {picked['human']}")

with open("prs.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=rows[0].keys())
    w.writeheader()
    w.writerows(rows)
with open("events.json", "w", encoding="utf-8") as f:
    json.dump(events, f)
print(f"Done: {len(rows)} PRs -> prs.csv, events.json")
