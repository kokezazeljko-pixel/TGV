import { notFound } from "next/navigation";
import TrainDetail from "@/components/TrainDetail";
import { getServerClient, isConfigured } from "@/lib/supabase";
import { TRAIN_FIELDS } from "@/lib/format";

export const revalidate = 60;

function decodeId(raw) {
  try { return decodeURIComponent(raw); } catch { return raw; }
}

async function loadTrain(id) {
  if (!isConfigured) return null;
  const { data } = await getServerClient().from("trains").select(TRAIN_FIELDS).eq("id", id).maybeSingle();
  return data;
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const t = await loadTrain(decodeId(id));
  if (!t) return { title: "Voz nije pronađen" };
  return {
    title: `${t.type} ${t.number} ${t.origin} – ${t.destination}`,
    description: `Kašnjenje i utisci putnika za ${t.type} ${t.number}, polazak ${t.dep}.`,
  };
}

export default async function TrainPage({ params }) {
  const { id } = await params;
  const train = await loadTrain(decodeId(id));
  if (!train) notFound();
  return <TrainDetail initialTrain={train} />;
}
