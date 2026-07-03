"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search, ChevronRight, Edit3, Trash2, Plus, Save, X, BookOpen, FileText, Folder, Home, ArrowLeft, Download, RotateCcw, Check, ShieldCheck, Globe, CheckCircle, Gavel, DollarSign, HelpCircle, Book, Wrench, Users, Lock } from "lucide-react";

function renderInline(text) {
  // bold **x**
  const parts = [];
  let rest = text;
  let key = 0;
  const re = /\*\*(.+?)\*\*/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={key++} className="font-semibold text-[#1B2E6B]">{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

function Markdown({ text }) {
  const lines = (text || "").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }
    if (line.startsWith("## ")) {
      blocks.push(<h3 key={i} className="cba-eyebrow mt-9 mb-3 text-[#1B2E6B]">{line.slice(3)}</h3>);
      i++;
    } else if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, ""));
        i++;
      }
      blocks.push(<ul key={i} className="my-4 space-y-2.5">{items.map((it, k) => (
        <li key={k} className="flex gap-3 cba-body">
          <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#1B2E6B]" />
          <span>{renderInline(it)}</span>
        </li>))}</ul>);
    } else if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(<ol key={i} className="my-4 space-y-2.5">{items.map((it, k) => (
        <li key={k} className="flex gap-3.5 cba-body">
          <span className="shrink-0 text-[13px] font-semibold text-[#1B2E6B] tabular-nums pt-[3px]" style={{fontFamily:"'IBM Plex Mono', ui-monospace, monospace", letterSpacing:"0.05em"}}>{String(k + 1).padStart(2,"0")}</span>
          <span>{renderInline(it)}</span>
        </li>))}</ol>);
    } else {
      blocks.push(<p key={i} className="my-4 cba-body">{renderInline(line)}</p>);
      i++;
    }
  }
  return <div>{blocks}</div>;
}

const uid = () => Math.random().toString(36).slice(2, 9);

// ---- view <-> URL ----
function viewToQuery(v) {
  if (v.type === "department") return `?view=department&dept=${encodeURIComponent(v.deptId)}`;
  if (v.type === "category") return `?view=category&dept=${encodeURIComponent(v.deptId)}&cat=${encodeURIComponent(v.catId)}`;
  if (v.type === "article") return `?view=article&dept=${encodeURIComponent(v.deptId)}&cat=${encodeURIComponent(v.catId)}&art=${encodeURIComponent(v.artId)}`;
  return "";
}
function queryToView(search) {
  const p = new URLSearchParams(search);
  const type = p.get("view");
  if (type === "department" && p.get("dept")) return { type: "department", deptId: p.get("dept") };
  if (type === "category" && p.get("dept") && p.get("cat")) return { type: "category", deptId: p.get("dept"), catId: p.get("cat") };
  if (type === "article" && p.get("dept") && p.get("cat") && p.get("art")) return { type: "article", deptId: p.get("dept"), catId: p.get("cat"), artId: p.get("art") };
  return { type: "home" };
}

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState({ type: "home" }); // home | department | category | article
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "" });
  const [toast, setToast] = useState("");
  const [passcode, setPasscode] = useState("");

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2800); };

  // ---- navigation (kept in sync with real browser history) ----
  const hasHistoryRef = useRef(false);

  const navigate = (next) => {
    setEditing(false);
    setView(next);
    if (typeof window !== "undefined") {
      window.history.pushState({ cbbView: next }, "", window.location.pathname + viewToQuery(next));
      hasHistoryRef.current = true;
    }
  };

  const goBack = () => {
    if (hasHistoryRef.current && typeof window !== "undefined") {
      window.history.back();
    } else {
      navigate({ type: "home" });
    }
  };

  // ---- load from API ----
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/kb", { cache: "no-store" });
        if (!res.ok) throw new Error("load failed");
        setData(await res.json());
      } catch {
        flash("Could not load the knowledge base. Check your connection.");
      } finally {
        setLoading(false);
      }
    })();
    // remember passcode locally so editors don't retype it every time
    try { const p = window.localStorage.getItem("cbb-kb-pass"); if (p) setPasscode(p); } catch {}
  }, []);

  // ---- sync view with URL + browser back/forward ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    const initial = queryToView(window.location.search);
    window.history.replaceState({ cbbView: initial }, "", window.location.pathname + viewToQuery(initial));
    setView(initial);

    const onPopState = (e) => {
      const next = (e.state && e.state.cbbView) || queryToView(window.location.search);
      setEditing(false);
      setView(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // ---- persist whole doc to API (shared across everyone) ----
  const persist = async (next) => {
    setData(next); // optimistic
    setSaving(true);
    try {
      const res = await fetch("/api/kb", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-kb-passcode": passcode },
        body: JSON.stringify(next),
      });
      if (res.status === 401) { flash("Wrong passcode — changes not saved."); return false; }
      if (!res.ok) { flash("Save failed. Try again."); return false; }
      return true;
    } catch {
      flash("Save failed — network error.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Ask for the edit passcode once, cache it.
  const ensurePasscode = () => {
    if (passcode) return true;
    const entered = window.prompt("Enter the editor passcode to make changes:");
    if (entered == null) return false;
    setPasscode(entered);
    try { window.localStorage.setItem("cbb-kb-pass", entered); } catch {}
    return true;
  };

  // ---- helpers ----
  const findDept = (deptId) => data?.departments.find((d) => d.id === deptId);
  const findCategory = (deptId, catId) => findDept(deptId)?.categories.find((c) => c.id === catId);
  const findArticle = (deptId, catId, artId) => findCategory(deptId, catId)?.articles.find((a) => a.id === artId);
  const deptArticleCount = (d) => d.categories.reduce((n, c) => n + c.articles.length, 0);

  const totalArticles = useMemo(
    () => data ? data.departments.reduce((n, d) => n + deptArticleCount(d), 0) : 0, [data]);

  const searchResults = useMemo(() => {
    if (!data || query.trim().length < 2) return [];
    const q = query.toLowerCase();
    const hits = [];
    for (const dept of data.departments)
      for (const cat of dept.categories)
        for (const a of cat.articles) {
          const inTitle = a.title.toLowerCase().includes(q);
          const inBody = a.body.toLowerCase().includes(q);
          if (inTitle || inBody) {
            let snippet = "";
            if (inBody) {
              const idx = a.body.toLowerCase().indexOf(q);
              const start = Math.max(0, idx - 40);
              snippet = (start > 0 ? "…" : "") + a.body.slice(start, idx + 80).replace(/\n/g, " ") + "…";
            }
            hits.push({ dept, cat, art: a, snippet });
          }
        }
    return hits;
  }, [data, query]);

  // ---- CRUD: articles ----
  const openArticle = (deptId, catId, artId) => { navigate({ type: "article", deptId, catId, artId }); if (typeof window !== "undefined") window.scrollTo(0, 0); };

  const startEdit = (art) => { if (!ensurePasscode()) return; setDraft({ title: art.title, body: art.body }); setEditing(true); };

  const saveEdit = async () => {
    const next = structuredClone(data);
    const c = next.departments.find((x) => x.id === view.deptId).categories.find((x) => x.id === view.catId);
    const a = c.articles.find((x) => x.id === view.artId);
    a.title = draft.title.trim() || "Untitled";
    a.body = draft.body;
    const ok = await persist(next);
    if (ok) { setEditing(false); flash("Article saved"); }
  };

  const deleteArticle = async (deptId, catId, artId) => {
    if (!ensurePasscode()) return;
    const next = structuredClone(data);
    const c = next.departments.find((x) => x.id === deptId).categories.find((x) => x.id === catId);
    c.articles = c.articles.filter((a) => a.id !== artId);
    const ok = await persist(next);
    if (ok) { navigate({ type: "category", deptId, catId }); flash("Article deleted"); }
  };

  const addArticle = (deptId, catId) => {
    if (!ensurePasscode()) return;
    const next = structuredClone(data);
    const c = next.departments.find((x) => x.id === deptId).categories.find((x) => x.id === catId);
    const id = uid();
    c.articles.push({ id, title: "New article", body: "Write the content here." });
    persist(next);
    navigate({ type: "article", deptId, catId, artId: id });
    setDraft({ title: "New article", body: "Write the content here." });
    setEditing(true);
  };

  // ---- CRUD: categories (within a department) ----
  const [editCategory, setEditCategory] = useState(null);

  const addCategory = (deptId) => {
    if (!ensurePasscode()) return;
    const next = structuredClone(data);
    const dept = next.departments.find((x) => x.id === deptId);
    const id = uid();
    dept.categories.push({ id, title: "New category", desc: "Describe this category.", articles: [] });
    persist(next);
    navigate({ type: "category", deptId, catId: id });
    flash("Category added — use Edit to rename it");
  };

  const saveCategory = async () => {
    const next = structuredClone(data);
    const dept = next.departments.find((x) => x.id === editCategory.deptId);
    const c = dept.categories.find((x) => x.id === editCategory.id);
    c.title = editCategory.title.trim() || "Untitled category";
    c.desc = editCategory.desc;
    const ok = await persist(next);
    if (ok) { setEditCategory(null); flash("Category updated"); }
  };

  const deleteCategory = async (deptId, catId) => {
    const next = structuredClone(data);
    const dept = next.departments.find((x) => x.id === deptId);
    dept.categories = dept.categories.filter((c) => c.id !== catId);
    const ok = await persist(next);
    if (ok) { setEditCategory(null); navigate({ type: "department", deptId }); flash("Category deleted"); }
  };

  // ---- CRUD: departments ----
  const [editDept, setEditDept] = useState(null);

  const addDepartment = () => {
    if (!ensurePasscode()) return;
    const next = structuredClone(data);
    const id = uid();
    next.departments.push({ id, title: "New department", desc: "Describe this department.", categories: [] });
    persist(next);
    navigate({ type: "department", deptId: id });
    flash("Department added — use Edit to rename it");
  };

  const saveDept = async () => {
    const next = structuredClone(data);
    const d = next.departments.find((x) => x.id === editDept.id);
    d.title = editDept.title.trim() || "Untitled department";
    d.desc = editDept.desc;
    const ok = await persist(next);
    if (ok) { setEditDept(null); flash("Department updated"); }
  };

  const deleteDept = async (id) => {
    const next = structuredClone(data);
    next.departments = next.departments.filter((d) => d.id !== id);
    const ok = await persist(next);
    if (ok) { setEditDept(null); navigate({ type: "home" }); flash("Department deleted"); }
  };

  const resetAll = async () => {
    if (!ensurePasscode()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/kb/reset", { method: "POST", headers: { "x-kb-passcode": passcode } });
      if (res.status === 401) { flash("Wrong passcode."); return; }
      if (!res.ok) { flash("Reset failed."); return; }
      setData(await res.json());
      navigate({ type: "home" });
      flash("Reset to original content");
    } catch { flash("Reset failed — network error."); }
    finally { setSaving(false); }
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "cbb-knowledge-base.json"; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !data)
    return (
      <div className="cba-root min-h-screen grid place-items-center bg-[#F5F2EB]">
          <span className="cba-eyebrow text-[#1B2E6B]/60">Loading knowledge base…</span>
      </div>
    );

  const ICON_MAP = {
    "cat-sales": Users, "cat-journey": BookOpen, "cat-stages": FileText,
    "cat-underwriting": ShieldCheck, "cat-ebail": Globe, "cat-closing": CheckCircle,
    "cat-courts": Gavel, "cat-collections": DollarSign, "cat-general": HelpCircle,
    "cat-terms": Book, "cat-it": Wrench,
  };
  const FALLBACK_ICONS = [Folder, FileText, BookOpen, Home];
  const activeDeptId = view.type === "department" || view.type === "category" || view.type === "article" ? view.deptId : null;

  const Logo = () => (
    <button onClick={() => { navigate({ type: "home" }); setQuery(""); }} className="block text-left">
      <div className="flex items-center gap-2.5">
        <span className="grid h-10 w-10 place-items-center text-[#1B2E6B]" style={{fontSize:"30px",lineHeight:1}}>★</span>
        <div className="leading-none">
          <div className="cba-logo text-[19px] text-[#1B2E6B]">COWBOY</div>
          <div className="cba-eyebrow text-[9px] text-[#1B2E6B]/70 mt-0.5">BAIL BONDS</div>
        </div>
      </div>
    </button>
  );

  return (
    <div className="cba-root min-h-screen bg-[#F5F2EB] text-slate-700">
      <div className="mx-auto flex max-w-[1280px] gap-7 px-5 py-6">
        {/* ===== SIDEBAR ===== */}
        <aside className="hidden lg:block w-[264px] shrink-0">
          <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pr-1">
            <Logo />
            <div className="cba-eyebrow mt-7 text-[#1B2E6B]/70">Cowboy Academy</div>
            <h1 className="cba-display mt-2 text-[27px] leading-[1.08] text-[#1B2E6B]">Knowledge Base</h1>
            <p className="cba-serif mt-3 text-[14px] italic leading-relaxed text-slate-500">"Helping, Caring, and Guiding the People we Serve"</p>
            <div className="mt-5 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#1B2E6B]" />
              <span className="cba-eyebrow text-[10px] text-[#1B2E6B]/70">Operational Playbook</span>
            </div>

            <button onClick={() => { navigate({ type: "home" }); setQuery(""); }}
              className={"mt-7 flex w-full items-center gap-3 rounded-2xl px-5 py-4 transition " + (view.type === "home" ? "bg-[#1B2E6B] text-white shadow-md" : "bg-white text-[#1B2E6B] hover:bg-white/60 ring-1 ring-[#1B2E6B]/8")}>
              <Home className="h-5 w-5" />
              <span className="cba-nav">All Guides</span>
            </button>

            <div className="mt-5 space-y-0.5">
              {data.departments.map((d) => {
                const Icon = ICON_MAP[d.id] || FALLBACK_ICONS[0];
                const active = activeDeptId === d.id;
                return (
                  <button key={d.id} onClick={() => navigate({ type: "department", deptId: d.id })}
                    className={"flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left transition " + (active ? "bg-[#1B2E6B]/8 text-[#1B2E6B]" : "text-slate-500 hover:bg-[#1B2E6B]/5 hover:text-[#1B2E6B]")}>
                    <Icon className={"h-4 w-4 shrink-0 " + (active ? "text-[#1B2E6B]" : "text-slate-400")} />
                    <span className="cba-nav flex-1 truncate">{d.title}</span>
                    {deptArticleCount(d) > 0 && <span className="cba-eyebrow text-[10px] text-slate-400">{deptArticleCount(d)}</span>}
                  </button>
                );
              })}
            </div>
            <button onClick={addDepartment} className="mt-3 flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-slate-400 transition hover:text-[#1B2E6B]">
              <Plus className="h-4 w-4" /><span className="cba-nav">New department</span>
            </button>
          </div>
        </aside>

        {/* ===== MAIN COLUMN ===== */}
        <div className="min-w-0 flex-1">
          {/* search bar */}
          <div className="mb-6 flex items-center gap-3">
            <div className="lg:hidden"><Logo /></div>
            <div className="relative ml-auto w-full max-w-md">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1B2E6B]/40" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all guides…"
                className="cba-body w-full rounded-full border border-[#1B2E6B]/12 bg-white py-3 pl-11 pr-4 text-[14px] text-slate-700 placeholder-slate-400 shadow-sm outline-none focus:border-[#1B2E6B]/40" />
            </div>
            <button onClick={exportJSON} title="Export backup" className="hidden sm:grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#1B2E6B]/12 bg-white text-slate-500 shadow-sm hover:text-[#1B2E6B]"><Download className="h-4 w-4" /></button>
            <button onClick={() => { if (confirm("Reset all guides to the original content? Your edits will be lost.")) resetAll(); }} title="Reset" className="hidden sm:grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#1B2E6B]/12 bg-white text-slate-500 shadow-sm hover:text-[#1B2E6B]"><RotateCcw className="h-4 w-4" /></button>
          </div>

          {/* SEARCH RESULTS */}
          {query.trim().length >= 2 ? (
            <div>
              <p className="cba-body mb-5 text-slate-500">{searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for "<span className="font-semibold text-[#1B2E6B]">{query}</span>"</p>
              <div className="space-y-3">
                {searchResults.map(({ dept, cat, art, snippet }) => (
                  <button key={dept.id + cat.id + art.id} onClick={() => { openArticle(dept.id, cat.id, art.id); setQuery(""); }}
                    className="block w-full rounded-2xl border border-[#1B2E6B]/8 bg-white p-5 text-left shadow-sm transition hover:border-[#1B2E6B]/25 hover:shadow-md">
                    <div className="cba-eyebrow mb-1 text-[#1B2E6B]/60">{dept.title} · {cat.title}</div>
                    <div className="cba-display text-[19px] text-[#1B2E6B]">{art.title}</div>
                    {snippet && <div className="cba-body mt-1.5 text-[13.5px] text-slate-500">{snippet}</div>}
                  </button>
                ))}
                {searchResults.length === 0 && <div className="cba-body rounded-2xl border border-dashed border-[#1B2E6B]/20 bg-white p-12 text-center text-slate-400">No articles match your search.</div>}
              </div>
            </div>
          ) : view.type === "home" ? (
            /* HOME */
            <div>
              <div className="rounded-3xl bg-white p-9 shadow-sm ring-1 ring-[#1B2E6B]/6 sm:p-12">
                <div className="cba-eyebrow text-[#1B2E6B]/60">Cowboy Bail Bonds · Internal Reference</div>
                <h1 className="cba-display mt-4 text-[40px] leading-[1.05] text-[#1B2E6B] sm:text-[52px]">How can<br/>we help?</h1>
                <p className="cba-body mt-5 max-w-xl text-[15.5px] text-slate-500">The complete operational playbook — customer journey, sales, and every ePros stage, plus department guides. {totalArticles} articles across {data.departments.length} guides.</p>
              </div>

              <div className="mb-4 mt-10 flex items-center justify-between">
                <h2 className="cba-eyebrow text-[#1B2E6B]/70">Browse the guides</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {data.departments.map((d) => {
                  const Icon = ICON_MAP[d.id] || FALLBACK_ICONS[0];
                  const count = deptArticleCount(d);
                  return (
                    <button key={d.id} onClick={() => navigate({ type: "department", deptId: d.id })}
                      className="group flex flex-col rounded-3xl border border-[#1B2E6B]/8 bg-white p-7 text-left shadow-sm transition hover:border-[#1B2E6B]/25 hover:shadow-md">
                      <div className="mb-4 flex items-center gap-3">
                        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#1B2E6B]/6 text-[#1B2E6B] transition group-hover:bg-[#1B2E6B] group-hover:text-white"><Icon className="h-5 w-5" /></span>
                        <span className="cba-eyebrow rounded-full border border-[#1B2E6B]/15 px-3 py-1 text-[10px] text-[#1B2E6B]/70">{count} article{count !== 1 ? "s" : ""}</span>
                      </div>
                      <h3 className="cba-display text-[22px] leading-tight text-[#1B2E6B]">{d.title}</h3>
                      <p className="cba-body mt-2 text-[13.5px] text-slate-500">{d.desc}</p>
                      <span className="cba-nav mt-5 inline-flex items-center gap-1.5 text-[#1B2E6B] transition-all group-hover:gap-2.5">Open guide <ChevronRight className="h-4 w-4" /></span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : view.type === "department" ? (
            /* DEPARTMENT — shows its categories */
            (() => {
              const d = findDept(view.deptId);
              if (!d) return null;
              const count = deptArticleCount(d);
              return (
                <div>
                  <div className="cba-nav mb-6 flex items-center gap-2 text-[13px] text-slate-400">
                    <button onClick={goBack} className="flex items-center gap-1 hover:text-[#1B2E6B]"><ArrowLeft className="h-3.5 w-3.5" />Back</button>
                    <span className="text-[#1B2E6B]/20">|</span>
                    <button onClick={() => navigate({ type: "home" })} className="hover:text-[#1B2E6B]">Dashboard</button>
                    <ChevronRight className="h-3.5 w-3.5" />
                    <span className="text-[#1B2E6B]">{d.title}</span>
                  </div>
                  <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-[#1B2E6B]/6 sm:p-10">
                    {editDept && editDept.id === d.id ? (
                      <div className="space-y-3">
                        <input value={editDept.title} onChange={(e)=>setEditDept({...editDept,title:e.target.value})} className="cba-display w-full rounded-xl border border-[#1B2E6B]/20 px-4 py-2.5 text-[32px] text-[#1B2E6B] outline-none focus:border-[#1B2E6B]/50" />
                        <textarea value={editDept.desc} onChange={(e)=>setEditDept({...editDept,desc:e.target.value})} rows={2} className="cba-body w-full rounded-xl border border-[#1B2E6B]/20 px-4 py-2.5 outline-none focus:border-[#1B2E6B]/50" />
                        <div className="flex flex-wrap gap-2">
                          <button onClick={saveDept} className="cba-nav flex items-center gap-1.5 rounded-full bg-[#1B2E6B] px-4 py-2 text-white"><Check className="h-4 w-4"/>Save</button>
                          <button onClick={()=>setEditDept(null)} className="cba-nav rounded-full border border-[#1B2E6B]/20 px-4 py-2 text-slate-500">Cancel</button>
                          <button onClick={()=>{ if(confirm("Delete this whole department and all its categories and articles?")) deleteDept(d.id); }} className="cba-nav ml-auto flex items-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4"/>Delete department</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="cba-eyebrow text-[#1B2E6B]/60">{count} article{count !== 1 ? "s" : ""} · {d.categories.length} categor{d.categories.length !== 1 ? "ies" : "y"}</div>
                          <h1 className="cba-display mt-2 text-[36px] leading-tight text-[#1B2E6B]">{d.title}</h1>
                          <p className="cba-body mt-2 max-w-2xl text-slate-500">{d.desc}</p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button onClick={()=>setEditDept({id:d.id,title:d.title,desc:d.desc})} className="cba-nav flex items-center gap-1.5 rounded-full border border-[#1B2E6B]/15 px-4 py-2 text-slate-500 hover:text-[#1B2E6B]"><Edit3 className="h-4 w-4"/>Edit</button>
                          <button onClick={()=>addCategory(d.id)} className="cba-nav flex items-center gap-1.5 rounded-full bg-[#1B2E6B] px-4 py-2 text-white hover:bg-[#24408f]"><Plus className="h-4 w-4"/>New category</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {d.categories.length === 0 ? (
                    <div className="mt-4 rounded-3xl border border-[#1B2E6B]/8 bg-white px-6 py-16 text-center shadow-sm">
                      <p className="cba-serif text-[17px] italic text-slate-400">No categories here yet.</p>
                      <button onClick={()=>addCategory(d.id)} className="cba-nav mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#1B2E6B] px-5 py-2.5 text-white hover:bg-[#24408f]"><Plus className="h-4 w-4"/>Add the first category</button>
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {d.categories.map((c) => (
                        <button key={c.id} onClick={() => navigate({ type: "category", deptId: d.id, catId: c.id })}
                          className="group flex flex-col rounded-3xl border border-[#1B2E6B]/8 bg-white p-7 text-left shadow-sm transition hover:border-[#1B2E6B]/25 hover:shadow-md">
                          <div className="mb-4 flex items-center gap-3">
                            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#1B2E6B]/6 text-[#1B2E6B] transition group-hover:bg-[#1B2E6B] group-hover:text-white"><Folder className="h-5 w-5" /></span>
                            <span className="cba-eyebrow rounded-full border border-[#1B2E6B]/15 px-3 py-1 text-[10px] text-[#1B2E6B]/70">{c.articles.length} article{c.articles.length !== 1 ? "s" : ""}</span>
                          </div>
                          <h3 className="cba-display text-[22px] leading-tight text-[#1B2E6B]">{c.title}</h3>
                          <p className="cba-body mt-2 text-[13.5px] text-slate-500">{c.desc}</p>
                          <span className="cba-nav mt-5 inline-flex items-center gap-1.5 text-[#1B2E6B] transition-all group-hover:gap-2.5">Open category <ChevronRight className="h-4 w-4" /></span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()
          ) : view.type === "category" ? (
            /* CATEGORY — shows its articles */
            (() => {
              const d = findDept(view.deptId);
              const c = findCategory(view.deptId, view.catId);
              if (!d || !c) return null;
              return (
                <div>
                  <div className="cba-nav mb-6 flex items-center gap-2 text-[13px] text-slate-400">
                    <button onClick={goBack} className="flex items-center gap-1 hover:text-[#1B2E6B]"><ArrowLeft className="h-3.5 w-3.5" />Back</button>
                    <span className="text-[#1B2E6B]/20">|</span>
                    <button onClick={() => navigate({ type: "home" })} className="hover:text-[#1B2E6B]">Dashboard</button>
                    <ChevronRight className="h-3.5 w-3.5" />
                    <button onClick={() => navigate({ type: "department", deptId: d.id })} className="hover:text-[#1B2E6B]">{d.title}</button>
                    <ChevronRight className="h-3.5 w-3.5" />
                    <span className="text-[#1B2E6B]">{c.title}</span>
                  </div>
                  <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-[#1B2E6B]/6 sm:p-10">
                    {editCategory && editCategory.id === c.id ? (
                      <div className="space-y-3">
                        <input value={editCategory.title} onChange={(e)=>setEditCategory({...editCategory,title:e.target.value})} className="cba-display w-full rounded-xl border border-[#1B2E6B]/20 px-4 py-2.5 text-[32px] text-[#1B2E6B] outline-none focus:border-[#1B2E6B]/50" />
                        <textarea value={editCategory.desc} onChange={(e)=>setEditCategory({...editCategory,desc:e.target.value})} rows={2} className="cba-body w-full rounded-xl border border-[#1B2E6B]/20 px-4 py-2.5 outline-none focus:border-[#1B2E6B]/50" />
                        <div className="flex flex-wrap gap-2">
                          <button onClick={saveCategory} className="cba-nav flex items-center gap-1.5 rounded-full bg-[#1B2E6B] px-4 py-2 text-white"><Check className="h-4 w-4"/>Save</button>
                          <button onClick={()=>setEditCategory(null)} className="cba-nav rounded-full border border-[#1B2E6B]/20 px-4 py-2 text-slate-500">Cancel</button>
                          <button onClick={()=>{ if(confirm("Delete this whole category and all its articles?")) deleteCategory(d.id, c.id); }} className="cba-nav ml-auto flex items-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4"/>Delete category</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="cba-eyebrow text-[#1B2E6B]/60">{c.articles.length} article{c.articles.length !== 1 ? "s" : ""}</div>
                          <h1 className="cba-display mt-2 text-[36px] leading-tight text-[#1B2E6B]">{c.title}</h1>
                          <p className="cba-body mt-2 max-w-2xl text-slate-500">{c.desc}</p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button onClick={()=>setEditCategory({deptId:d.id,id:c.id,title:c.title,desc:c.desc})} className="cba-nav flex items-center gap-1.5 rounded-full border border-[#1B2E6B]/15 px-4 py-2 text-slate-500 hover:text-[#1B2E6B]"><Edit3 className="h-4 w-4"/>Edit</button>
                          <button onClick={()=>addArticle(d.id, c.id)} className="cba-nav flex items-center gap-1.5 rounded-full bg-[#1B2E6B] px-4 py-2 text-white hover:bg-[#24408f]"><Plus className="h-4 w-4"/>New article</button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 overflow-hidden rounded-3xl border border-[#1B2E6B]/8 bg-white shadow-sm">
                    {c.articles.map((a, i) => (
                      <button key={a.id} onClick={() => openArticle(d.id, c.id, a.id)}
                        className={"flex w-full items-center gap-4 px-6 py-4 text-left transition hover:bg-[#F5F2EB] " + (i !== 0 ? "border-t border-[#1B2E6B]/6" : "")}>
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#1B2E6B]/5 text-[#1B2E6B]"><FileText className="h-4 w-4" /></span>
                        <span className="cba-body flex-1 font-medium text-slate-700">{a.title}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                      </button>
                    ))}
                    {c.articles.length === 0 && (
                      <div className="px-6 py-16 text-center">
                        <p className="cba-serif text-[17px] italic text-slate-400">No articles here yet.</p>
                        <button onClick={()=>addArticle(d.id, c.id)} className="cba-nav mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#1B2E6B] px-5 py-2.5 text-white hover:bg-[#24408f]"><Plus className="h-4 w-4"/>Write the first article</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            /* ARTICLE */
            (() => {
              const d = findDept(view.deptId);
              const c = findCategory(view.deptId, view.catId);
              const a = findArticle(view.deptId, view.catId, view.artId);
              if (!d || !c || !a) return null;
              return (
                <div className="mx-auto max-w-3xl">
                  <div className="cba-nav mb-6 flex items-center gap-2 text-[13px] text-slate-400">
                    <button onClick={goBack} className="flex items-center gap-1 hover:text-[#1B2E6B]"><ArrowLeft className="h-3.5 w-3.5" />Back</button>
                    <span className="text-[#1B2E6B]/20">|</span>
                    <button onClick={()=>navigate({type:"home"})} className="hover:text-[#1B2E6B]">Dashboard</button>
                    <ChevronRight className="h-3.5 w-3.5" />
                    <button onClick={()=>navigate({type:"department",deptId:d.id})} className="hover:text-[#1B2E6B]">{d.title}</button>
                    <ChevronRight className="h-3.5 w-3.5" />
                    <button onClick={()=>navigate({type:"category",deptId:d.id,catId:c.id})} className="hover:text-[#1B2E6B]">{c.title}</button>
                  </div>
                  <article className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-[#1B2E6B]/6 sm:p-11">
                    {editing ? (
                      <div>
                        <label className="cba-eyebrow mb-2 block text-[#1B2E6B]/60">Title</label>
                        <input value={draft.title} onChange={(e)=>setDraft({...draft,title:e.target.value})}
                          className="cba-display mb-6 w-full rounded-xl border border-[#1B2E6B]/20 px-4 py-3 text-[26px] text-[#1B2E6B] outline-none focus:border-[#1B2E6B]/50" />
                        <label className="cba-eyebrow mb-2 block text-[#1B2E6B]/60">Content — ## heading · - bullet · 1. numbered · **bold**</label>
                        <textarea value={draft.body} onChange={(e)=>setDraft({...draft,body:e.target.value})} rows={22}
                          className="w-full resize-y rounded-xl border border-[#1B2E6B]/20 px-4 py-3 text-[13px] leading-relaxed text-slate-700 outline-none focus:border-[#1B2E6B]/50" style={{fontFamily:"'IBM Plex Mono', ui-monospace, monospace"}} />
                        <div className="mt-6 flex gap-2">
                          <button onClick={saveEdit} className="cba-nav flex items-center gap-1.5 rounded-full bg-[#1B2E6B] px-5 py-2.5 text-white hover:bg-[#24408f]"><Save className="h-4 w-4"/>Save changes</button>
                          <button onClick={()=>setEditing(false)} className="cba-nav flex items-center gap-1.5 rounded-full border border-[#1B2E6B]/20 px-5 py-2.5 text-slate-500 hover:text-[#1B2E6B]"><X className="h-4 w-4"/>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="cba-eyebrow text-[#1B2E6B]/60">{d.title} · {c.title}</div>
                        <div className="mt-3 flex items-start justify-between gap-4">
                          <h1 className="cba-display text-[34px] leading-[1.08] text-[#1B2E6B] sm:text-[40px]">{a.title}</h1>
                          <div className="flex shrink-0 gap-1.5">
                            <button onClick={()=>startEdit(a)} title="Edit" className="grid h-10 w-10 place-items-center rounded-full border border-[#1B2E6B]/12 text-slate-400 hover:border-[#1B2E6B]/30 hover:text-[#1B2E6B]"><Edit3 className="h-4 w-4"/></button>
                            <button onClick={()=>{ if(confirm("Delete this article?")) deleteArticle(d.id,c.id,a.id); }} title="Delete" className="grid h-10 w-10 place-items-center rounded-full border border-[#1B2E6B]/12 text-slate-400 hover:border-red-300 hover:text-red-600"><Trash2 className="h-4 w-4"/></button>
                          </div>
                        </div>
                        <div className="mt-6 mb-2 h-px w-full bg-[#1B2E6B]/10" />
                        <Markdown text={a.body} />
                      </div>
                    )}
                  </article>
                  {!editing && (
                    <div className="mt-5">
                      <button onClick={()=>navigate({type:"category",deptId:d.id,catId:c.id})} className="cba-nav flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-[#1B2E6B]"><ArrowLeft className="h-4 w-4"/>Back to {c.title}</button>
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </div>
      </div>

      {/* toast + save indicator */}
      {(toast || saving) && (
        <div className="cba-nav fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#1B2E6B] px-5 py-2.5 text-[13px] text-white shadow-lg">
          {saving ? "Saving…" : toast}
        </div>
      )}
    </div>
  );
}
