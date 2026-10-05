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

// Prolazi kroz CSV stream i za svaki red poziva onRow(objekat).
// first (optional): { col, keep } – a row whose first column is `col` is parsed only if keep(value) is true.
// Big files (Dutch stop_times.txt: 1.2 GB) are then mostly skipped without splitting every line into fields.
export async function eachRow(stream, onRow, first = null) {
  let header = null, rest = "";
  const decoder = new StringDecoder("utf8"); // ispravno spaja slova (é, è…) podeljena između delova
  const handle = (line) => {
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (!line) return;
    if (!header) {
      header = parseLine(line.replace(/^\uFEFF/, "")).map((h) => h.trim());
      if (first && header[0] !== first.col) first = null;
      return;
    }
    if (first) {
      const c = line.indexOf(",");
      const v = c < 0 ? line : line.slice(0, c);
      if (!first.keep(v.startsWith('"') ? v.slice(1, -1) : v)) return;
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
