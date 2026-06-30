"use client";

import { useMemo, useState } from "react";
import { BRAND_PROFILE } from "@/app/brand";

/* ---- types (mirror the /api/check response) ---------------------------- */
type Severity = "low" | "medium" | "high";
type Finding = {
  quote: string;
  rule: string;
  title: string;
  severity: Severity;
  explanation: string;
  rewrite: string;
};
type CheckResult = { score: number; summary: string; findings: Finding[] };

const SAMPLE = `We're thrilled to announce a revolutionary new platform that will utilize cutting-edge AI to leverage synergies across your entire content stack. Our best-in-class solution empowers stakeholders to ideate at scale. Click Here To Learn More!!!`;

const SEVERITY_HELP: Record<Severity, string> = {
  low: "Minor — a small polish to sound more on-brand.",
  medium: "Worth fixing — noticeably off the brand voice.",
  high: "Fix this — clearly breaks the brand voice.",
};

/* Locate each finding's verbatim quote in the working text and split the
   document into plain + flagged segments. Applied findings are skipped. */
type Match = { start: number; end: number; idx: number; n: number };
function annotate(text: string, findings: Finding[], skip: Set<number>) {
  const matches: Match[] = [];
  findings.forEach((f, idx) => {
    if (skip.has(idx) || !f.quote) return;
    let from = 0;
    while (from <= text.length) {
      const at = text.indexOf(f.quote, from);
      if (at === -1) break;
      const end = at + f.quote.length;
      const overlaps = matches.some((m) => at < m.end && end > m.start);
      if (!overlaps) {
        matches.push({ start: at, end, idx, n: 0 });
        break;
      }
      from = at + 1;
    }
  });
  matches.sort((a, b) => a.start - b.start);
  matches.forEach((m, i) => (m.n = i + 1));

  const segs: { text: string; match?: Match }[] = [];
  let cur = 0;
  for (const m of matches) {
    if (m.start > cur) segs.push({ text: text.slice(cur, m.start) });
    segs.push({ text: text.slice(m.start, m.end), match: m });
    cur = m.end;
  }
  if (cur < text.length) segs.push({ text: text.slice(cur) });

  const markerByFinding = new Map<number, number>();
  matches.forEach((m) => markerByFinding.set(m.idx, m.n));
  return { segs, markerByFinding };
}

function correctedName(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name}-corrected.txt`;
  return `${name.slice(0, dot)}-corrected${name.slice(dot)}`;
}

export default function Home() {
  const [text, setText] = useState(SAMPLE);
  const [fileName, setFileName] = useState("untitled.txt");
  const [mode, setMode] = useState<"edit" | "result">("edit");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<number | null>(null);
  const [runId, setRunId] = useState(0);

  const [url, setUrl] = useState("");
  const [fetchStatus, setFetchStatus] = useState<"idle" | "loading" | "error">("idle");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { segs, markerByFinding } = useMemo(
    () => annotate(text, result?.findings ?? [], applied),
    [text, result, applied],
  );

  function loadText(next: string, name: string) {
    setText(next);
    setFileName(name);
    setMode("edit");
    setResult(null);
    setApplied(new Set());
    setStatus("idle");
    setError(null);
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    loadText(await file.text(), file.name);
    e.target.value = "";
  }

  async function fetchUrl() {
    if (!url.trim() || fetchStatus === "loading") return;
    setFetchStatus("loading");
    setFetchError(null);
    try {
      const res = await fetch("/api/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Couldn't fetch that URL.");
      loadText(data.text as string, (data.source as string) || "fetched.txt");
      setFetchStatus("idle");
    } catch (err) {
      setFetchStatus("error");
      setFetchError(err instanceof Error ? err.message : "Couldn't fetch that URL.");
    }
  }

  async function runCheck() {
    if (!text.trim() || status === "loading") return;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Check failed.");
      setResult(data as CheckResult);
      setApplied(new Set());
      setMode("result");
      setStatus("idle");
      setActive(null);
      setRunId((n) => n + 1);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function applyFinding(idx: number) {
    if (!result || applied.has(idx)) return;
    const f = result.findings[idx];
    const at = text.indexOf(f.quote);
    if (at !== -1) {
      setText(text.slice(0, at) + f.rewrite + text.slice(at + f.quote.length));
    }
    setApplied((prev) => new Set(prev).add(idx));
  }

  function applyAll() {
    if (!result) return;
    let next = text;
    const all = new Set(applied);
    result.findings.forEach((f, i) => {
      if (all.has(i)) return;
      const at = next.indexOf(f.quote);
      if (at !== -1) next = next.slice(0, at) + f.rewrite + next.slice(at + f.quote.length);
      all.add(i);
    });
    setText(next);
    setApplied(all);
  }

  function download() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = correctedName(fileName);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
    flash("Downloaded corrected file");
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      flash("Copied corrected text");
    } catch {
      flash("Couldn't copy — select and copy manually");
    }
  }

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2200);
  }

  const score = result?.score ?? null;
  const total = result?.findings.length ?? 0;
  const appliedCount = applied.size;
  const allApplied = total > 0 && appliedCount === total;

  return (
    <>
      {/* ---------------- top bar ---------------- */}
      <header className="topbar">
        <div className="shell topbar-in">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            Tono
          </div>
          <nav className="topnav" aria-label="Primary">
            <a href="#proof">The proof</a>
            <a href="#voice">Your voice</a>
            <a href="#how">How it works</a>
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <span className="status">
              <span className="dot" aria-hidden />
              <span className="mono">voice synced</span>
            </span>
            <button className="btn btn-primary" onClick={() => loadText("", "untitled.txt")}>
              New check
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* ---------------- hero ---------------- */}
        <section className="shell hero">
          <span className="eyebrow">Brand voice · consistency</span>
          <h1>
            Keep every word in <em>your</em> voice.
          </h1>
          <p className="lede">
            Paste copy, upload a file, or pull in a post by URL. Tono reads it
            against the voice you&rsquo;ve defined &mdash; marks every place it
            drifts off-brand, explains why, and rewrites it back into tune.
          </p>
          <div className="hero-meta">
            <span className="chip">
              checks against <b>{BRAND_PROFILE.rules.length} rule groups</b>
            </span>
            <span className="chip">
              powered by <b>Claude</b>
            </span>
            <span className="chip">
              fix in place &middot; <b>download corrected</b>
            </span>
          </div>
        </section>

        {/* ---------------- the signature: instrument panel ---------------- */}
        <section className="shell" id="proof">
          <div className="panel">
            <div className="panel-head">
              <div className="panel-file">
                <span className="doticon" aria-hidden />
                <div style={{ minWidth: 0 }}>
                  <div className="name">{fileName}</div>
                  <div className="sub">
                    {mode === "result"
                      ? `checked against “${BRAND_PROFILE.name}”`
                      : "draft · not yet checked"}
                  </div>
                </div>
              </div>

              {/* voice meter */}
              <div
                className="meter"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={score ?? 0}
                aria-label="Voice alignment"
                title="How closely this copy matches your brand voice, from 0 to 100."
              >
                <span className="meter-label">Voice alignment</span>
                <span className="meter-track">
                  <span
                    key={runId}
                    className="meter-fill"
                    style={{ "--score": `${score ?? 0}%` } as React.CSSProperties}
                  />
                </span>
                <span className="meter-score">
                  {score ?? "—"}
                  <small>{score === null ? "" : "%"}</small>
                </span>
              </div>

              <div className="head-actions">
                <label className="btn btn-ghost" title="Upload a .txt or .md file">
                  Upload
                  <input
                    type="file"
                    accept=".txt,.md,text/plain,text/markdown"
                    onChange={onUpload}
                    hidden
                  />
                </label>
                {mode === "result" ? (
                  <button className="btn btn-ghost" onClick={() => setMode("edit")}>
                    Edit text
                  </button>
                ) : null}
                <button
                  className="btn btn-primary"
                  onClick={runCheck}
                  disabled={status === "loading"}
                >
                  {status === "loading" ? (
                    <span className="loading">
                      <span className="spinner" aria-hidden />
                      Checking…
                    </span>
                  ) : mode === "result" ? (
                    "↻ Re-run check"
                  ) : (
                    "Run brand check"
                  )}
                </button>
              </div>
            </div>

            <div className="panel-body">
              {/* document / editor */}
              <div className="doc-wrap">
                {mode === "edit" ? (
                  <div className="edit-pane">
                    <div className="source-bar">
                      <input
                        className="url-input"
                        type="url"
                        inputMode="url"
                        placeholder="Paste a link to a post or article…"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && fetchUrl()}
                      />
                      <button
                        className="btn btn-ghost url-fetch"
                        onClick={fetchUrl}
                        disabled={fetchStatus === "loading"}
                      >
                        {fetchStatus === "loading" ? (
                          <span className="loading">
                            <span className="spinner dark" aria-hidden />
                            Fetching…
                          </span>
                        ) : (
                          "Fetch text"
                        )}
                      </button>
                    </div>
                    <p className="source-hint">
                      {fetchStatus === "error" ? (
                        <span className="hint-err">{fetchError}</span>
                      ) : (
                        <>
                          Works for public posts and articles. Live logged-in feeds
                          and posting the fix back need the platform&rsquo;s account
                          connection (OAuth).
                        </>
                      )}
                    </p>
                    <textarea
                      className="editor"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Paste your copy here, upload a file, or fetch a URL above…"
                      spellCheck={false}
                    />
                  </div>
                ) : (
                  <>
                    <p className="doc" key={runId}>
                      <span className="doc-kicker">
                        {total > 0
                          ? `${total} issue${total === 1 ? "" : "s"} found${appliedCount ? ` · ${appliedCount} fixed` : ""}`
                          : "On-brand — no issues found"}
                      </span>
                      {segs.map((seg, i) =>
                        seg.match ? (
                          <span
                            key={i}
                            className={`flag${active === seg.match.idx ? " is-active" : ""}`}
                            onMouseEnter={() => setActive(seg.match!.idx)}
                            onMouseLeave={() => setActive(null)}
                          >
                            {seg.text}
                            <sup>{seg.match.n}</sup>
                          </span>
                        ) : (
                          <span key={i}>{seg.text}</span>
                        ),
                      )}
                    </p>
                    <span className="scan" key={`scan-${runId}`} aria-hidden />
                  </>
                )}
              </div>

              {/* margin notes */}
              <aside className="notes" aria-label="Findings">
                <div className="notes-head">
                  <span className="t">Off-brand findings</span>
                  <span className="c mono">
                    {mode === "result" ? `${appliedCount}/${total} fixed` : "—"}
                  </span>
                </div>

                {mode !== "result" ? (
                  <div className="empty">
                    {status === "error" ? (
                      <p className="empty-err">{error}</p>
                    ) : (
                      <p>
                        Run the check to see where your copy drifts off-brand. Each
                        finding explains the issue and offers a one-click fix.
                      </p>
                    )}
                  </div>
                ) : total === 0 ? (
                  <div className="empty">
                    <p>{result?.summary || "This copy already reads on-brand. Nothing to flag."}</p>
                  </div>
                ) : (
                  <>
                    {result?.summary ? <p className="notes-summary">{result.summary}</p> : null}

                    <div className="notes-actions">
                      <button className="mini mini-apply" onClick={applyAll} disabled={allApplied}>
                        {allApplied ? "All fixes applied" : "Apply all fixes"}
                      </button>
                      <button className="mini" onClick={download} title="Save the corrected text as a file">
                        Download
                      </button>
                      <button className="mini" onClick={copyText} title="Copy the corrected text">
                        Copy
                      </button>
                    </div>
                    {appliedCount > 0 && !allApplied ? (
                      <p className="restale">Fixes applied — re-run the check to refresh the score.</p>
                    ) : null}

                    {result?.findings.map((f, idx) => {
                      const marker = markerByFinding.get(idx);
                      const isApplied = applied.has(idx);
                      return (
                        <div
                          key={`${idx}-${runId}`}
                          className={`note${active === idx ? " is-active" : ""}${isApplied ? " is-applied" : ""}`}
                          style={{ animationDelay: `${0.05 * idx}s` }}
                          onMouseEnter={() => setActive(idx)}
                          onMouseLeave={() => setActive(null)}
                        >
                          <div className="note-top">
                            <span
                              className={`note-marker sev-${f.severity}`}
                              title={`Severity: ${f.severity}`}
                            >
                              {isApplied ? "✓" : (marker ?? "–")}
                            </span>
                            <span className="note-rule" title="Brand rule this breaks">
                              {f.rule}
                            </span>
                            <span className="note-title">{f.title}</span>
                            <span className={`note-sev sev-text-${f.severity}`} title={SEVERITY_HELP[f.severity]}>
                              {f.severity}
                            </span>
                          </div>
                          <p className="note-explain">{f.explanation}</p>
                          <div className="note-rewrite">
                            <span className="arrow" aria-hidden>
                              →
                            </span>
                            <span>{f.rewrite}</span>
                          </div>
                          <div className="note-actions">
                            {isApplied ? (
                              <span className="applied-tag">✓ Applied in text</span>
                            ) : (
                              <button
                                className="mini mini-apply"
                                onClick={() => applyFinding(idx)}
                                title="Replace this passage with the on-brand rewrite"
                              >
                                Apply rewrite
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </aside>
            </div>
          </div>
        </section>

        {/* ---------------- how it works ---------------- */}
        <section className="shell how" id="how">
          <span className="eyebrow">How it works</span>
          <ol className="steps">
            <li>
              <span className="step-n">1</span>
              <h3>Bring the copy</h3>
              <p>Type or paste it, upload a .txt / .md file, or fetch a public post or article by URL.</p>
            </li>
            <li>
              <span className="step-n">2</span>
              <h3>Run the check</h3>
              <p>
                Claude reads it against your voice profile and returns an alignment
                score plus every off-brand passage, each with a plain-language reason.
              </p>
            </li>
            <li>
              <span className="step-n">3</span>
              <h3>Fix &amp; ship</h3>
              <p>Apply rewrites in place one at a time or all at once, then download or copy the corrected copy.</p>
            </li>
          </ol>
        </section>

        {/* ---------------- voice definition (the actual rules) ---------------- */}
        <section className="shell voice" id="voice">
          <div className="section-head">
            <div>
              <span className="eyebrow">The voice profile</span>
              <h2>
                These are the rules Tono <em>checks against</em>.
              </h2>
            </div>
            <p>
              One profile you control &mdash; <b>{BRAND_PROFILE.name}</b>. Every finding
              traces back to one of these rules, so nothing the checker flags is a mystery.
            </p>
          </div>
          <div className="voice-grid">
            {BRAND_PROFILE.rules.map((r) => (
              <div className="vcard" key={r.code}>
                <span className="vnum">{r.code}</span>
                <h3>{r.name}</h3>
                <p>{r.summary}</p>
                <div className="vrules">
                  {r.prefer.map((g) => (
                    <span className="vrule good" key={g} title="Prefer this">
                      {g}
                    </span>
                  ))}
                  {r.avoid.map((b) => (
                    <span className="vrule bad" key={b} title="Avoid this">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="legend">
            <span className="legend-item">
              <span className="legend-dot sev-high" /> high &mdash; clearly breaks the voice
            </span>
            <span className="legend-item">
              <span className="legend-dot sev-medium" /> medium &mdash; noticeably off
            </span>
            <span className="legend-item">
              <span className="legend-dot sev-low" /> low &mdash; minor polish
            </span>
          </div>
        </section>
      </main>

      {/* ---------------- footer ---------------- */}
      <footer className="foot">
        <div className="shell foot-in">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            Tono
          </div>
          <span className="mono">in tune since 2026 — placeholder, inc.</span>
          <span>© Placeholder content for design review</span>
        </div>
      </footer>

      {/* transient toast */}
      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}
