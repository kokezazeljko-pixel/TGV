import Board from "@/components/Board";
import { getServerClient, isConfigured } from "@/lib/supabase";
import { parisDate } from "@/lib/format";
import { fetchTrainsForDay, fetchCommentCounts } from "@/lib/queries";

export const revalidate = 60; // stranica se osvežava na serveru najviše jednom u minuti

export default async function Home() {
  if (!isConfigured) return <SetupNotice />;

  const today = parisDate();
  const sb = getServerClient();
  const [{ data: trains, error }, counts] = await Promise.all([fetchTrainsForDay(sb, today), fetchCommentCounts(sb, today)]);

  return <Board initialTrains={trains || []} initialCounts={counts} today={today} loadError={error?.message} />;
}

function SetupNotice() {
  return (
    <div className="notice" style={{ marginTop: 24 }}>
      <b>Sajt još nije povezan sa bazom.</b> Napravi fajl <code>.env.local</code> po uzoru na <code>.env.example</code> i
      upiši adresu i ključ svog Supabase projekta (README.md, korak 2).
    </div>
  );
}
