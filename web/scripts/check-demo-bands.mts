import { buildAllPersonas, scoreFor, PERSONA_ORDER } from "../src/lib/demoData.ts";

const asOf = new Date();
const all = buildAllPersonas(asOf);
let fail = 0;

console.log("as of", asOf.toISOString().slice(0, 10), "\n");
for (const key of PERSONA_ORDER) {
  const p = all[key];
  const { hscore, inputs } = scoreFor(p, asOf);
  const ok = hscore.band === p.targetBand;
  if (!ok) fail++;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${key.padEnd(11)} score=${String(hscore.score).padStart(3)} band=${hscore.band.padEnd(9)} want=${p.targetBand.padEnd(9)} txns=${p.ledger.length}`,
  );
  console.log(
    "        " +
      hscore.subScores
        .map((s) => `${s.key}=${s.points}/${s.max}(${s.isRatio ? Math.round(s.measure * 100) + "%" : Math.round(s.measure * 100) / 100})`)
        .join("  "),
  );
  console.log(
    `        net=${inputs.netIncomeMonthly} save=${Math.round(inputs.savingsMonthly)} must=${Math.round(inputs.mustPaidMonthly)} debt=${Math.round(inputs.debtRepaymentsMonthly)} liquid=${inputs.liquidSavings} cap=${inputs.privacyCapMonthly} priv=[${inputs.privacyTrailing3.map(Math.round)}]`,
  );
  console.log(`        confidence: ok=${hscore.confidence.ok} missing=[${hscore.confidence.missing}] txns30d=${hscore.confidence.txns30d}`);
  console.log("");
}

// Stability: the band must hold on every day of the coming year, or a judge
// opening the demo on the wrong date sees the wrong story.
let drift = 0;
for (let d = 0; d < 365; d += 1) {
  const day = new Date(asOf.getTime() + d * 86400000);
  const set = buildAllPersonas(day);
  for (const key of PERSONA_ORDER) {
    const p = set[key];
    if (scoreFor(p, day).hscore.band !== p.targetBand) {
      if (drift < 8) console.log("DRIFT", day.toISOString().slice(0, 10), key, scoreFor(p, day).hscore.score, "->", scoreFor(p, day).hscore.band);
      drift++;
    }
  }
}
console.log(`\nband drift over the next 365 days: ${drift} day/persona combinations out of ${365 * 4}`);
process.exit(fail || drift ? 1 : 0);
