import { notFound } from "next/navigation";
import TrainDetail from "@/components/TrainDetail";
import { getServerClient, isConfigured } from "@/lib/supabase";
import { TRAIN_FIELDS } from "@/lib/format";

export const dynamic = "force-dynamic";


function decodeId(raw) {
  try { return decodeURIComponent(raw); } catch { return raw; }
}

async function loadTrain(id) {
  if (!isConfigured) return null;
  const { data } = await getServerClient().from("trains").select(TRAIN_FIELDS + ",rt_checked_at").eq("id", id).maybeSingle();
  return data;
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const t = await loadTrain(decodeId(id));
  if (!t) return { title: "Train not found" };
  return {
    title: `${t.type} ${t.number} ${t.origin} – ${t.destination}`,
    description: `Delay and passenger reports for ${t.type} ${t.number}, departing ${t.dep}. Retard et avis des voyageurs.`,
    robots: { index: false, follow: true }, // a train page exists only for its travel day
  };
}

export default async function TrainPage({ params }) {
  const { id } = await params;
  const train = await loadTrain(decodeId(id));
  if (!train) notFound();
  return <TrainDetail initialTrain={train} />;
}
