import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  draftEstimate,
  getPricing,
  readScan,
  resolveBaseUrl,
  validateDraftEstimate,
  validateReadScan,
} from "../src/scanverdict.js";
import type { FetchFn } from "../src/types.js";

/**
 * All tests use an injected fake fetch: no live network calls.
 * The fake records each request so forwarding shape (URL,
 * method, JSON-RPC body) can be asserted exactly, and returns
 * canned upstream responses.
 */

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

function fakeFetch(
  respond: (call: RecordedCall) => { status?: number; body: string },
): { fetchFn: FetchFn; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    const call: RecordedCall = {
      url,
      method: init.method,
      body: JSON.parse(init.body) as unknown,
    };
    calls.push(call);
    const { status = 200, body } = respond(call);
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  return { fetchFn, calls };
}

function rpcResult(result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id: 1, result });
}

describe("forwarding — success", () => {
  it("read_scan posts a tools/call JSON-RPC request to the default endpoint and returns the result", async () => {
    const upstream = {
      content: [{ type: "text", text: "target: rebar, depth 75mm, QA flag: disagree" }],
    };
    const { fetchFn, calls } = fakeFetch(() => ({ body: rpcResult(upstream) }));
    const out = await readScan(
      { image_url: "https://example.com/scan.jpg", discipline: "gpr", field_note: "NW corner" },
      { fetchFn },
    );
    assert.deepEqual(out, upstream);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://gtfi.ai/mcp");
    assert.equal(calls[0].method, "POST");
    const body = calls[0].body as {
      jsonrpc: string;
      method: string;
      params: { name: string; arguments: Record<string, unknown> };
    };
    assert.equal(body.jsonrpc, "2.0");
    assert.equal(body.method, "tools/call");
    assert.equal(body.params.name, "read_scan");
    assert.deepEqual(body.params.arguments, {
      image_url: "https://example.com/scan.jpg",
      discipline: "gpr",
      field_note: "NW corner",
    });
  });

  it("read_scan omits optional fields that were not given", async () => {
    const { fetchFn, calls } = fakeFetch(() => ({ body: rpcResult({ ok: true }) }));
    await readScan({ image_url: "https://example.com/a.png" }, { fetchFn });
    const body = calls[0].body as { params: { arguments: Record<string, unknown> } };
    assert.deepEqual(body.params.arguments, { image_url: "https://example.com/a.png" });
  });

  it("draft_estimate forwards the job description and trade", async () => {
    const upstream = { content: [{ type: "text", text: "total: $4,210" }] };
    const { fetchFn, calls } = fakeFetch(() => ({ body: rpcResult(upstream) }));
    const out = await draftEstimate(
      { job_description: "Replaced the panel, 85 feet of conduit", trade: "electrical" },
      { fetchFn },
    );
    assert.deepEqual(out, upstream);
    const body = calls[0].body as { params: { name: string; arguments: Record<string, unknown> } };
    assert.equal(body.params.name, "draft_estimate");
    assert.deepEqual(body.params.arguments, {
      job_description: "Replaced the panel, 85 feet of conduit",
      trade: "electrical",
    });
  });

  it("get_pricing forwards with an empty argument set", async () => {
    const upstream = { content: [{ type: "text", text: "Free tier: unlimited" }] };
    const { fetchFn, calls } = fakeFetch(() => ({ body: rpcResult(upstream) }));
    const out = await getPricing({}, { fetchFn });
    assert.deepEqual(out, upstream);
    const body = calls[0].body as { params: { name: string; arguments: Record<string, unknown> } };
    assert.equal(body.params.name, "get_pricing");
    assert.deepEqual(body.params.arguments, {});
  });

  it("honours an explicit base URL override", async () => {
    const { fetchFn, calls } = fakeFetch(() => ({ body: rpcResult(null) }));
    await getPricing({}, { fetchFn, baseUrl: "https://staging.example/mcp" });
    assert.equal(calls[0].url, "https://staging.example/mcp");
    assert.equal(resolveBaseUrl({ baseUrl: "https://staging.example/mcp" }), "https://staging.example/mcp");
  });
});

describe("argument validation", () => {
  it("rejects read_scan without an image_url, before any fetch", async () => {
    const { fetchFn, calls } = fakeFetch(() => ({ body: rpcResult(null) }));
    await assert.rejects(() => readScan({}, { fetchFn }), /image_url is required/);
    await assert.rejects(() => readScan({ image_url: "" }, { fetchFn }), /image_url is required/);
    assert.equal(calls.length, 0);
  });

  it("rejects an unknown discipline and an unknown trade", () => {
    assert.throws(
      () => validateReadScan({ image_url: "https://x.example/s.jpg", discipline: "sonar" }),
      /discipline must be one of: gpr, locate, pipe, xray, milestone/,
    );
    assert.throws(
      () => validateDraftEstimate({ job_description: "fix tap", trade: "roofing" }),
      /trade must be one of: electrical, plumbing, hvac, general/,
    );
  });

  it("rejects draft_estimate without a job_description", async () => {
    const { fetchFn, calls } = fakeFetch(() => ({ body: rpcResult(null) }));
    await assert.rejects(() => draftEstimate({}, { fetchFn }), /job_description is required/);
    assert.equal(calls.length, 0);
  });

  it("accepts every documented discipline and trade value", () => {
    for (const discipline of ["gpr", "locate", "pipe", "xray", "milestone"] as const) {
      assert.equal(
        validateReadScan({ image_url: "https://x.example/s.jpg", discipline }).discipline,
        discipline,
      );
    }
    for (const trade of ["electrical", "plumbing", "hvac", "general"] as const) {
      assert.equal(validateDraftEstimate({ job_description: "job", trade }).trade, trade);
    }
  });
});

describe("upstream error honesty", () => {
  it("throws on an HTTP error status, naming the status and body", async () => {
    const { fetchFn } = fakeFetch(() => ({ status: 503, body: "service unavailable" }));
    await assert.rejects(
      () => getPricing({}, { fetchFn }),
      /returned HTTP 503: service unavailable/,
    );
  });

  it("throws on a JSON-RPC error member, naming code and message", async () => {
    const { fetchFn } = fakeFetch(() => ({
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32602, message: "daily read_scan limit reached" },
      }),
    }));
    await assert.rejects(
      () => readScan({ image_url: "https://x.example/s.jpg" }, { fetchFn }),
      /JSON-RPC error \(-32602: daily read_scan limit reached\)/,
    );
  });

  it("throws on a non-JSON upstream body instead of fabricating a result", async () => {
    const { fetchFn } = fakeFetch(() => ({ body: "<html>oops</html>" }));
    await assert.rejects(() => getPricing({}, { fetchFn }), /non-JSON response/);
  });

  it("throws when the response carries neither result nor error", async () => {
    const { fetchFn } = fakeFetch(() => ({ body: JSON.stringify({ jsonrpc: "2.0", id: 1 }) }));
    await assert.rejects(() => getPricing({}, { fetchFn }), /neither result nor error/);
  });

  it("throws when the fetch itself fails, naming the cause", async () => {
    const fetchFn: FetchFn = async () => {
      throw new Error("connection refused");
    };
    await assert.rejects(() => getPricing({}, { fetchFn }), /upstream request .* failed: connection refused/);
  });
});
