import type { CheckResult } from "@/lib/types";
import { FindingCard } from "@/components/FindingCard";
import { DownloadMenu } from "@/components/DownloadMenu";

export type RepostCtx = {
  canEdit: boolean;
  providerLabel: string;
  permalink?: string;
  busy: boolean;
  done: boolean;
  onRepost: () => void;
} | null;

type Props = {
  mode: "edit" | "result";
  status: "idle" | "loading" | "error";
  error: string | null;
  result: CheckResult | null;
  applied: Set<number>;
  markerByFinding: Map<number, number>;
  active: number | null;
  onActive: (idx: number | null) => void;
  onApply: (idx: number) => void;
  onApplyAll: () => void;
  onExport: (format: string) => void;
  onCopy: () => void;
  repost: RepostCtx;
};

export function FindingsPanel({
  mode,
  status,
  error,
  result,
  applied,
  markerByFinding,
  active,
  onActive,
  onApply,
  onApplyAll,
  onExport,
  onCopy,
  repost,
}: Props) {
  const total = result?.findings.length ?? 0;
  const appliedCount = applied.size;
  const allApplied = total > 0 && appliedCount === total;

  return (
    <aside className="notes" aria-label="Findings">
      <div className="notes-head">
        <span className="t">Off-brand findings</span>
        <span className="c mono">{mode === "result" ? `${appliedCount}/${total} fixed` : "—"}</span>
      </div>

      {mode !== "result" ? (
        <div className="empty">
          {status === "error" ? (
            <p className="empty-err">{error}</p>
          ) : (
            <p>
              Run the check to see where your copy drifts off-brand. Each finding
              explains the issue and offers a one-click fix.
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
            <button className="mini mini-apply" onClick={onApplyAll} disabled={allApplied}>
              {allApplied ? "All fixes applied" : "Apply all fixes"}
            </button>
            <DownloadMenu onExport={onExport} />
            <button className="mini" onClick={onCopy} title="Copy the corrected text">
              Copy
            </button>
          </div>

          {repost ? (
            <div className="repost-bar">
              {repost.canEdit ? (
                <button
                  className="mini mini-repost"
                  onClick={repost.onRepost}
                  disabled={repost.busy || repost.done}
                  title={`Write the corrected text back to the ${repost.providerLabel} post`}
                >
                  {repost.done
                    ? `✓ Reposted to ${repost.providerLabel}`
                    : repost.busy
                      ? "Reposting…"
                      : `Repost corrected to ${repost.providerLabel}`}
                </button>
              ) : (
                <p className="repost-note">
                  {repost.providerLabel} can&rsquo;t edit a live caption via the API — use{" "}
                  <b>Copy</b> and paste the corrected caption{" "}
                  {repost.permalink ? (
                    <>
                      into{" "}
                      <a href={repost.permalink} target="_blank" rel="noreferrer">
                        the post
                      </a>
                    </>
                  ) : null}
                  .
                </p>
              )}
            </div>
          ) : null}

          {appliedCount > 0 && !allApplied ? (
            <p className="restale">Fixes applied — re-run the check to refresh the score.</p>
          ) : null}
          <ul className="findings-list">
            {result?.findings.map((f, idx) => (
                <FindingCard
                    key={`${idx}-${f.quote}`}
                    finding={f}
                    marker={markerByFinding.get(idx)}
                    isApplied={applied.has(idx)}
                    isActive={active === idx}
                    onHover={(on) => onActive(on ? idx : null)}
                    onApply={() => onApply(idx)}
                    delay={0.05 * idx}
                />
            ))}
          </ul>

        </>
      )}
    </aside>
  );
}
