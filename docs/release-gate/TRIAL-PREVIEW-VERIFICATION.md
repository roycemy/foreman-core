# Two-bot trial Preview: verification record

**Source:** an independent configuration check, run 2026-11-20 against:
- the live Vercel dashboard
- the GitHub API
- the Preview itself, signed in to Vercel

It records observed state only.

## Verified (2026-11-20)

- **Deployed commits:**
  - Branch `feat/two-bot-handoff-trial`: `a002541` ("feat: trial adapter works with a Preview behind Vercel Authentication") is **Ready** on this branch's Preview.
  - The earlier `9c644e0` also deployed Ready.
  - Production (`main`, `0991388`) is untouched.
- **Health:** signed in to Vercel, `GET https://foreman-core-git-feat-two-bot-handoff-trial-royce-myers.vercel.app/api/health` returned:

  ```json
  {"ok":true,"store":"upstash","time":"2026-11-20T21:32:06.443Z","v":14}
  ```

  - This proves the deployment is live and an Upstash REST store is configured and reachable.
  - It does **not** name the store host. Which store it is comes only from the preflight below.
- **CI:** the GitHub `regression` job on draft PR #130 completed successfully.
- **`vercel.json`:** at `a002541` it is byte-identical to `413e49a`. The temporary `git.deploymentEnabled` suppression is gone. Leave it as is.

## Isolation evidence (cited as is, qualifications intact)

The owner-side preflight printed:

```
PASS  preview: store resolves from KV_REST_API_URL + KV_REST_API_TOKEN -> host valued-glider-198085.upstash.io
PASS  production: store resolves from KV_REST_API_URL + KV_REST_API_TOKEN -> host massive-monkey-205467.upstash.io
PASS  preview store host differs from production (valued-glider-198085.upstash.io vs massive-monkey-205467.upstash.io)
PASS  preview and production store tokens differ
PASS  preview: ENC_SECRET present (production export has none to compare)
PASS  preview carries no outbound-capable variables
RESULT: PASS (static configuration only; not a runtime proof)
```

Qualifications:
- **Reconstructed inputs.** The branch's variables are write-only, so they could not be exported. The inputs were rebuilt from the live variable inventory (keys, environments, branch scopes) plus the actual store values from the store pages. The host and token comparisons used real values.
- **`ENC_SECRET` presence only.** Its value is write-only and could not be re-exported. The check covered presence only, using a placeholder; it is not a value comparison.
- **Read-only token checked separately.** The preflight does not check `KV_REST_API_READ_ONLY_TOKEN`. Its branch-scoped override was verified separately, in the inventory and on the Environment Variables page.
- **Static only.** This is not runtime proof. The health response above shows a live Upstash store but not its host.

The preflight has not been re-run against values this session cannot reach, and nothing here presents placeholder values as a fresh export.

## Remaining gate: owner decision pending, not approved

Every Preview of this project is behind Vercel Authentication. Until the owner decides, the assistants' gateway calls get a 302 to Vercel sign-in and the live self-test is **blocked**.

**If the owner approves:** one named "Protection Bypass for Automation" secret for the test window.
- **Scope:** it bypasses protection on **all** Previews of the project, not just this branch, until revoked. It does not bypass Alter's gateway-key checks. Production is not behind Vercel Authentication.
- **Handling:**
  - The owner creates it in the Vercel dashboard and saves it to a local file at a path he chooses, with no terminal echo, chat paste or shell history.
  - Only the pointer `ALTER_PROTECTION_BYPASS_FILE=<path>` is shared.
  - `scripts/trial-assistant-adapter.cjs` sends it as `x-vercel-protection-bypass` only when that is set, and never prints it (`adapter-bypass-header-regression.cjs`).
- **After the trial:** delete the secret on the same settings page (immediate, no redeploy needed) and remove the local file.

**If the owner declines:** the live self-test stays blocked. No other way through protection is attempted.

**Scope reminder:** the trial is a text handoff (moments and captions). It is not video clipping.
