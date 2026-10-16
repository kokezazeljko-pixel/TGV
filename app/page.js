import Board from "@/components/Board";
import { isConfigured } from "@/lib/supabase";
import { parisDate } from "@/lib/format";

export const revalidate = 3600; // the server rebuilds this page at most once an hour (each rebuild is a Vercel "ISR write")

// The page carries no trains: the browser loads them from the database right away (a ready compact copy, made
// once a minute). So Vercel only sends a small page, however many visitors come.
export default function Home() {
  if (!isConfigured) return <SetupNotice />;
  return <Board initialCounts={{}} today={parisDate()} />;
}

function SetupNotice() {
  return (
    <div className="notice" style={{ marginTop: 24 }}>
      <b>The site isn&apos;t connected to the database yet.</b> Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
      (README.md, step 2 and step 6).
    </div>
  );
}
