// Can we read our users' backups? — the check that answers "no" with evidence.
//
//   npm run check:vault
//
// The product is now sold as software rather than as a place to keep money
// records, and the sealed backup is where that claim stops being a sentence in
// a deck. A sentence is worth what it can be checked against, so this runs the
// REAL cipher over a REAL export shape and asserts the things a sceptic would
// ask about:
//
//   • the ciphertext contains no fragment of the plaintext — not a vendor name,
//     not an amount, not an email
//   • the wrong passphrase fails, and fails the same way tampering does
//   • editing the envelope's own parameters — dropping 600,000 PBKDF2 rounds to
//     1, the cheapest possible downgrade attack — makes it refuse to open
//   • two seals of the same data are different bytes (a fresh salt and IV each
//     time; identical blobs would leak that nothing changed between backups)
//   • the server REFUSES a plaintext payload, which is the mistake our own
//     future code is most likely to make
//
// It needs no database and no key: everything here is the same isomorphic
// WebCrypto the browser runs, which is the point — if it needed a secret to
// verify, it would be verifying the wrong thing.

import {
  seal,
  sealVerified,
  open as unseal,
  isSealedVault,
  looksEncrypted,
  passphraseStrength,
  fromB64,
  toB64,
  WrongPassphrase,
  KDF_ITERATIONS,
} from "../src/lib/e2ee.ts";
import { assertOpaque, NotSealed, MAX_ENVELOPE_BYTES } from "../src/lib/vault.ts";

let fail = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${name}${detail && !cond ? "  — " + detail : ""}`);
  if (!cond) fail++;
};

// A household export, in the shape /api/account/export actually produces. The
// strings below are what a grep of the ciphertext must not find.
const SECRETS = ["99 Speedmart", "siti@example.com", "6500", "Personal — Siti", "Tabung Haji"];
const EXPORT = JSON.stringify({
  exportedAt: "2026-08-27T02:00:00.000Z",
  format: "honeymoney.export.v1",
  account: { id: "u1", email: "siti@example.com" },
  members: [{ id: "m1", display_name: "Siti" }],
  nodes: [
    { id: "n1", kind: "income_source", label: "Siti — Salary", props: { monthly_amount: 6500 } },
    { id: "n2", kind: "bucket", label: "Personal — Siti", props: { bucket: 3 } },
    { id: "n3", kind: "goal", label: "Tabung Haji", props: { target: 20000 } },
  ],
  transactions: Array.from({ length: 200 }, (_, i) => ({
    id: `t${i}`,
    amount: 12.5 + i,
    vendor: "99 Speedmart",
    occurred_at: "2026-08-01 12:00:00",
  })),
});

const PASS = "correct horse battery staple";

console.log("\n1. sealing:");
const vault = await sealVerified(EXPORT, PASS);
ok("the envelope is well formed", isSealedVault(vault));
ok("it is AES-256-GCM", vault.cipher === "AES-256-GCM");
ok(`it uses ${KDF_ITERATIONS.toLocaleString()} PBKDF2 rounds`, vault.kdf.iterations === KDF_ITERATIONS);
ok("the ciphertext looks like ciphertext", looksEncrypted(fromB64(vault.ct)));

console.log("\n2. what a person with the database sees:");
const stored = JSON.stringify(vault);
for (const secret of SECRETS) {
  ok(`"${secret}" appears nowhere in the stored row`, !stored.includes(secret));
}
// Not just the JSON — the decoded bytes, in case base64 hid a substring across
// a boundary. Checked as latin-1 so every byte value is comparable as a char.
const rawBytes = fromB64(vault.ct);
const asText = Array.from(rawBytes, (b) => String.fromCharCode(b)).join("");
for (const secret of SECRETS) {
  ok(`…nor in the decoded ciphertext ("${secret}")`, !asText.includes(secret));
}
ok(
  "the sealed copy is smaller than the plaintext (compressed before sealing)",
  vault.ct.length < EXPORT.length,
  `${vault.ct.length} vs ${EXPORT.length}`,
);

console.log("\n3. opening:");
ok("the right passphrase returns exactly what went in", (await unseal(vault, PASS)) === EXPORT);
let wrongThrew = false;
try {
  await unseal(vault, "correct horse battery stapler");
} catch (e) {
  wrongThrew = e instanceof WrongPassphrase;
}
ok("a wrong passphrase is refused", wrongThrew);

const again0Salt = (await seal("x", PASS)).kdf.salt;
console.log("\n4. tampering with the envelope:");
// The downgrade attack: hand the file back with a weaker KDF and let the client
// derive the weakened key itself. The parameters are bound as AAD, so this must
// fail rather than quietly succeed at 1 round.
// Two floors, and both must hold. Below 100,000 rounds the envelope is not
// even accepted as a HoneyMoney backup, so the attempt is refused before a key
// is derived at all; above it, the AAD binding is what refuses. Asserting only
// the second would leave the cheap attack untested, and asserting a specific
// error class would let a change in WHICH refusal fires look like a regression
// when the requirement is simply that it does not open.
const refuses = async (v: Parameters<typeof unseal>[0]) => {
  try {
    await unseal(v, PASS);
    return false;
  } catch {
    return true;
  }
};
ok("1 round is not even a valid envelope", await refuses({ ...vault, kdf: { ...vault.kdf, iterations: 1 } }));
ok(
  "a downgrade inside the accepted range refuses to open",
  await refuses({ ...vault, kdf: { ...vault.kdf, iterations: 100_000 } }),
);
let saltSwapThrew = false;
try {
  await unseal({ ...vault, kdf: { ...vault.kdf, salt: again0Salt } }, PASS);
} catch (e) {
  saltSwapThrew = e instanceof WrongPassphrase;
}
ok("a swapped salt refuses to open", saltSwapThrew);

let flipThrew = false;
try {
  const bytes = fromB64(vault.ct);
  bytes[Math.floor(bytes.length / 2)] ^= 0x01; // one bit, in the middle
  await unseal({ ...vault, ct: toB64(bytes) }, PASS);
} catch (e) {
  flipThrew = e instanceof WrongPassphrase;
}
ok("one flipped bit refuses to open", flipThrew);

console.log("\n5. two backups of the same data:");
const again = await seal(EXPORT, PASS);
ok("are different bytes", again.ct !== vault.ct);
ok("because the salt is fresh", again.kdf.salt !== vault.kdf.salt);
ok("and so is the IV", again.iv !== vault.iv);
ok("both still open", (await unseal(again, PASS)) === EXPORT);

console.log("\n6. the server's tripwire — our own mistakes, not the client's:");
let plaintextRefused = "";
try {
  // The realistic bug: someone wires /api/account/export straight into the
  // backup endpoint. The envelope is perfectly well formed; only `ct` is wrong.
  assertOpaque({ ...vault, ct: toB64(new TextEncoder().encode(EXPORT)) });
} catch (e) {
  plaintextRefused = e instanceof NotSealed ? e.message : "";
}
ok("a plaintext payload in a valid envelope is refused", plaintextRefused.includes("not encrypted"), plaintextRefused);

let shapeRefused = false;
try {
  assertOpaque({ format: "honeymoney.export.v1", transactions: [] });
} catch (e) {
  shapeRefused = e instanceof NotSealed;
}
ok("a raw export posted as a backup is refused", shapeRefused);

let sizeRefused = false;
try {
  assertOpaque({ ...vault, ct: "A".repeat(MAX_ENVELOPE_BYTES + 8) });
} catch (e) {
  sizeRefused = e instanceof NotSealed;
}
ok("an oversized payload is refused", sizeRefused);
ok("a real sealed envelope passes", Boolean(assertOpaque(vault)));

console.log("\n7. passphrase strength gates rather than decorates:");
ok("'password' is rejected", !passphraseStrength("password").ok);
ok("'Passw0rd!' is rejected too", !passphraseStrength("Passw0rd!").ok);
ok("four words are accepted", passphraseStrength("correct horse battery staple").ok);
ok("a long random string is accepted", passphraseStrength("Jf8#qz2Lm!vX7pR4").ok);

console.log("");
if (fail) {
  console.log(`${fail} failure(s).`);
  process.exit(1);
}
console.log("The backup is sealed on the device: we store ciphertext and hold no key.");
