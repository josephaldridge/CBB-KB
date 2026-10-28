import { NextResponse } from "next/server";
import { checkPin } from "@/lib/kb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Proxies KB assistant questions to Google AI Studio (Gemini). The API key
// stays server-side; the client only ever sends the question plus the KB
// excerpts the retrieval layer already matched. If the key is missing or the
// upstream call fails (rate limits on the free tier), the client falls back
// to retrieval-only answers.
// Free-tier capacity varies by model; lite models answer in ~10-15s while full
// flash models can queue for minutes, so try lite models in order.
const MODELS = (process.env.GEMINI_MODEL || "gemini-flash-lite-latest,gemini-3.5-flash-lite")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const DEADLINE_MS = 24000;

const SYSTEM = `You are the Cowboy KB Assistant, the internal knowledge-base helper for Cowboy Bail Bonds staff (bond advisors, closers, underwriters).

Rules:
- Answer ONLY from the KB excerpts provided in the message. They are the company's official playbook.
- If the excerpts don't contain the answer, say so plainly and suggest what to search or who to ask — never invent policy, numbers, fees, or phone numbers.
- Be direct and practical, like a sharp coworker: short answer first, then any steps or caveats.
- When quoting fees, amounts, or phone numbers, repeat them exactly as written in the excerpts.
- Mention which article the answer comes from when it helps (e.g., "per the Quoting Guide").
- Formatting: plain sentences, "-" bullets, "1." numbered steps, and **bold** only. No tables, no links, no headings unless truly needed (use "## " if so). Keep answers under 200 words unless steps demand more.`;

export async function POST(req) {
  if (!checkPin(req)) {
    return NextResponse.json({ error: "PIN required" }, { status: 401 });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }
  try {
    const { question, chunks, history } = await req.json();
    if (!question || typeof question !== "string" || question.length > 600) {
      return NextResponse.json({ error: "Bad question" }, { status: 400 });
    }

    const context = (Array.isArray(chunks) ? chunks : [])
      .slice(0, 6)
      .map((c, i) => `[Excerpt ${i + 1} — ${String(c.path || "")} › ${String(c.title || "")}]\n${String(c.text || "").slice(0, 2400)}`)
      .join("\n\n---\n\n")
      .slice(0, 20000);

    const contents = [];
    for (const h of (Array.isArray(history) ? history : []).slice(-3)) {
      if (h && typeof h.q === "string" && typeof h.a === "string") {
        contents.push({ role: "user", parts: [{ text: h.q.slice(0, 600) }] });
        contents.push({ role: "model", parts: [{ text: h.a.slice(0, 1200) }] });
      }
    }
    contents.push({
      role: "user",
      parts: [{ text: `KB EXCERPTS:\n\n${context}\n\nSTAFF QUESTION: ${question}` }],
    });

    const payload = JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM }] },
      contents,
      generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
    });
    const started = Date.now();
    let lastStatus = 0;
    for (const model of MODELS) {
      const remaining = DEADLINE_MS - (Date.now() - started);
      if (remaining < 3000) break;
      let r;
      try {
        r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            signal: AbortSignal.timeout(remaining),
          }
        );
      } catch {
        lastStatus = 504;
        break;
      }
      if (!r.ok) {
        lastStatus = r.status;
        continue;
      }
      const data = await r.json();
      const answer = (data.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || "")
        .join("")
        .trim();
      if (answer) return NextResponse.json({ answer, model });
      lastStatus = 204;
    }
    return NextResponse.json({ error: "Upstream error", status: lastStatus }, { status: 502 });
  } catch (err) {
    return NextResponse.json({ error: "Chat failed", detail: String(err) }, { status: 500 });
  }
}
