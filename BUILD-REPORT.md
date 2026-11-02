# scanverdict — Build Report

MCP Rebuild 1000, Batch 11. Rebuild of the GroundTruth MCP
server (original repo `Dranos-Bot/groundtruth-mcp`, rank 409),
from the firsthand spec at
`~/workspace/mcp-rebuild-100/specs-batch10/groundtruth.md`. The
original is a hosted-only service — its repo is the public
interface contract (README field tables), and the server
implementation is not open source — so this rebuild is a local
stdio bridge that forwards each tool call as JSON-RPC to the
hosted endpoint. Local build only — nothing pushed or
published.

Identity: repo `scanverdict`, npm `@reneturcios/scanverdict`,
MCP name `io.github.CloudCorpRecords/scanverdict`, version
`0.1.0`, bin `scanverdict` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Local stdio
  bridge to GroundTruth scan reads, bid drafts and pricing.",
  69 chars ≤100; npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/scanverdict:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/scanverdict"`),
  `tsconfig.json`, `.gitignore`, `package-lock.json`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios),
  `README.md` (fresh text), `CHANGELOG.md` (single 0.1.0 entry,
  2026-10-27)
- `src/index.ts`, `src/cli.ts` (`read-scan`,
  `draft-estimate`, `pricing`, `mcp`, `--version`; exit 2
  usage / 1 runtime error, argument validation before any
  network call), `src/mcp.ts`, `src/types.ts`,
  `src/scanverdict.ts` (core, `VERSION = "0.1.0"`)
- `test/scanverdict.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`

## Tools implemented (3)

- `read_scan` — `image_url` (string, required),
  `discipline` (enum `gpr|locate|pipe|xray|milestone`, default
  `gpr`), `field_note` (string, optional)
- `draft_estimate` — `job_description` (string, required),
  `trade` (enum `electrical|plumbing|hvac|general`, optional)
- `get_pricing` — no arguments

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with explicit
  inputSchema literals exactly matching the fixture, per the
  standing fleet rule; zod still validates every `tools/call`.
- The core (`src/scanverdict.ts`) validates arguments, wraps
  them in a `tools/call` JSON-RPC 2.0 POST to the hosted
  endpoint `https://gtfi.ai/mcp` (no auth), overridable via the
  `GROUNDTRUTH_MCP_URL` env var or an explicit option, and
  returns the upstream `result` unchanged. The fetch function
  is injectable (`ForwardOptions.fetchFn`); tests use a fake
  fetch only — no live network calls in tests.
- Error honesty: non-2xx HTTP status, a JSON-RPC `error`
  member, a non-JSON body, a response with neither `result`
  nor `error`, and a failed fetch all throw errors naming what
  the upstream actually said — never a fabricated success.
- Safety wording preserved: the `read_scan` tool description
  states plainly that results are advisory only, never a
  clearance to cut, core or dig, and that a certified
  technician must review and sign off before any coring or
  excavation; the README carries the same warning.

## Verification (foreground, this run)

- `tsc --noEmit` exit 0; `tsc` build exit 0 (`dist/cli.js`)
- Tests (`tsx --test test/*.test.ts`): **14 tests, 14 pass,
  0 fail** — success forwarding for all three tools (URL,
  method, JSON-RPC body shape asserted), optional-field
  omission, base-URL override, argument validation (missing
  required fields rejected before any fetch, unknown
  discipline/trade rejected, all documented enum values
  accepted), and upstream error honesty (HTTP status,
  JSON-RPC error, non-JSON body, missing result/error,
  fetch failure)
- `node dist/cli.js --version` → `0.1.0`; unknown command
  prints usage and exits 2
- Parity: `harness/parity.py` vs
  `harness/fixtures/groundtruth-tools-original.json`
  (docs-derived fixture, `_source` labelled as such) →
  **PASS, parity 100.0, original_tools 3, rebuild_tools 3,
  no missing/extra/schema diffs**

## Lockfile status

`package-lock.json` generated clean via Route 3 (temp copy
with only `package.json`, offline `npm install
--package-lock-only --ignore-scripts --offline`), verified:
parses, name `@reneturcios/scanverdict`, **128 package
entries**. Local `node_modules` is a symlink to the sibling
burnmeter tree; gitignored.

## Gaps / honest notes

- **Live upstream behaviour is unproven.** The hosted endpoint
  was never called during this build; all tests run against a
  fake fetch. The forwarding shape follows the documented
  JSON-RPC contract, but the upstream's real result payloads,
  its tools/call framing over Streamable HTTP (including any
  session or content-negotiation requirements), and its rate
  limits (documented: `read_scan` 2 per caller per day,
  `draft_estimate` 5/hour and 20/day) have not been exercised.
- The upstream result is returned unchanged; this bridge does
  not inspect or re-shape hazard classes or QA flags, so any
  upstream wording change flows straight through.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.
