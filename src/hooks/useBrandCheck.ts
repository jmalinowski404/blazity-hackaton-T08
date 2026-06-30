import { useMemo, useState } from "react";
import { annotate } from "@/lib/annotate";
import type { CheckResult } from "@/lib/types";

const SAMPLE = `We're thrilled to announce a revolutionary new platform that will utilize cutting-edge AI to leverage synergies across your entire content stack. Our best-in-class solution empowers stakeholders to ideate at scale. Click Here To Learn More!!!`;

export function useBrandCheck() {
  const [text, setText] = useState(SAMPLE);
  const [fileName, setFileName] = useState("untitled.txt");
  const [mode, setMode] = useState<"edit" | "result">("edit");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<number | null>(null);
  const [runId, setRunId] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const annotation = useMemo(
    () => annotate(text, result?.findings ?? [], applied),
    [text, result, applied],
  );

  function flash(msg: string, ms = 2400) {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), ms);
  }

  function loadText(next: string, name: string) {
    setText(next);
    setFileName(name);
    setMode("edit");
    setResult(null);
    setApplied(new Set());
    setStatus("idle");
    setError(null);
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
    if (at !== -1) setText(text.slice(0, at) + f.rewrite + text.slice(at + f.quote.length));
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

  async function exportAs(format: string) {
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, format, name: fileName }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? "Export failed.");
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const base = fileName.replace(/\.[^.]+$/, "") || "corrected";
      a.href = href;
      a.download = `${base}-corrected.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      flash(`Downloaded .${format}`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Export failed");
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      flash("Copied corrected text");
    } catch {
      flash("Couldn't copy — select the text and copy manually");
    }
  }

  return {
    text,
    setText,
    fileName,
    mode,
    setMode,
    status,
    error,
    result,
    applied,
    active,
    setActive,
    runId,
    toast,
    flash,
    annotation,
    loadText,
    runCheck,
    applyFinding,
    applyAll,
    exportAs,
    copyText,
  };
}
