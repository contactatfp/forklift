import os, re, json
root = "/work/submission"
skip_dirs = {".git","node_modules",".next","dist","build","__pycache__",".venv","venv",".turbo"}
skip_files = {"package-lock.json","pnpm-lock.yaml","yarn.lock","uv.lock"}
pats = [
  ("solari live key", re.compile(r"slr_live_[A-Za-z0-9]+")),
  ("github pat", re.compile(r"github_pat_[A-Za-z0-9_]+")),
  ("github token", re.compile(r"ghp_[A-Za-z0-9]{20,}")),
  ("aws access key", re.compile(r"AKIA[0-9A-Z]{16}")),
  ("private key", re.compile(r"-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----")),
  ("openai key", re.compile(r"sk-[A-Za-z0-9]{20,}")),
]
hits = []
for dirpath, dirnames, filenames in os.walk(root):
  dirnames[:] = [d for d in dirnames if d not in skip_dirs]
  for name in filenames:
    if name in skip_files or name.endswith(".example") or name.endswith(".sample"):
      continue
    path = os.path.join(dirpath, name)
    try:
      if os.path.getsize(path) > 800000:
        continue
      with open(path, "r", encoding="utf-8", errors="ignore") as f:
        text = f.read()
    except Exception:
      continue
    rel = os.path.relpath(path, root)
    for label, rx in pats:
      if rx.search(text):
        hits.append(f"{label} in {rel}")
print(json.dumps(hits))
