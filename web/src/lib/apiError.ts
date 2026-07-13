import { NextResponse } from "next/server";
import { AuthError } from "./household";

// One place to turn an AuthError into a response, so every route returns the
// same shape and no route accidentally leaks a 500 for a plain 401/403.
export function apiError(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
