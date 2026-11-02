/**
 * scanverdict types.
 *
 * scanverdict is a local stdio bridge to the hosted GroundTruth
 * MCP endpoint. It defines the three tool argument shapes the
 * hosted service documents — a subsurface scan read, a trade bid
 * draft, and a pricing lookup — plus the injectable fetch seam
 * the forwarding core uses, so tests can substitute a fake fetch
 * and no test ever touches the network.
 */

/** Scan disciplines accepted by `read_scan`. */
export type Discipline = "gpr" | "locate" | "pipe" | "xray" | "milestone";

/** Trades accepted by `draft_estimate`. */
export type Trade = "electrical" | "plumbing" | "hvac" | "general";

/** Arguments for `read_scan`. */
export interface ReadScanArgs {
  /** Public https link to a JPEG or PNG scan image. Max 8 MB. */
  image_url: string;
  /** Scan discipline; the hosted service defaults this to "gpr". */
  discipline?: Discipline;
  /** What the tech said on site. Context only. */
  field_note?: string;
}

/** Arguments for `draft_estimate`. */
export interface DraftEstimateArgs {
  /** Plain-English description of the trade job. */
  job_description: string;
  /** Trade for the estimate, when known. */
  trade?: Trade;
}

/** The subset of the fetch Response the core reads. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

/** Injectable fetch: same call shape as the global fetch. */
export type FetchFn = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<FetchResponseLike>;

/** Options for a forwarded call. */
export interface ForwardOptions {
  /** Endpoint URL override; defaults to the hosted endpoint (or env). */
  baseUrl?: string;
  /** Fetch implementation; defaults to the global fetch. */
  fetchFn?: FetchFn;
}
