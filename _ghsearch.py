import sys, json, urllib.request, urllib.parse, time

def get(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "gta-wh-research",
        "Accept": "application/vnd.github+json",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def fmt(items):
    for it in items:
        lic = (it.get("license") or {}).get("spdx_id") or "none"
        desc = (it.get("description") or "").replace("\n", " ")[:160]
        print(f'{it["full_name"]}\t{it["stargazers_count"]}\t{lic}\t{it["html_url"]}\t{desc}')

if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "q":
        queries = sys.argv[2:]
        for i, q in enumerate(queries):
            url = "https://api.github.com/search/repositories?q=" + urllib.parse.quote(q) + "&sort=stars&per_page=8"
            print(f"===== QUERY: {q} =====")
            try:
                d = get(url)
                fmt(d.get("items", []))
            except Exception as e:
                print("ERROR:", e)
            if i < len(queries) - 1:
                time.sleep(7)
    elif mode == "repo":
        for i, full in enumerate(sys.argv[2:]):
            print(f"===== REPO: {full} =====")
            try:
                it = get(f"https://api.github.com/repos/{full}")
                lic = (it.get("license") or {}).get("spdx_id") or "none"
                print(f'{it["full_name"]}\t{it["stargazers_count"]}\t{lic}\t{it["html_url"]}\t{(it.get("description") or "")[:160]}')
            except Exception as e:
                print("ERROR:", e)
            if i < len(sys.argv[2:]) - 1:
                time.sleep(1)
    elif mode == "org":
        org = sys.argv[2]
        d = get(f"https://api.github.com/orgs/{org}/repos?per_page=100&sort=pushed")
        for it in d:
            lic = (it.get("license") or {}).get("spdx_id") or "none"
            print(f'{it["full_name"]}\t{it["stargazers_count"]}\t{lic}\t{(it.get("description") or "")[:120]}')
