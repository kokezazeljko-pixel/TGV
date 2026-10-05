// Netherlands (NS and international trains): official open data from NDOV / OVapi (https://gtfs.ovapi.nl/nl/, no key).
// Static GTFS for the whole country (all transport, ~260 MB) and GTFS-RT "trainUpdates" (every train, with delays,
// cancellations and platform changes in OVapi extension 1003).
export const NL_STATIC_URL = "https://gtfs.ovapi.nl/nl/gtfs-nl.zip";
export const NL_TRAINS_URL = "https://gtfs.ovapi.nl/nl/trainUpdates.pb";
// OVapi asks clients to identify themselves
export const NL_HEADERS = { "User-Agent": "TrainPunctuality/1.0 (+https://www.trainpunctuality.com)" };

// Railway companies kept: NS, NS International, European Sleeper and the Keolis intercity Zwolle–Enschede
const NL_AGENCIES = new Set(["IFF:NS", "IFF:NS_INT", "IFF:EU_SLEEPER", "IFF:BLAUWNET_K"]);
// routes.txt route_short_name -> train type on the site (Sprinter, buses, metro replacements are left out)
const NL_CATS = [
  [/^intercity direct$/i, "ICD"],
  [/^intercity\b/i, "IC"],
  [/^ice$/i, "ICE"],
  [/^eurostar$/i, "Eurostar"],
  [/^eurocity direct$/i, "ECD"],
  [/^eurocity$/i, "EC"],
  [/^(nightjet|european sleeper)$/i, "Night train"],
];
export function detectDutchType(route = {}) {
  if (String(route.route_type) !== "2" || !NL_AGENCIES.has(route.agency_id)) return null;
  const name = (route.route_short_name || "").trim();
  for (const [re, type] of NL_CATS) if (re.test(name)) return type;
  return null;
}

// Station code from stops.txt zone_id ("IFF:asd" -> "asd"); the realtime feed names stations the same way
export const stationCode = (zoneId = "") => (/^IFF:([a-z0-9]+)$/i.exec(zoneId)?.[1] || "").toLowerCase() || null;
