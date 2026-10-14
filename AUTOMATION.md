# Contribution refresh

- Daily at **00:17 UTC / 07:17 WIB**, plus manual runs in **Actions → Refresh work contributions → Run workflow**. GitHub schedules can be delayed.
- Fetches `hungryfool-klg`’s GitHub contribution calendars from **2024 through the current UTC year**. Counts use the workflow token’s public view; no work credentials or repository details are stored.
- Validates data and hover/touch/keyboard behavior, regenerates `docs/contributions.png`, and commits the JSON/image as `github-actions[bot]`. The profile text stays unchanged.
- Explicitly deploys `docs` to Pages in the same run. Bot commits do not trigger another run. Pages must use **GitHub Actions**, not branch builds.
- A fetch/check failure stops publication and leaves the last published snapshot intact. Runs that change neither data nor image do not create a commit.

## Local check or refresh

```sh
npm ci --ignore-scripts
npx playwright install chromium
python3 -m http.server 8766 --bind 127.0.0.1 --directory docs
# In another terminal:
npm run check
GH_TOKEN=... npm run refresh
```

Use a token through the environment; never commit it. On a machine with system Chromium, set `CHROMIUM_PATH` to its executable. An alternate preview URL can be passed to either script, for example `node refresh.cjs http://127.0.0.1:8767/`.
