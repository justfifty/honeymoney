/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — AI token usage ledger.
// One row per Gemini call, so the team owns a queryable, exportable record of
// runtime AI consumption (for the MAIC AI disclosure + a "cost per household"
// commercial metric). Written by web/src/lib/gemini.ts; superuser-only like the
// rest of the schema (never exposed to browsers).

migrate(
  (app) => {
    const aiUsage = new Collection({
      type: "base",
      name: "ai_usage",
      fields: [
        { type: "text", name: "fn", required: true }, // parseReceipt | honeyInsight
        { type: "text", name: "model" },
        { type: "number", name: "prompt_tokens" },
        { type: "number", name: "output_tokens" },
        { type: "number", name: "total_tokens" },
        { type: "text", name: "tenant" }, // household/business id when known
        { type: "text", name: "source" }, // web | telegram | …
        { type: "bool", name: "ok" }, // did the call succeed
        { type: "autodate", name: "created", onCreate: true },
      ],
      indexes: ["CREATE INDEX idx_ai_usage_created ON ai_usage (created)"],
    });
    app.save(aiUsage);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("ai_usage"));
    } catch (_) {
      /* already gone */
    }
  },
);
