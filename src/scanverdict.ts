/**
 * scanverdict core: forwarding to the hosted GroundTruth endpoint.
 *
 * The hosted service at https://gtfi.ai/mcp speaks JSON-RPC 2.0
 * over POST (Streamable HTTP, no authentication). This core
 * takes a tool name and an argument set, validates the arguments
 * against the documented shapes, wraps them in a `tools/call`
 * JSON-RPC request, and returns the upstream `result` payload
 * unchanged. The endpoint base is overridable with the
 * GROUNDTRUTH_MCP_URL environment variable or an explicit
 * option, and the fetch function is injectable so tests run
 * against a fake fetch with no live network.
 *
 * Error honesty: a non-2xx HTTP status, a JSON-RPC `error`
 * member, a non-JSON body, or a response with neither `result`
 * nor `error` is thrown as an error naming what the upstream
 * actually said — never converted into a fabricated success.
 */
import type {
  DraftEstimateArgs,
  FetchFn,
  ForwardOptions,
  ReadScanArgs,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_BASE_URL = "https://gtfi.ai/mcp";

export const DISCIPLINES = ["gpr", "locate", "pipe", "xray", "milestone"] as const;
export const TRADES = ["electrical", "plumbing", "hvac", "general"] as const;

let nextId = 1;

/** Resolve the endpoint: explicit option, then env, then default. */
export function resolveBaseUrl(options: ForwardOptions = {}): string {
  if (options.baseUrl) return options.baseUrl;
  const fromEnv = process.env.GROUNDTRUTH_MCP_URL;
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_BASE_URL;
}

function defaultFetch(url: string, init: Parameters<FetchFn>[1]): ReturnType<FetchFn> {
  return fetch(url, init);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is required and must be a non-empty string`);
  }
  return value;
}

function optionalEnum<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

/** Validate `read_scan` arguments and return the normalised set. */
export function validateReadScan(args: unknown): ReadScanArgs {
  if (!isRecord(args)) throw new Error("read_scan arguments must be an object");
  const out: ReadScanArgs = { image_url: requireString(args.image_url, "image_url") };
  const discipline = optionalEnum(args.discipline, "discipline", DISCIPLINES);
  if (discipline !== undefined) out.discipline = discipline;
  const fieldNote = optionalString(args.field_note, "field_note");
  if (fieldNote !== undefined) out.field_note = fieldNote;
  return out;
}

/** Validate `draft_estimate` arguments and return the normalised set. */
export function validateDraftEstimate(args: unknown): DraftEstimateArgs {
  if (!isRecord(args)) throw new Error("draft_estimate arguments must be an object");
  const out: DraftEstimateArgs = {
    job_description: requireString(args.job_description, "job_description"),
  };
  const trade = optionalEnum(args.trade, "trade", TRADES);
  if (trade !== undefined) out.trade = trade;
  return out;
}

/** Validate `get_pricing` arguments (the tool takes none). */
export function validateGetPricing(args: unknown): Record<string, never> {
  if (args !== undefined && !isRecord(args)) {
    throw new Error("get_pricing arguments must be an object");
  }
  return {};
}

/**
 * Forward one tool call to the hosted endpoint as JSON-RPC and
 * return the upstream result payload unchanged.
 */
export async function callUpstream(
  name: string,
  args: Record<string, unknown>,
  options: ForwardOptions = {},
): Promise<unknown> {
  const url = resolveBaseUrl(options);
  const fetchFn = options.fetchFn ?? defaultFetch;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: nextId++,
    method: "tools/call",
    params: { name, arguments: args },
  });

  let response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body,
    });
  } catch (err) {
    throw new Error(
      `upstream request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`upstream ${url} returned HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`upstream ${url} returned a non-JSON response: ${text.slice(0, 500)}`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`upstream ${url} returned a non-object JSON-RPC response`);
  }
  if (parsed.error !== undefined) {
    const detail = isRecord(parsed.error)
      ? `${parsed.error.code ?? "error"}: ${parsed.error.message ?? JSON.stringify(parsed.error)}`
      : String(parsed.error);
    throw new Error(`upstream ${url} returned a JSON-RPC error (${detail})`);
  }
  if (!("result" in parsed)) {
    throw new Error(`upstream ${url} returned a JSON-RPC response with neither result nor error`);
  }
  return parsed.result;
}

/** `read_scan`: forward a validated scan read. */
export async function readScan(
  args: unknown,
  options: ForwardOptions = {},
): Promise<unknown> {
  const valid = validateReadScan(args);
  return callUpstream("read_scan", { ...valid }, options);
}

/** `draft_estimate`: forward a validated bid draft request. */
export async function draftEstimate(
  args: unknown,
  options: ForwardOptions = {},
): Promise<unknown> {
  const valid = validateDraftEstimate(args);
  return callUpstream("draft_estimate", { ...valid }, options);
}

/** `get_pricing`: forward a pricing lookup (no arguments). */
export async function getPricing(
  args: unknown = {},
  options: ForwardOptions = {},
): Promise<unknown> {
  validateGetPricing(args);
  return callUpstream("get_pricing", {}, options);
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
