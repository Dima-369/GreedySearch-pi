/**
 * Shared types, utilities, and runSearch for Pi tool handlers
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProgressUpdate, ToolResult } from "../types.js";

export type { ProgressUpdate, ToolResult } from "../types.js";

export { ALL_ENGINES } from "../search/constants.mjs";

/**
 * Check if the CDP module is available in the package directory
 */
export function cdpAvailable(baseDir: string): boolean {
	return existsSync(join(baseDir, "bin", "cdp.mjs"));
}

/**
 * Create a "cdp missing" error result
 */
export function cdpMissingResult(): ToolResult {
	return {
		content: [
			{
				type: "text",
				text: "cdp.mjs missing — try reinstalling: pi install git:github.com/apmantza/GreedySearch-pi",
			},
		],
		details: {} as Record<string, unknown>,
	};
}

/**
 * Create an error result with a message
 */
export function errorResult(prefix: string, e: unknown): ToolResult {
	const msg = e instanceof Error ? e.message : String(e);
	return {
		content: [{ type: "text", text: `${prefix}: ${msg}` }],
		details: {} as Record<string, unknown>,
	};
}

/**
 * Spawn search.mjs and collect JSON results, with progress streaming via stderr.
 * Shared by greedy_search and deep_research tool handlers.
 */
export function runSearch(
	engine: string,
	query: string,
	flags: string[],
	searchBin: string,
	signal?: AbortSignal,
	onProgress?: (engine: string, status: "done" | "error") => void,
): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const proc = spawn(
			"node",
			[searchBin, engine, "--inline", ...flags, query],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		let out = "";
		let err = "";

		const onAbort = () => {
			proc.kill("SIGTERM");
			reject(new Error("Aborted"));
		};
		signal?.addEventListener("abort", onAbort, { once: true });

		let stderrBuffer = "";
		proc.stderr.on("data", (d: Buffer) => {
			err += d;
			stderrBuffer += d.toString();
			const lines = stderrBuffer.split("\n");
			stderrBuffer = lines.pop() ?? "";
			for (const line of lines) {
				const match = line.match(/^PROGRESS:(\w+):(done|error)$/);
				if (match && onProgress) {
					onProgress(match[1], match[2] as "done" | "error");
				}
			}
		});

		proc.stdout.on("data", (d: Buffer) => (out += d));
		proc.on("close", (code: number) => {
			signal?.removeEventListener("abort", onAbort);
			if (code !== 0) {
				reject(new Error(err.trim() || `search.mjs exited with code ${code}`));
			} else {
				try {
					resolve(JSON.parse(out.trim()));
				} catch {
					reject(new Error(`Invalid JSON from search.mjs: ${out.slice(0, 200)}`));
				}
			}
		});
	});
}

/**
 * Build a progress callback that tracks completed engines.
 * Returns an onProgress function suitable for runSearch.
 */
export function makeProgressTracker(
	engines: readonly string[],
	onUpdate: ((update: ProgressUpdate) => void) | undefined,
	query?: string,
) {
	const completed = new Map<string, "done" | "error">();

	const buildText = (parts: string[]) => {
		const engineLine = parts.join(" · ");
		return query ? `${query}\n${engineLine}` : engineLine;
	};

	// Emit initial progress update
	onUpdate?.({
		content: [
			{ type: "text", text: buildText(engines.map((e) => "⏳ " + e)) },
		],
		details: { _progress: true },
	} satisfies ProgressUpdate);

	return (eng: string, status: "done" | "error") => {
		// Store the status for this specific engine
		completed.set(eng, status);
		
		const parts: string[] = [];
		for (const e of engines) {
			if (completed.has(e)) {
				const eStatus = completed.get(e)!;
				const icon = eStatus === "error" ? "❌" : "✅";
				parts.push(`${icon} ${e} ${eStatus}`);
			} else {
				parts.push(`⏳ ${e}`);
			}
		}

		onUpdate?.({
			content: [
				{ type: "text", text: buildText(parts) },
			],
			details: { _progress: true },
		} satisfies ProgressUpdate);
	};
}