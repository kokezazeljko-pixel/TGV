"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TrainMap from "@/components/TrainMap";
import { getBrowserClient } from "@/lib/supabase";
import { TRAIN_FIELDS, trainHref } from "@/lib/format";

// The station page's map: today's trains through the station (loaded in the browser, straight from the database,
// so it costs Vercel nothing), the lines they come from and go to lit up from the station, and the trains
// running now moving on it. Drawn once the trains are in, so the map zooms onto the whole network of the station.
export default function StationMap({ country, name, day }) {
  const router = useRouter();
  const [trains, setTrains] = useState(null);
  useEffect(() => {
    const sb = getBrowserClient();
    if (!sb) return;
    let alive = true;
    sb.from("trains").select(TRAIN_FIELDS).eq("country", country).eq("service_date", day)
      .contains("stops", JSON.stringify([{ name }])).limit(1000) // a string: jsonb containment, not a Postgres array
      .then(({ data }) => alive && setTrains(data || []));
    return () => { alive = false; };
  }, [country, name, day]);

  if (!trains) return <div className="mapbox" style={{ aspectRatio: "16 / 10" }} aria-busy="true" />;
  if (!trains.length) return null;
  return (
    <TrainMap
      country={country}
      trains={trains}
      selectedStation={name}
      reachBoth
      onTrainClick={(tr) => router.push(trainHref(tr.id))}
    />
  );
}
