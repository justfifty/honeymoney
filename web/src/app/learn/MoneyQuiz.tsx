"use client";

import { useEffect, useState } from "react";

// A kid-friendly money-management quiz. Educational, not advice; scores LEARNING
// only (never wealth or real spending), stores nothing but a local best score, and
// gives a one-line "why" after every answer so a wrong pick still teaches. A safe,
// zero-personal-data first step toward HoneyMoney Academy; an opt-in family/peer
// leaderboard is a later, consent-designed addition.

interface Q {
  q: string;
  options: string[];
  correct: number;
  why: string;
}

// 3-bucket model + wise-spending fundamentals, Malaysia-flavoured, age-friendly.
const QUESTIONS: Q[] = [
  {
    q: "You get RM50 for Raya. What's the smartest first move?",
    options: ["Spend it all today", "Save some before you spend", "Lend it to a friend", "Buy the most expensive thing you see"],
    correct: 1,
    why: "Pay yourself first — set aside savings before spending. That's the Savings bucket in action.",
  },
  {
    q: "Which of these is a NEED, not a want?",
    options: ["A new phone game", "School shoes that fit", "The latest sneakers", "Bubble tea every day"],
    correct: 1,
    why: "Needs come first (Must-paid bucket). Shoes you need for school beat things that are just nice to have.",
  },
  {
    q: "HoneyMoney splits money into three buckets. Which is right?",
    options: ["Food · Fun · Games", "Must-paid · Savings · Spendings", "Cash · Card · Coins", "Now · Later · Never"],
    correct: 1,
    why: "Must-paid (bills), Savings (set aside first), and Spendings (your free choices).",
  },
  {
    q: "A toy is RM30 at one shop and RM45 at another for the exact same toy. You should…",
    options: ["Buy the RM45 one", "Compare and buy the RM30 one", "Buy both", "Never buy toys"],
    correct: 1,
    why: "Comparing prices for the same item is smart spending — same toy, RM15 saved.",
  },
  {
    q: "What is an 'emergency fund'?",
    options: ["Money for a party", "Savings kept for surprises like a broken bike", "Money you must spend fast", "A type of game"],
    correct: 1,
    why: "An emergency fund is savings you keep for unexpected costs, so a surprise doesn't become a crisis.",
  },
  {
    q: "You really want a RM120 game but only have RM40. The wise move is…",
    options: ["Borrow RM80 you can't repay", "Save a bit each week until you can afford it", "Forget saving forever", "Take money without asking"],
    correct: 1,
    why: "Saving toward a goal (delayed gratification) beats debt you can't repay. Small amounts add up.",
  },
  {
    q: "'Wants' spending in HoneyMoney goes in which bucket?",
    options: ["Must-paid", "Savings", "Spendings", "None — wants are banned"],
    correct: 2,
    why: "Spendings is your free bucket — wants are okay, as long as needs and savings are handled first.",
  },
  {
    q: "Why is it good to track where your money goes?",
    options: ["To feel bad about it", "To see your choices and plan ahead", "So others can judge you", "It isn't useful"],
    correct: 1,
    why: "Knowing your plan helps you decide ahead of time — planning, not policing.",
  },
  {
    q: "A shop says 'Buy 3, only RM60!' but you only need 1 (RM25). What's smart?",
    options: ["Buy 3 to 'save'", "Buy just the 1 you need", "Buy 6", "Buy nothing ever"],
    correct: 1,
    why: "A 'deal' that makes you spend more than you need isn't a saving. Buy what you actually need.",
  },
  {
    q: "The best reason to save money is…",
    options: ["To show off", "To reach goals and handle surprises", "Because saving is boring", "To never spend again"],
    correct: 1,
    why: "Saving gives you choices — reaching goals and staying safe when surprises come.",
  },
];

const BEST_KEY = "hm-quiz-best";

function tier(pct: number): { label: string; emoji: string } {
  if (pct >= 90) return { label: "Money Whiz!", emoji: "🏆" };
  if (pct >= 70) return { label: "Smart Saver", emoji: "🌟" };
  if (pct >= 50) return { label: "Getting There", emoji: "🌱" };
  return { label: "Keep Learning", emoji: "📚" };
}

export default function MoneyQuiz() {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [best, setBest] = useState<number | null>(null);

  useEffect(() => {
    const b = Number(localStorage.getItem(BEST_KEY));
    if (b > 0) setBest(b);
  }, []);

  const total = QUESTIONS.length;
  const question = QUESTIONS[i];

  function pick(idx: number) {
    if (picked !== null) return;
    setPicked(idx);
    if (idx === question.correct) setScore((s) => s + 1);
  }

  function next() {
    if (i + 1 >= total) {
      const finalScore = score;
      setDone(true);
      if (best === null || finalScore > best) {
        localStorage.setItem(BEST_KEY, String(finalScore));
        setBest(finalScore);
      }
      return;
    }
    setI((n) => n + 1);
    setPicked(null);
  }

  function restart() {
    setI(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  }

  if (done) {
    const pct = Math.round((score / total) * 100);
    const t = tier(pct);
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-950/30">
        <div className="text-5xl">{t.emoji}</div>
        <h2 className="mt-2 text-xl font-bold text-amber-800 dark:text-amber-200">{t.label}</h2>
        <p className="mt-1 text-lg">
          You scored <b>{score}</b> / {total} ({pct}%)
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          Your best: {Math.max(best ?? 0, score)} / {total}
        </p>
        <button
          onClick={restart}
          className="mt-5 rounded-full bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"
        >
          Play again
        </button>
      </div>
    );
  }

  const correct = picked !== null && picked === question.correct;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>Question {i + 1} / {total}</span>
        <span>Score {score}{best !== null && <span className="ml-2 text-amber-500">· best {best}</span>}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className="h-full bg-amber-500 transition-all" style={{ width: `${((i + 1) / total) * 100}%` }} />
      </div>

      <h2 className="mt-4 text-lg font-semibold">{question.q}</h2>
      <div className="mt-4 grid gap-2">
        {question.options.map((opt, idx) => {
          const isPicked = picked === idx;
          const isAnswer = idx === question.correct;
          const show = picked !== null;
          const cls = !show
            ? "border-zinc-200 hover:border-amber-400 dark:border-zinc-700"
            : isAnswer
              ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
              : isPicked
                ? "border-rose-300 bg-rose-50 dark:bg-rose-950/30"
                : "border-zinc-200 opacity-60 dark:border-zinc-700";
          return (
            <button
              key={idx}
              onClick={() => pick(idx)}
              disabled={show}
              className={`rounded-xl border px-4 py-2.5 text-left text-sm transition-colors ${cls}`}
            >
              {show && isAnswer && "✅ "}
              {show && isPicked && !isAnswer && "❌ "}
              {opt}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
          <p className="font-medium text-amber-800 dark:text-amber-200">{correct ? "Nice! " : "Good try. "}{question.why}</p>
          <button
            onClick={next}
            className="mt-3 rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-600"
          >
            {i + 1 >= total ? "See my score →" : "Next question →"}
          </button>
        </div>
      )}
    </div>
  );
}
