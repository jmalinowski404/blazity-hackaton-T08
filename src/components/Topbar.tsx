import { BrandMark } from "@/components/BrandMark";
import { NewCheckButton } from "@/components/NewCheckButton";

export function Topbar() {
  return (
    <header className="topbar">
      <div className="shell topbar-in">
        <div className="brand">
          <BrandMark />
          Tono
        </div>
        <nav className="topnav" aria-label="Primary">
          <a href="#connect">Channels</a>
          <a href="#proof">The proof</a>
          <a href="#how">How it works</a>
          <a href="#voice">Your voice</a>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <NewCheckButton />
        </div>
      </div>
    </header>
  );
}
