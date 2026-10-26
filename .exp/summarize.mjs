import fs from "node:fs";
for (const file of process.argv.slice(2)) {
  const samples = JSON.parse(fs.readFileSync(file, "utf8"));
  const byTick = {};
  for (const s of samples) (byTick[s.tick] ??= []).push(s);
  console.log(`== ${file.split("/").slice(-2).join("/")}`);
  for (const [tick, list] of Object.entries(byTick)) console.log(`  ${tick}: ` + list.map((s) => `${s.into.toFixed(2)}:${s.glow}${s.shard === undefined ? "" : "/" + s.shard}`).join(" "));
}
