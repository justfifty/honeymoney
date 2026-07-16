// Honey "what-if" co-pilot — natural-language questions answered grounded in the
// household's OWN graph + projection, never invented numbers. Marital-safe and
// advice-free by construction (see COPILOT_SYSTEM). Falls back to a deterministic
// answer for the common "can we afford RM X?" / "what if income drops N%?" cases
// so the demo never dies when no AI key is set.

import { aiGenerate } from "./ai";
import { getBucketProjection } from "./projection";
import { pbList, pbStr } from "./pocketbase";
import { isProviderConfigured, activeAiProvider } from "./config";
import { STATUTORY_FACTS, isStatutoryQuestion, statutoryAnswer } from "./statutory";
import type { Locale } from "./i18n";
import type { BucketProjection } from "./types";

export interface HoneyAnswer {
  answer: string;
  source: "ai" | "rule-based";
}

const round = (v: number) => Math.round(v * 100) / 100;

const COPILOT_SYSTEM = `You are "Honey", HoneyMoney's marital-safe financial wellness companion.
Answer the household's question grounded ONLY in the numbers you are given — never invent figures.
Rules:
- Educational, NOT financial advice. Never say "you should buy/sell/invest in X". Offer options and
  trade-offs framed as questions the couple decides together.
- Marital-safe: never blame a spouse, never interrogate past personal spending, never itemise the
  Spendings bucket. Talk about the shared plan, not the person.
- Forward-looking: reason about the month-end projection and headroom, not judgement.
- For "can we afford X", compare X to the projected headroom and say what it would take (spread over
  months, or rebalance) — as their choice.
- 2-4 short sentences. Use RM. If the numbers can't answer it, say so plainly.`;

async function totalMonthlyIncome(tenantId: string): Promise<number> {
  const nodes = await pbList<{ kind: string; props: Record<string, unknown> | null }>("nodes", {
    filter: `tenant = ${pbStr(tenantId)} && kind = 'income_source'`,
  });
  return nodes.reduce((s, n) => s + (Number(n.props?.monthly_amount) || 0), 0);
}

function headroomOf(projection: BucketProjection[]): number {
  return round(projection.reduce((s, b) => s + Math.max(0, b.projected_balance), 0));
}

function buildContext(projection: BucketProjection[], income: number): string {
  const lines = projection.map(
    (b) =>
      `- ${b.bucket_label}: allocated RM${b.allocated}, projected spend RM${b.projected_spend}, ` +
      `projected balance RM${b.projected_balance} (${b.status})`,
  );
  return `Monthly income: RM${round(income)}\nBuckets:\n${lines.join("\n")}\nProjected headroom this month: RM${headroomOf(projection)}`;
}

export async function askHoney(
  question: string,
  tenantId: string,
  locale: Locale = "en",
): Promise<HoneyAnswer> {
  const [projection, income] = await Promise.all([
    getBucketProjection(tenantId),
    totalMonthlyIncome(tenantId),
  ]);

  const statutory = isStatutoryQuestion(question);

  if (!isProviderConfigured(activeAiProvider())) {
    return { answer: ruleBasedAnswer(question, projection, income, statutory), source: "rule-based" };
  }
  try {
    const langLine = locale === "en" ? "" : `\n\nReply in the user's language.`;
    // For statutory questions, ground the model in the verified fact block so it
    // never invents an EPF/SOCSO/EIS rate.
    const facts = statutory ? `\n\n${STATUTORY_FACTS}` : "";
    const answer = await aiGenerate(
      `Household position:\n${buildContext(projection, income)}${facts}\n\nQuestion: ${question}\n\nAnswer now, grounded in these numbers.${langLine}`,
      { system: COPILOT_SYSTEM, fn: "askHoney", meta: { tenantId, source: "web" } },
    );
    return { answer, source: "ai" };
  } catch {
    return { answer: ruleBasedAnswer(question, projection, income, statutory), source: "rule-based" };
  }
}

// Deterministic, marital-safe answers for the two highest-value question shapes.
// English only — the AI path handles other languages; this is the graceful
// zero-token floor so a demo without keys still shows a grounded answer.
function ruleBasedAnswer(
  question: string,
  projection: BucketProjection[],
  income: number,
  statutory: boolean,
): string {
  const q = question.toLowerCase();
  const headroom = headroomOf(projection);
  const allocated = round(projection.reduce((s, b) => s + b.allocated, 0));

  // Malaysian statutory: answer from the verified figures if a wage is present,
  // otherwise fall through to the general grounded reply.
  if (statutory) {
    const wageMatch = q.match(/rm\s*([\d,]+(?:\.\d+)?)/) || q.match(/\b(\d{3,}(?:,\d{3})*(?:\.\d+)?)\b/);
    if (wageMatch) return statutoryAnswer(round(parseFloat(wageMatch[1].replace(/,/g, ""))));
    return `EPF for a Malaysian under 60 is 11% employee + 12–13% employer; SOCSO ~0.5% and EIS 0.2% (employee), both table-based to a RM6,000 ceiling. Tell me a monthly wage (e.g. "EPF on RM4,000?") and I'll estimate your take-home. 2025 figures — confirm on KWSP/PERKESO. Educational, not advice.`;
  }

  // "what if income drops N%"
  const pctMatch = q.match(/(\d+)\s*%/);
  if (pctMatch && /(income|salary|gaji|pay|drop|cut|lose|lost)/.test(q)) {
    const pct = Number(pctMatch[1]);
    const newIncome = round(income * (1 - pct / 100));
    const gap = round(allocated - newIncome);
    return gap > 0
      ? `If income dropped ${pct}% (to about RM${newIncome}/mo), your current plan of RM${allocated} would be short by about RM${gap}. You could rebalance the plan together or ease a flexible bucket — your call, no rush.`
      : `If income dropped ${pct}% (to about RM${newIncome}/mo), your plan of RM${allocated} still fits, with about RM${Math.abs(gap)} to spare. Want to route the difference into Savings?`;
  }

  // "can we afford RM X" — pull the first money-looking number
  const amtMatch = q.match(/rm\s*([\d,]+(?:\.\d+)?)/) || q.match(/\b(\d{2,}(?:,\d{3})*(?:\.\d+)?)\b/);
  if (amtMatch) {
    const amount = round(parseFloat(amtMatch[1].replace(/,/g, "")));
    if (amount <= headroom) {
      return `RM${amount} fits within about RM${headroom} of projected headroom this month. Taking it from a flexible bucket keeps your Savings on track — up to you both.`;
    }
    const over = round(amount - headroom);
    const months = Math.max(2, Math.ceil(amount / Math.max(1, headroom)));
    return `RM${amount} is about RM${over} more than this month's projected headroom (RM${headroom}). You could spread it over roughly ${months} months, or rebalance the plan — whichever feels right for you two.`;
  }

  const summary = projection.length
    ? projection.map((b) => `${b.bucket_label} ${b.status.replace(/_/g, " ")}`).join(", ")
    : "no buckets set up yet";
  return `Here's where the month is heading: ${summary}. Try asking "can we afford RM2000 for a trip?" or "what if income drops 20%?" — I'll check it against your plan. (Turn on AI in Setup for free-form questions.)`;
}
