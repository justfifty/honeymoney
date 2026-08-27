import { NextResponse } from "next/server";
import { AuthError } from "./household";
import { LocalOnlyRefused } from "./graph";

// One place to turn an AuthError into a response, so every route returns the
// same shape and no route accidentally leaks a 500 for a plain 401/403.
export function apiError(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // A local-only household refusing a write is the system working, not
  // failing. Handled HERE rather than in each route so every write path --
  // graph, CSV import, statement commit, the Telegram bot -- returns the same
  // 409 with the same shape, and a route added later gets it without being
  // told. A 500 would have told the user their import crashed when in fact it
  // was declined exactly as they asked.
  if (err instanceof LocalOnlyRefused) {
    return NextResponse.json(
      { error: err.message, storageMode: err.storageMode, storeLocallyAt: "/vault" },
      { status: 409 },
    );
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
