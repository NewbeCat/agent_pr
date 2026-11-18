import os, csv, json, time
import requests

TOKEN = os.environ.get("GITHUB_TOKEN")
assert TOKEN, "Set GITHUB_TOKEN first"
S = requests.Session()
S.headers.update({"Authorization": f"Bearer {TOKEN}",
                  "Accept": "application/vnd.github+json"})
API = "https://api.github.com"


def get(url):
    while True:
        r = S.get(url)
        if r.status_code in (403, 429):
            reset = int(r.headers.get("X-RateLimit-Reset", time.time() + 60))
            time.sleep(max(reset - time.time() + 2, 5))
            continue
        r.raise_for_status()
        return r.json()


rows = [r for r in csv.DictReader(open("prs_v2.csv", encoding="utf-8")) if r["outcome"] == "closed"]
out = {}
for i, r in enumerate(rows, 1):
    key = f'{r["repo"]}#{r["pr"]}'
    issue = get(f'{API}/repos/{r["repo"]}/issues/{r["pr"]}')
    by, author = issue.get("closed_by"), issue["user"]["login"]
    if not by:
        out[key] = "bot"
    elif by["login"] == author:
        out[key] = "author"
    elif by["type"] == "Bot" or by["login"].endswith("[bot]"):
        out[key] = "bot"
    else:
        out[key] = "human"
    if i % 25 == 0:
        print(f"{i}/{len(rows)}")

json.dump(out, open("closers.json", "w", encoding="utf-8"), indent=0)
print(f"Done: {len(out)} closers -> closers.json")
