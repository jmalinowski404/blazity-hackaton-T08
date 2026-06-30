import { BRAND_PROFILE } from "@/lib/brand";

export function VoiceProfile() {
  return (
    <section className="shell voice" id="voice">
      <div className="section-head">
        <div>
          <span className="eyebrow">The voice profile</span>
          <h2>
            These are the rules Tono <span className="text-decoration">checks against</span>.
          </h2>
        </div>
        <p>
          One profile you control &mdash; <b>{BRAND_PROFILE.name}</b>. Every finding
          traces back to one of these rules, so nothing the checker flags is a mystery.
        </p>
      </div>
        <ul className="legend">
        <li className="legend-item">
          <span className="legend-dot sev-high" /> <span className="legend-item-title">High</span>  &mdash; clearly breaks the voice
        </li>
        <li className="legend-item">
          <span className="legend-dot sev-medium" /> <span className="legend-item-title">Medium</span>  &mdash; noticeably off
        </li>
        <li className="legend-item">
          <span className="legend-dot sev-low" /> <span className="legend-item-title">Low</span>  &mdash; minor polish
        </li>
        </ul>

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
    </section>
  );
}
