import Link from "next/link";

export default function NotFound() {
  return (
    <div className="narrow card stack">
      <h2>Voz nije pronađen</h2>
      <p className="muted">Možda je reč o vožnji od pre nekoliko dana. Na tabli polazaka su vozovi za danas.</p>
      <Link className="primary" href="/">Na tablu polazaka</Link>
    </div>
  );
}
