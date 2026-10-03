import { StringDecoder } from "node:string_decoder";

// Čitanje CSV fajlova (GTFS) red po red, bez učitavanja celog fajla u memoriju.

export function parseLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// Prolazi kroz CSV stream i za svaki red poziva onRow(objekat)
export async function eachRow(stream, onRow) {
  let header = null, rest = "";
  const decoder = new StringDecoder("utf8"); // ispravno spaja slova (é, è…) podeljena između delova
  const handle = (line) => {
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (!line) return;
    if (!header) {
      header = parseLine(line.replace(/^\uFEFF/, "")).map((h) => h.trim());
      return;
    }
    const vals = parseLine(line);
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = vals[i] ?? "";
    onRow(row);
  };
  for await (const chunk of stream) {
    const text = rest + decoder.write(chunk);
    const lines = text.split("\n");
    rest = lines.pop();
    for (const l of lines) handle(l);
  }
  rest += decoder.end();
  if (rest) handle(rest);
}
