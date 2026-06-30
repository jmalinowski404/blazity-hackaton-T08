"use client";

import { useRef } from "react";

const FORMATS: { id: string; label: string }[] = [
  { id: "txt", label: "Plain text (.txt)" },
  { id: "md", label: "Markdown (.md)" },
  { id: "html", label: "HTML (.html)" },
  { id: "docx", label: "Word (.docx)" },
  { id: "pdf", label: "PDF (.pdf)" },
  { id: "json", label: "JSON (.json)" },
];

export function DownloadMenu({ onExport }: { onExport: (format: string) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);

  function pick(format: string) {
    onExport(format);
    if (ref.current) ref.current.open = false;
  }

  return (
    <details className="dl" ref={ref}>
      <summary className="mini" title="Download the corrected text in a format">
        Download ▾
      </summary>
      <div className="dl-menu" role="menu">
        {FORMATS.map((f) => (
          <button key={f.id} role="menuitem" className="dl-item" onClick={() => pick(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
    </details>
  );
}
