# CI alignment: `.github/workflows/ci.yml` against the project's runtime

Every claim below points to a file in the repo. Anything the repo can't confirm is marked **unknown**.

| Topic | What the repo says | Aligned? |
|---|---|---|
| **When CI runs** | ci.yml:4-7 has `on: pull_request` and `push` to `branches: [main]`. | **Gap.** Pushing `fix/email-loop-hardening` alone does **not** run CI. The first CI run needs a pull request (an owner decision), or a later change to the triggers. |
| **Node version in CI** | ci.yml:21-23 runs `actions/setup-node` (v4.4.0, pinned by SHA) with `node-version-file: package.json`, and package.json has `"engines": {"node": ">=18"}`. | **Unknown.** `>=18` is a range, and which version setup-node resolves it to can't be confirmed offline. No `.nvmrc` or `.node-version` exists. |
| **Node version on Vercel** | vercel.json sets `functions` (`maxDuration`) but no runtime or Node version; the only hint is package.json `engines: >=18`. | **Unknown.** No Vercel access. |
| **Node version verified locally** | Every local run in this session used Node v22.23.4 (`node --version`). | It is not established that CI or Vercel use 22. Recommend pinning `engines` (for example `22.x`) once you've checked the Vercel project setting (listed under "later"). |
| **Install** | ci.yml:29 runs `npm ci --ignore-scripts`; package-lock.json is lockfileVersion 3 with 14 package entries; the only dependency is `@resvg/resvg-js` 2.6.2. | The CI install matches the lockfile. Vercel's install command is **unknown**: vercel.json sets none, so it uses Vercel's default. |
| **Test command** | ci.yml:33-44 runs every `git ls-files '*-regression.cjs'`, including the 6 under `grok-patch/`, as `timeout 300 node "$t"`, and fails if fewer than 90 files are found. | Matches the local suite, which runs the same file list. The local runs also used a no-network namespace; CI doesn't, and relies on each test stubbing `fetch` (they do). The count is now 102 against a floor of 90, which is fine but loose. |
| **No real store in CI** | ci.yml:24-28 fails if any `KV_*` or `UPSTASH_*` variable is set. | Aligned with the tests, which use the in-memory store. |
| **Real-Redis proof** | scripts/real-redis-proof.cjs needs a local `redis-server`; it is not a `*-regression.cjs` file. | **Not in CI**, by design. Whether GitHub's `ubuntu-latest` image provides `redis-server` is unknown here. |
| **Permissions and secrets** | ci.yml:8-9 sets `permissions: contents: read`; checkout runs with `persist-credentials: false`; no secrets are referenced. | Aligned with "no secrets in CI". |
| **Other workflow** | .github/workflows/worker.yml runs on a schedule with `node-version: 20`, uses repository secrets, and uses `@v4` tags that aren't SHA-pinned. | Unrelated to this gate. Listed under "later". |

**Bottom line:** the CI file is consistent with how the suite runs locally, but two things are unproven:
- CI has never run on GitHub, and won't for this branch without a pull request.
- The Node version is unpinned in CI and unknown on Vercel.
