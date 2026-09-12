/**
 * Next.js runs `register()` ONCE per server process, before the first request
 * and before any route module is evaluated. That makes it the only correct
 * place for setup that must be true of the whole process rather than of one
 * import.
 *
 * ── WHY THE TLS CHAIN LIVES HERE AND NOT IN lib/pocketbase.ts ─────────────
 *
 * It was in lib/pocketbase.ts first, which reads as the obvious home: the
 * certificate problem is a PocketBase problem. The production build refused it:
 *
 *     the chunking context (unknown) does not support external modules
 *     (request: node:tls)
 *
 *     Client Component Browser:
 *       ./src/lib/pocketbase.ts  <- ./src/lib/consent.ts
 *                                <- ./src/app/signup/page.tsx
 *
 * lib/pocketbase.ts says at the top of the file that it is server-side only,
 * and it is — but lib/consent.ts imports three functions from it and ALSO
 * exports the purpose constants that the signup form renders, so the client
 * graph reaches it anyway. That was survivable while the module imported
 * nothing but `fetch`. `node:tls` is not survivable in a browser bundle, and
 * the build is right to say so.
 *
 * Moving the call here fixes it properly rather than by suppression: the
 * instrumentation hook is never part of a client bundle, and "install this
 * before the process makes its first outbound connection" is a more honest
 * description of the requirement than "install this when someone imports the
 * PocketBase client" ever was.
 */
export async function register() {
  // Also invoked for the edge runtime, which has no node:tls and no need of it
  // — nothing there talks to PocketBase.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { installLedgerCertificateChain } = await import("./lib/tlsChain");
  installLedgerCertificateChain();
}
