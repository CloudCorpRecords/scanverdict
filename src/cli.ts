#!/usr/bin/env node
/**
 * scanverdict CLI.
 *
 *   scanverdict read-scan <image_url> [--discipline <d>] [--field-note <note>]
 *   scanverdict draft-estimate <job_description> [--trade <t>]
 *   scanverdict pricing
 *   scanverdict mcp
 *
 * Each subcommand forwards one call to the hosted GroundTruth
 * endpoint (https://gtfi.ai/mcp by default, overridable via the
 * GROUNDTRUTH_MCP_URL environment variable; no authentication)
 * and prints the upstream result as JSON. Argument validation
 * happens before any network call. Exit codes: 0 success, 1
 * runtime error (including an upstream failure), 2 usage error.
 */
import {
  draftEstimate,
  formatPayload,
  getPricing,
  readScan,
  VERSION,
} from "./scanverdict.js";

function usage(): never {
  console.error(`Usage:
  scanverdict read-scan <image_url> [--discipline <gpr|locate|pipe|xray|milestone>] [--field-note <note>]
  scanverdict draft-estimate <job_description> [--trade <electrical|plumbing|hvac|general>]
  scanverdict pricing
  scanverdict mcp
  scanverdict --version`);
  process.exit(2);
}

/** Read the value after a named flag, or fail as a usage error. */
function flagValue(rest: string[], flag: string): string | undefined {
  const idx = rest.indexOf(flag);
  if (idx === -1) return undefined;
  const value = rest[idx + 1];
  if (value === undefined || value.startsWith("--")) usage();
  return value;
}

/** Positional arguments: everything that is not a flag or a flag value. */
function positionals(rest: string[], flagsWithValues: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const item = rest[i];
    if (flagsWithValues.includes(item)) {
      i++; // skip the flag's value
    } else if (item.startsWith("--")) {
      usage();
    } else {
      out.push(item);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }

  try {
    if (cmd === "pricing") {
      if (rest.length !== 0) usage();
      console.log(formatPayload(await getPricing({})));
    } else if (cmd === "read-scan") {
      const discipline = flagValue(rest, "--discipline");
      const fieldNote = flagValue(rest, "--field-note");
      const args = positionals(rest, ["--discipline", "--field-note"]);
      if (args.length !== 1) usage();
      const input: Record<string, unknown> = { image_url: args[0] };
      if (discipline !== undefined) input.discipline = discipline;
      if (fieldNote !== undefined) input.field_note = fieldNote;
      console.log(formatPayload(await readScan(input)));
    } else if (cmd === "draft-estimate") {
      const trade = flagValue(rest, "--trade");
      const args = positionals(rest, ["--trade"]);
      if (args.length !== 1) usage();
      const input: Record<string, unknown> = { job_description: args[0] };
      if (trade !== undefined) input.trade = trade;
      console.log(formatPayload(await draftEstimate(input)));
    } else {
      usage();
    }
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
