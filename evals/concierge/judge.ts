import type Anthropic from "@anthropic-ai/sdk";

import { env } from "@/lib/env";

/**
 * LLM-judge for fact cases where phrasing varies too much for a substring check
 * (#33). ADVISORY only — the deterministic grader is the hard gate. One cheap
 * Haiku call returning {pass, reason}; defaults to a failed-but-reported verdict
 * if the judge response can't be parsed (never throws into the gate).
 */
export async function judgeFact(
  client: Anthropic,
  args: { question: string; answer: string; expected: string },
): Promise<{ pass: boolean; reason: string }> {
  const prompt =
    `You grade a Thai pool-villa concierge answer against a ground-truth fact. ` +
    `Allow paraphrase and extra context; fail only if the fact is wrong, missing, or fabricated.\n\n` +
    `Question: ${args.question}\n` +
    `Ground-truth fact: ${args.expected}\n` +
    `Answer: ${args.answer}\n\n` +
    `Reply with ONLY JSON: {"pass": true|false, "reason": "<short>"}`;

  try {
    const res = await client.messages.create({
      model: env.CONCIERGE_MODEL,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content.find((b) => b.type === "text");
    const raw = text && text.type === "text" ? text.text : "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { pass: false, reason: `unparseable judge reply: ${raw.slice(0, 80)}` };
    const parsed = JSON.parse(match[0]) as { pass?: boolean; reason?: string };
    return { pass: parsed.pass === true, reason: parsed.reason ?? "" };
  } catch (e) {
    return { pass: false, reason: `judge error: ${e instanceof Error ? e.message : "unknown"}` };
  }
}
