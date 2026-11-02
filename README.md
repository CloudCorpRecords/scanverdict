# scanverdict

Would you core that slab on one AI's say-so? scanverdict is a
local stdio bridge to the hosted GroundTruth MCP service, which
gives subsurface scanning crews a second set of eyes: two
different AI models read a GPR, locate, pipe, or X-ray scan
independently — the first interprets, the second is prompted to
refute it — plus a voice-first bid builder for the trades and a
pricing lookup.

**Safety first:** a `read_scan` result is advisory only. It is
never a clearance to cut, core, or dig, and a certified
technician must review and sign off before any coring or
excavation. Disagreement between the two reads only ever raises
a hazard's severity; it never quietly clears one.

The hosted endpoint is `https://gtfi.ai/mcp` (no
authentication). This package runs locally as a stdio MCP
server and forwards each tool call to that endpoint as
JSON-RPC. Point it elsewhere with the `GROUNDTRUTH_MCP_URL`
environment variable.

Documented upstream limits: `read_scan` runs two vision models
per call and is limited to 2 per caller per day (with a global
daily ceiling); `draft_estimate` allows 5 per hour and 20 per
day per caller. Nothing is charged through the API.

## CLI

```bash
npx @reneturcios/scanverdict read-scan https://example.com/scan.jpg --discipline gpr --field-note "NW corner"
npx @reneturcios/scanverdict draft-estimate "Replaced the panel, 85 feet of conduit, 8 can lights, 16 hours" --trade electrical
npx @reneturcios/scanverdict pricing
npx @reneturcios/scanverdict --version
```

Output is the upstream result as JSON. Exit codes: `0` on
success, `1` on a runtime error (including an upstream
failure), `2` on a usage error.

## MCP server

```bash
npx -y @reneturcios/scanverdict mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "scanverdict": {
      "command": "npx",
      "args": ["-y", "@reneturcios/scanverdict", "mcp"]
    }
  }
}
```

### Tools

- `read_scan` — Two different AI models read a subsurface scan
  independently: the first interprets, the second is prompted
  to refute it. Advisory only; a certified technician must
  review and sign off before any coring or excavation.
  - `image_url` (string, required) — public https link to a
    JPEG or PNG, max 8 MB
  - `discipline` (string, optional) — one of `gpr`, `locate`,
    `pipe`, `xray`, `milestone`; default `gpr`
  - `field_note` (string, optional) — what the tech said on
    site; context only, it can never clear a hazard the image
    shows
- `draft_estimate` — Turns a plain-English trade job into an
  itemized bid at realistic US market prices.
  - `job_description` (string, required) — the job in plain
    English
  - `trade` (string, optional) — one of `electrical`,
    `plumbing`, `hvac`, `general`
- `get_pricing` — Current plans for both products. Free and
  unlimited. Takes no arguments.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/scanverdict
docker run --rm ghcr.io/cloudcorprecords/scanverdict pricing
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (fake fetch only, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
