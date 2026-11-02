# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `read_scan`, `draft_estimate`, and
  `get_pricing` MCP tools, plus `read-scan`, `draft-estimate`,
  and `pricing` CLI commands. The server is a local stdio
  bridge that forwards each call as JSON-RPC to the hosted
  GroundTruth endpoint (`https://gtfi.ai/mcp`, overridable via
  `GROUNDTRUTH_MCP_URL`); no authentication.
