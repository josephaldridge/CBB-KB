"use client";
import React, { useState, useMemo, useRef, useEffect } from "react";
import { MessageCircle, Send, X, FileText, Sparkles } from "lucide-react";
import { Markdown } from "./KnowledgeBase";

// Domain synonyms: if the query contains any term in a group, every term in the
// group joins the search. Keeps the bot smart about how reps actually talk.
const SYNONYMS = [
  ["cost", "price", "fee", "fees", "charge", "charges", "pay", "much"],
  ["down", "downpayment", "deposit", "premium"],
  ["phone", "number", "call", "contact", "line"],
  ["jail", "detention", "lockup", "custody"],
  ["transfer", "xfr", "tbond", "t-bond", "tbonds"],
  ["ticket", "tickets", "citation", "citations", "class c"],
  ["bij", "back in jail", "rearrested", "re-arrested"],
  ["warrant", "warrants"],
  ["risk", "bf", "atgob", "fta", "ib", "pv", "mtr", "forfeiture"],
  ["geo", "bordering", "ooc", "county"],
  ["ebail", "online", "e-bail"],
  ["cosigner", "cos", "indemnitor", "cosigners", "co-signer"],
  ["notes", "note", "documentation"],
  ["follow", "followup", "follow-up", "cadence", "callback"],
  ["quote", "quoting", "obligate"],
  ["bankers", "surety", "portal"],
  ["noticourt", "nc", "court date", "reminder"],
  ["bond", "bonds", "bail"],
  ["release", "out", "released"],
  ["appointment", "appointments", "credit", "ownership"],
  ["abbreviation", "abbreviations", "stand", "mean", "means", "meaning"],
  ["17.16", "1716", "insufficient"],
  ["17.19", "1719", "off bond", "surety off"],
  ["lew", "sterrett", "dallas county jail"],
  ["tri-city", "tricity", "tri city"],
  ["payment", "plan", "promissory"],
  ["voicemail", "lvm", "dnlvm", "text", "sms"],
];

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "do", "does", "did", "what",
  "whats", "who", "whos", "how", "when", "where", "why", "can", "could",
  "should", "would", "i", "we", "you", "they", "it", "its", "to", "of", "in",
  "on", "for", "and", "or", "with", "at", "by", "from", "about", "tell", "me",
  "need", "want", "know", "get", "there", "their", "our", "your", "if", "our",
]);

function normalize(s) {
  return s.toLowerCase().replace(/[,$]/g, "").replace(/[^\w\s.\-/]/g, " ");
}

function tokenize(query) {
  const base = [...new Set(normalize(query).split(/\s+/).filter((w) => w.length >= 2 && !STOPWORDS.has(w)))];
  const extra = new Set();
  const q = " " + normalize(query) + " ";
  for (const group of SYNONYMS) {
    if (group.some((g) => q.includes(g))) group.forEach((g) => { if (g.length >= 2 && !base.includes(g)) extra.add(g); });
  }
  return { base: base.slice(0, 12), extra: [...extra].slice(0, 16) };
}

// Pinned intents: common rep questions that must hit the right article every time.
const PINNED = [
  { test: (q) => /(standard|minimum)\s*down/.test(q) || (/\bdown\b|\bpremium\b/.test(q) && /\d/.test(q)), artId: "quoting-table" },
  { test: (q) => /(phone|number|call|line)/.test(q) && /(jail|county|sterrett|tri.?city|detention|pd)/.test(q), artId: "jail-directory" },
];

function stripMd(s) {
  return s.replace(/!\[([^\]]*)\]\([^)]*\)/g, " $1 ").replace(/\*\*/g, "").replace(/^##\s+/gm, "").replace(/^[-\d.]+\s+/gm, "");
}

export default function KBChat({ data, onOpenArticle }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const scrollRef = useRef(null);

  // Build the searchable chunk index: one chunk per article section.
  const index = useMemo(() => {
    if (!data) return [];
    const firstLoc = {};
    for (const d of data.departments)
      for (const c of d.categories)
        for (const id of c.articleIds)
          if (!firstLoc[id]) firstLoc[id] = { deptId: d.id, catId: c.id, deptTitle: d.title, catTitle: c.title };

    const chunks = [];
    for (const art of Object.values(data.articles)) {
      const loc = firstLoc[art.id];
      if (!loc) continue;
      const lines = art.body.split("\n");
      let heading = "";
      let buf = [];
      const flush = () => {
        const text = buf.join("\n").trim();
        if (text) chunks.push({
          artId: art.id, artTitle: art.title, heading, md: (heading ? "## " + heading + "\n" : "") + text,
          search: normalize(stripMd(loc.deptTitle + " " + loc.catTitle + " " + art.title + " " + heading + " " + text)),
          lines: text.split("\n"), loc,
        });
        buf = [];
      };
      for (const line of lines) {
        if (line.startsWith("## ")) { flush(); heading = line.slice(3).trim(); }
        else buf.push(line);
      }
      flush();
      if (art.botNotes && art.botNotes.trim()) {
        heading = "Reference data";
        buf = [art.botNotes.trim()];
        flush();
      }
    }
    return chunks;
  }, [data]);

  const answer = (query) => {
    const { base, extra } = tokenize(query);
    const tokens = [...base, ...extra];
    const phrase = normalize(query).trim();
    if (tokens.length === 0) return { results: [] };

    const scoreToken = (ch, t, w, lcTitle, lcHead) => {
      let ts = 0;
      if (lcTitle.includes(t)) ts += 5 * w;
      if (lcHead.includes(t)) ts += 3 * w;
      let occ = 0, i = -1;
      while ((i = ch.search.indexOf(t, i + 1)) !== -1 && occ < 4) occ++;
      ts += occ * w;
      return ts;
    };

    const scored = index.map((ch) => {
      let s = 0, matched = 0;
      const lcTitle = ch.artTitle.toLowerCase();
      const lcHead = ch.heading.toLowerCase();
      for (const t of base) { const ts = scoreToken(ch, t, 1, lcTitle, lcHead); if (ts > 0) matched++; s += ts; }
      for (const t of extra) { s += scoreToken(ch, t, 0.5, lcTitle, lcHead); }
      if (matched > 1) s *= 1 + 0.3 * (matched - 1);
      if (phrase.length > 6 && ch.search.includes(phrase)) s += 8;
      return { ch, s };
    }).filter((r) => r.s >= 5).sort((a, b) => b.s - a.s);

    const seen = new Set();
    const results = [];
    // pinned intents come first
    const nq = normalize(query);
    for (const pin of PINNED) {
      if (pin.test(nq) && !seen.has(pin.artId)) {
        const hit = scored.find((r) => r.ch.artId === pin.artId)?.ch || index.find((ch) => ch.artId === pin.artId);
        if (hit) { seen.add(pin.artId); results.push(hit); }
      }
    }
    for (const r of scored) {
      if (seen.has(r.ch.artId)) continue;
      seen.add(r.ch.artId);
      results.push(r.ch);
      if (results.length === 3) break;
    }
    return { results: results.slice(0, 3), tokens };
  };

  // For long chunks (like the jail directory), show just the lines that match.
  const excerpt = (ch, tokens) => {
    const full = ch.md;
    if (full.length <= 900) return full;
    const hits = ch.lines.filter((l) => {
      const ll = normalize(l);
      return l.trim() && tokens.some((t) => ll.includes(t));
    }).slice(0, 8);
    if (hits.length) return (ch.heading ? "## " + ch.heading + "\n" : "") + hits.join("\n");
    let cut = full.slice(0, 880);
    cut = cut.slice(0, Math.max(cut.lastIndexOf("\n"), 400));
    return cut + "\n…";
  };

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q) return;
    setInput("");
    const { results, tokens } = answer(q);
    const botMsg = { role: "bot", q, results: results || [], tokens: tokens || [], pending: (results || []).length > 0 };
    setMessages((m) => [...m, { role: "user", text: q }, botMsg]);
    if (!botMsg.pending) return; // nothing matched: keep the not-found message, no AI call

    // Previous answered exchanges give the model conversational context.
    const history = [];
    setMessages((m) => {
      for (const msg of m) if (msg.role === "bot" && msg.answer && msg.q) history.push({ q: msg.q, a: msg.answer });
      return m;
    });

    let answerText = null;
    try {
      let pinVal = "";
      try { pinVal = window.localStorage.getItem("cbb-kb-pin") || ""; } catch {}
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 28000);
      const res = await fetch("/api/chat", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-kb-pin": pinVal },
        body: JSON.stringify({
          question: q,
          history: history.slice(-3),
          chunks: botMsg.results.map((ch) => {
            const notes = (data.articles[ch.artId]?.botNotes || "").trim();
            return {
              title: ch.artTitle,
              path: ch.loc.deptTitle + " · " + ch.loc.catTitle,
              text: notes && ch.heading !== "Reference data" ? ch.md + "\n\n## Reference data\n" + notes : ch.md,
            };
          }),
        }),
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data.answer) answerText = data.answer;
      }
    } catch {}

    setMessages((m) => m.map((msg) => msg === botMsg || (msg.role === "bot" && msg.pending && msg.q === q)
      ? { ...msg, pending: false, answer: answerText }
      : msg));
  };

  const msgRefs = useRef({});
  useEffect(() => {
    // Anchor the latest question at the top of the view so the answer reads top-down.
    let lastUser = -1;
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") { lastUser = i; break; }
    const el = msgRefs.current[lastUser];
    if (el) el.scrollIntoView({ block: "start" });
  }, [messages]);

  const SUGGESTIONS = [
    "What's the down payment on a $10,000 bond?",
    "What does ATGOB stand for?",
    "Phone number for Lew Sterrett",
    "How do I post a transfer bond?",
  ];

  return (
    <>
      {/* floating launcher */}
      {!open && (
        <button onClick={() => setOpen(true)} title="Ask the KB"
          className="fixed bottom-6 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#1B2E6B] text-white shadow-lg transition hover:bg-[#24408f]">
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[600px] max-h-[calc(100vh-3rem)] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-[#1B2E6B]/15">
          {/* header */}
          <div className="flex items-center justify-between border-b border-[#1B2E6B]/8 bg-[#1B2E6B] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white"><Sparkles className="h-4 w-4" /></span>
              <div className="leading-tight">
                <div className="cba-nav text-[14px] text-white">Cowboy KB Assistant</div>
                <div className="cba-eyebrow text-[9px] text-white/60">Answers straight from the guides</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
          </div>

          {/* messages */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-[#F5F2EB]/60 px-4 py-4">
            <div className="rounded-2xl rounded-tl-md bg-white p-4 text-[13.5px] shadow-sm ring-1 ring-[#1B2E6B]/8">
              <p className="cba-body text-slate-600">Howdy! Ask me anything that's in the knowledge base — quoting, transfer bonds, jail numbers, procedures — and I'll pull the exact answer from the guides.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}
                    className="cba-body rounded-full border border-[#1B2E6B]/15 bg-white px-3 py-1.5 text-[12px] text-[#1B2E6B] transition hover:bg-[#1B2E6B]/5">{s}</button>
                ))}
              </div>
            </div>

            {messages.map((m, i) => m.role === "user" ? (
              <div key={i} ref={(el) => { msgRefs.current[i] = el; }} className="flex justify-end scroll-mt-2">
                <div className="cba-body max-w-[85%] rounded-2xl rounded-tr-md bg-[#1B2E6B] px-4 py-2.5 text-[13.5px] text-white shadow-sm">{m.text}</div>
              </div>
            ) : (
              <div key={i} className="space-y-2.5">
                {m.pending ? (
                  <div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-white px-4 py-3 shadow-sm ring-1 ring-[#1B2E6B]/8">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[#1B2E6B]/50" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[#1B2E6B]/50" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[#1B2E6B]/50" style={{ animationDelay: "300ms" }} />
                    <span className="cba-body ml-1 text-[12px] text-slate-400">Checking the guides…</span>
                  </div>
                ) : m.answer ? (
                  <>
                    <div className="rounded-2xl rounded-tl-md bg-white p-4 shadow-sm ring-1 ring-[#1B2E6B]/8">
                      <div className="kbchat-md text-[13.5px]"><Markdown text={m.answer} /></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 px-1">
                      <span className="cba-eyebrow text-[9px] text-slate-400">Sources:</span>
                      {m.results.map((ch) => (
                        <button key={ch.artId} onClick={() => onOpenArticle(ch.loc.deptId, ch.loc.catId, ch.artId)}
                          className="cba-body rounded-full border border-[#1B2E6B]/15 bg-white px-2.5 py-1 text-[11px] text-[#1B2E6B] transition hover:bg-[#1B2E6B]/5">
                          {ch.artTitle}
                        </button>
                      ))}
                    </div>
                  </>
                ) : m.results.length === 0 ? (
                  <div className="rounded-2xl rounded-tl-md bg-white p-4 shadow-sm ring-1 ring-[#1B2E6B]/8">
                    <p className="cba-body text-[13.5px] text-slate-600">I couldn't find that in the KB. Try different words (or an abbreviation — BIJ, FTA, XFR…), or use the search bar up top. If it genuinely isn't written down yet, that might be an article worth adding.</p>
                  </div>
                ) : (
                  m.results.map((ch) => (
                    <div key={ch.artId} className="overflow-hidden rounded-2xl rounded-tl-md bg-white shadow-sm ring-1 ring-[#1B2E6B]/8">
                      <div className="border-b border-[#1B2E6B]/6 bg-[#1B2E6B]/[0.03] px-4 py-2">
                        <div className="cba-eyebrow text-[9px] text-[#1B2E6B]/60">{ch.loc.deptTitle} · {ch.loc.catTitle}</div>
                        <div className="cba-nav mt-0.5 text-[13px] text-[#1B2E6B]">{ch.artTitle}</div>
                      </div>
                      <div className="kbchat-md px-4 py-1 text-[13px]">
                        <Markdown text={excerpt(ch, m.tokens)} />
                      </div>
                      <button onClick={() => onOpenArticle(ch.loc.deptId, ch.loc.catId, ch.artId)}
                        className="cba-nav flex w-full items-center gap-1.5 border-t border-[#1B2E6B]/6 px-4 py-2.5 text-[12px] text-[#1B2E6B] transition hover:bg-[#1B2E6B]/5">
                        <FileText className="h-3.5 w-3.5" /> Open full article
                      </button>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>

          {/* input */}
          <div className="flex items-center gap-2 border-t border-[#1B2E6B]/8 bg-white px-3 py-3">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="Ask the knowledge base…"
              className="cba-body w-full rounded-full border border-[#1B2E6B]/15 bg-white px-4 py-2.5 text-[13.5px] text-slate-700 placeholder-slate-400 outline-none focus:border-[#1B2E6B]/40" />
            <button onClick={() => send()} title="Send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1B2E6B] text-white transition hover:bg-[#24408f]">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
