"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useBrandCheck } from "@/hooks/useBrandCheck";
import { useSocial } from "@/hooks/useSocial";
import { BRAND_PROFILE } from "@/lib/brand";
import type { SocialPost, SocialProvider } from "@/lib/types";
import { VoiceMeter } from "@/components/VoiceMeter";
import { EditorPane } from "@/components/EditorPane";
import { AnnotatedDoc } from "@/components/AnnotatedDoc";
import { FindingsPanel, type RepostCtx } from "@/components/FindingsPanel";
import { SocialConnect } from "@/components/SocialConnect";
import { Toast } from "@/components/Toast";

type Selected = {
  provider: SocialProvider;
  target: string;
  postId: string;
  permalink?: string;
  canEdit: boolean;
};

export function BrandCheckApp() {
  const bc = useBrandCheck();
  const social = useSocial();

  const [url, setUrl] = useState("");
  const [fetchBusy, setFetchBusy] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [repostBusy, setRepostBusy] = useState(false);
  const [repostDone, setRepostDone] = useState(false);

  useEffect(() => {
    void social.refreshStatus();
    const params = new URLSearchParams(window.location.search);
    const s = params.get("social");
    const reason = params.get("reason");
    if (s) {
      if (s === "connected") {
        bc.flash("Connected");
      } else if (s === "not_configured") {
        bc.flash("Add Meta credentials to connect", 7000);
      } else if (s === "denied") {
        bc.flash(`Connection cancelled${reason ? `: ${reason}` : ""}`, 7000);
      } else {
        // bad_state / error
        bc.flash(`Connection failed — ${reason ?? "see server logs"}`, 9000);
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchUrl() {
    if (!url.trim() || fetchBusy) return;
    setFetchBusy(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Couldn't fetch that URL.");
      bc.loadText(data.text as string, (data.source as string) || "fetched.txt");
      setSelected(null);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Couldn't fetch that URL.");
    } finally {
      setFetchBusy(false);
    }
  }

  async function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Couldn't read that file.");
      bc.loadText(data.text as string, (data.name as string) || file.name);
      setSelected(null);
    } catch (err) {
      bc.flash(err instanceof Error ? err.message : "Couldn't read that file");
    } finally {
      setUploadBusy(false);
    }
  }

  function pickPost(post: SocialPost) {
    bc.loadText(post.text, `${post.provider}-${post.id}.txt`);
    if (social.target) {
      setSelected({
        provider: post.provider,
        target: social.target,
        postId: post.id,
        permalink: post.permalink,
        canEdit: post.canEdit,
      });
    }
    setRepostDone(false);
    document.getElementById("proof")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function doRepost() {
    if (!selected) return;
    setRepostBusy(true);
    try {
      await social.repost(selected.target, selected.postId, bc.text);
      setRepostDone(true);
      bc.flash("Reposted corrected version");
    } catch (e) {
      bc.flash(e instanceof Error ? e.message : "Repost failed");
    } finally {
      setRepostBusy(false);
    }
  }

  const score = bc.result?.score ?? null;
  const repost: RepostCtx = selected
    ? {
        canEdit: selected.canEdit,
        providerLabel: selected.provider === "facebook" ? "Facebook" : "Instagram",
        permalink: selected.permalink,
        busy: repostBusy,
        done: repostDone,
        onRepost: doRepost,
      }
    : null;

  return (
    <>
      <section className="shell social-section">
        <SocialConnect social={social} onPickPost={pickPost} selectedPostId={selected?.postId ?? null} />
      </section>

      <section className="shell" id="proof">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-file">
              <span className="doticon" aria-hidden />
              <div style={{ minWidth: 0 }}>
                <div className="name">{bc.fileName}</div>
                <div className="sub">
                  {bc.mode === "result"
                    ? `checked against “${BRAND_PROFILE.name}”`
                    : "draft · not yet checked"}
                </div>
              </div>
            </div>

            <VoiceMeter score={score} runId={bc.runId} />

            <div className="head-actions">
              <label
                className="btn btn-ghost"
                title="Upload .txt, .md, .csv, .json, .html, .docx, or .pdf"
              >
                {uploadBusy ? (
                  <span className="loading">
                    <span className="spinner" aria-hidden />
                    Reading…
                  </span>
                ) : (
                  "Upload"
                )}
                <input
                  type="file"
                  accept=".txt,.md,.markdown,.csv,.json,.log,.html,.htm,.rtf,.docx,.pdf,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={onUpload}
                  hidden
                  disabled={uploadBusy}
                />
              </label>
              {bc.mode === "result" ? (
                <button className="btn btn-ghost" onClick={() => bc.setMode("edit")}>
                  Edit text
                </button>
              ) : null}
              <button className="btn btn-primary" onClick={bc.runCheck} disabled={bc.status === "loading"}>
                {bc.status === "loading" ? (
                  <span className="loading">
                    <span className="spinner" aria-hidden />
                    Checking…
                  </span>
                ) : bc.mode === "result" ? (
                  "↻ Re-run check"
                ) : (
                  "Run brand check"
                )}
              </button>
            </div>
          </div>

          <div className="panel-body">
            <div className="doc-wrap">
              {bc.mode === "edit" ? (
                <EditorPane
                  text={bc.text}
                  onTextChange={bc.setText}
                  url={url}
                  onUrlChange={setUrl}
                  onFetch={fetchUrl}
                  fetchBusy={fetchBusy}
                  fetchError={fetchError}
                />
              ) : (
                <AnnotatedDoc
                  segments={bc.annotation.segments}
                  total={bc.result?.findings.length ?? 0}
                  appliedCount={bc.applied.size}
                  active={bc.active}
                  onActive={bc.setActive}
                  runId={bc.runId}
                />
              )}
            </div>

            <FindingsPanel
              mode={bc.mode}
              status={bc.status}
              error={bc.error}
              result={bc.result}
              applied={bc.applied}
              markerByFinding={bc.annotation.markerByFinding}
              active={bc.active}
              onActive={bc.setActive}
              onApply={bc.applyFinding}
              onApplyAll={bc.applyAll}
              onExport={bc.exportAs}
              onCopy={bc.copyText}
              repost={repost}
            />
          </div>
        </div>
      </section>

      <Toast message={bc.toast} />
    </>
  );
}
