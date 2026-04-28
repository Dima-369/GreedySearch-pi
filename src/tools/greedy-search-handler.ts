/**
 * greedy_search tool handler — multi-engine AI web search
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { formatResults } from "../formatters/results.js";
import { ALL_ENGINES, cdpAvailable, cdpMissingResult, errorResult, makeProgressTracker, runSearch } from "./shared.js";

export function registerAiSearchTool(pi: ExtensionAPI, baseDir: string) {
	pi.registerTool({
		name: "ai_search",
		label: "AI Search",
		description:
			"Multi-engine web search via Perplexity, Bing Copilot, and Google AI in parallel. " +
			"Use for: library docs, recent framework changes, error messages, best practices, current events.",
		promptSnippet: "Multi-engine web search (Perplexity, Bing, Google AI)",
		parameters: Type.Object({
			query: Type.String({ description: "The search query" }),
			// engine: Type.Union(
			// 		[Type.Literal("all"), Type.Literal("perplexity"), Type.Literal("bing"), Type.Literal("google")],
			// 		{ description: 'Engine to use. "all" fans out to Perplexity, Bing, and Google in parallel (default).', default: "all" },
			// ),
			// depth: Type.Union(
			// 		[Type.Literal("fast"), Type.Literal("standard"), Type.Literal("deep")],
			// 		{ description: "Search depth: fast (single engine, ~15-30s), standard (3 engines + synthesis, ~30-90s), deep (3 engines + source fetching + synthesis + confidence, ~60-180s). Default: fast.", default: "fast" },
			// ),
			// fullAnswer: Type.Optional(Type.Boolean({ description: "When true, returns the complete answer instead of a truncated preview (default: false, answers are shortened to ~300 chars to save tokens).", default: false })),
		}),
		execute: async (_toolCallId, params, signal, onUpdate) => {
			const { query } = params as { query: string };

			if (!cdpAvailable(baseDir)) return cdpMissingResult();

			const engine = "all";
			const flags: string[] = ["--full"]; // always return full output

			const onProgress = makeProgressTracker(ALL_ENGINES, onUpdate, query);

			try {
				const data = await runSearch(engine, query, flags, `${baseDir}/bin/search.mjs`, signal, onProgress);
				const text = formatResults(engine, data);
				return { content: [{ type: "text", text: text || "No results returned." }], details: { raw: data } };
			} catch (e) {
				return errorResult("Search failed", e);
			}
		},
	});
}