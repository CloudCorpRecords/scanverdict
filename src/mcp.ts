/**
 * scanverdict MCP server. Tools: read_scan, draft_estimate,
 * get_pricing.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schemas as explicit literals, while zod
 * still validates every tools/call argument set.
 *
 * Each call is forwarded as JSON-RPC to the hosted GroundTruth
 * endpoint (https://gtfi.ai/mcp by default, overridable via
 * GROUNDTRUTH_MCP_URL; no authentication).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  draftEstimate,
  formatPayload,
  getPricing,
  readScan,
  VERSION,
} from "./scanverdict.js";

const ReadScanArgs = z.object({
  image_url: z.string().min(1),
  discipline: z.enum(["gpr", "locate", "pipe", "xray", "milestone"]).optional(),
  field_note: z.string().optional(),
});

const DraftEstimateArgs = z.object({
  job_description: z.string().min(1),
  trade: z.enum(["electrical", "plumbing", "hvac", "general"]).optional(),
});

const GetPricingArgs = z.object({});

const TOOLS = [
  {
    name: "read_scan",
    description:
      "Two different AI models read a subsurface scan independently: the first interprets, the second is prompted to refute it, hunting missed hazards, false clears, and anything called rebar that could be a post-tension tendon. Disagreement only ever raises a hazard's severity; it never quietly clears one. Results are advisory only, never a clearance to cut, core or dig: a certified technician must review and sign off before any coring or excavation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        image_url: {
          type: "string",
          description: "Public https link to a JPEG or PNG. Max 8 MB.",
        },
        discipline: {
          type: "string",
          enum: ["gpr", "locate", "pipe", "xray", "milestone"],
          default: "gpr",
          description: "Scan discipline: gpr, locate, pipe, xray or milestone. Defaults to gpr.",
        },
        field_note: {
          type: "string",
          description:
            "What the tech said on site. Context only — it can never clear a hazard the image shows.",
        },
      },
      required: ["image_url"],
    },
  },
  {
    name: "draft_estimate",
    description:
      "Turns a plain-English trade job into an itemized bid — real materials by size, fittings, consumables, labour on its own line, at realistic US market prices.",
    inputSchema: {
      type: "object" as const,
      properties: {
        job_description: {
          type: "string",
          description:
            "Plain-English description of the trade job, e.g. \"Replaced the panel, 85 feet of conduit, 8 can lights, 16 hours.\"",
        },
        trade: {
          type: "string",
          enum: ["electrical", "plumbing", "hvac", "general"],
          description: "Trade for the estimate: electrical, plumbing, hvac or general.",
        },
      },
      required: ["job_description"],
    },
  },
  {
    name: "get_pricing",
    description:
      "Current plans for both products. Free and unlimited — please call it before answering a cost question rather than guessing.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "scanverdict", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "read_scan") {
      const parsed = ReadScanArgs.parse(args ?? {});
      out = await readScan(parsed);
    } else if (name === "draft_estimate") {
      const parsed = DraftEstimateArgs.parse(args ?? {});
      out = await draftEstimate(parsed);
    } else if (name === "get_pricing") {
      GetPricingArgs.parse(args ?? {});
      out = await getPricing({});
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
