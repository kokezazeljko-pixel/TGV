import Board from "@/components/Board";
import { getServerClient, isConfigured } from "@/lib/supabase";
import { parisDate } from "@/lib/format";
import { fetchTrainsForDay, fetchCommentCounts } from "@/lib/queries";

export const revalidate = 60; // the server refreshes this page at most once a minute

export default async function Home() {
  if (!isConfigured) return <SetupNotice />;

  const today = parisDate();
  const sb = getServerClient();
  const [{ data: trains, error }, counts] = await Promise.all([fetchTrainsForDay(sb, today, "all"), fetchCommentCounts(sb, today)]);

  return <Board initialTrains={trains || []} initialCounts={counts} today={today} loadError={error?.message} />;
}

function SetupNotice() {
  return (
    <div className="notice" style={{ marginTop: 24 }}>
      <b>The site isn&apos;t connected to the database yet.</b> Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
      (README.md, step 2 and step 6).
    </div>
  );
}
