#!/usr/bin/env node
// Reads src/content/ocellus/fight/data.ts and writes the sourced phase modules.
// Line numbers for ocellus-sim@75bd193 come from scripts/ocellus-sim-75bd193-lines.json.
// Rebuild that index with: node scripts/source-fight-data.mjs --index <his data.ts>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ts = createRequire(import.meta.url)("typescript");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "src/content/ocellus/fight/data.ts");
const outDir = path.join(root, "src/content/ocellus/full/data");
const indexPath = path.join(root, "scripts/ocellus-sim-75bd193-lines.json");

const STRATEGIES = "https://oldschool.runescape.wiki/w/The_Fractured_Archive/Strategies";
const BOSS = "https://oldschool.runescape.wiki/w/Ocellus";
const RSPROX = "https://github.com/MRobertEvers/oldschool-clientc/blob/HEAD/docs/rsprox-analysis/guthixian_archive/ocellus_plan.md";
const DUO = "https://www.youtube.com/watch?v=HAgq_qg0OIY";
const HOTFIX = "https://secure.runescape.com/m=news/the-fractured-archive---out-today?oldschool=1";
const PHASE_FILE = { P1: "p1.ts", P2: "p2.ts", P3: "p3.ts" };
const SKIP = new Set(["P4"]);

const textOf = (file) => fs.readFileSync(file, "utf8");

function parse(file) {
  const text = textOf(file);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return { text, source };
}

function propName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  throw new Error(`unsupported property name ${ts.SyntaxKind[name.kind]}`);
}

function keyLiteral(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : /^\d+$/.test(name) ? name : JSON.stringify(name);
}

function access(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? `.${name}` : `[${/^\d+$/.test(name) ? name : JSON.stringify(name)}]`;
}

function bindingName(exportName) {
  const camel = exportName.toLowerCase().replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
  return `${camel}Sourced`;
}

function commentText(text, source, node) {
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  if (ranges.length === 0) return "";
  const range = ranges[ranges.length - 1];
  if (text.slice(range.end, node.getStart(source)).trim() !== "") return "";
  const raw = text.slice(range.pos, range.end);
  if (raw.startsWith("//")) return raw.slice(2).trim();
  return raw
    .replace(/^\/\*\*?/, "")
    .replace(/\*\/$/, "")
    .replace(/^\s*\*\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tagsIn(comment) {
  return new Set([...comment.matchAll(/\[([KRGWVMO])\]/g)].map((match) => match[1]));
}

function unwrapConst(node) {
  let current = node;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  if (ts.isAsExpression(current) && current.type.getText().replace(/\s+/g, "") === "const") return unwrapConst(current.expression);
  return current;
}

function isRangeCall(node) {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "range" && node.arguments.length === 2;
}

function literalText(node) {
  if (ts.isNumericLiteral(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.getText();
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return node.getText();
  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) return node.getText();
  if (ts.isBinaryExpression(node)) return node.getText();
  return null;
}

function walkPaths(file) {
  const { text, source } = parse(file);
  const lines = {};
  const visitObject = (node, prefix) => {
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const name = propName(prop.name);
      const pathName = `${prefix}.${name}`;
      const { line } = source.getLineAndCharacterOfPosition(prop.name.getStart(source));
      lines[pathName] = line + 1;
      const value = unwrapConst(prop.initializer);
      if (ts.isObjectLiteralExpression(value)) visitObject(value, pathName);
    }
  };
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !statement.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      const name = decl.name.text;
      const { line } = source.getLineAndCharacterOfPosition(decl.name.getStart(source));
      lines[name] = line + 1;
      const value = unwrapConst(decl.initializer);
      if (ts.isObjectLiteralExpression(value)) visitObject(value, name);
    }
  }
  return lines;
}

function readLogs() {
  const cache = new Map();
  return (log) => {
    if (!cache.has(log)) cache.set(log, textOf(path.join(root, "docs/fight-logs", `${log}.txt`)).split("\n"));
    return cache.get(log);
  };
}

function logCitations() {
  const linesOf = readLogs();
  const offsets = (log, pattern) =>
    linesOf(log).flatMap((line, index) => {
      const match = line.match(pattern);
      return match ? [{ line: index + 1, offset: Number(match[1]) }] : [];
    });
  const hits = [];
  for (const log of ["L1", "L2", "L6", "L7", "L8"]) {
    const anims = offsets(log, /\[P3 \+(\d+)\] anim 14846/);
    const floors = new Set(offsets(log, /\[P3 \+(\d+)\] floor 4335/).map((hit) => hit.offset));
    const pair = anims.find((hit) => floors.has(hit.offset + 1));
    if (pair) hits.push({ log, at: `${log}.txt:${pair.line} anim 14846 at P3 +${pair.offset}, floor 4335 at +${pair.offset + 1}` });
  }
  if (hits.length < 2) throw new Error("P3.slashLands needs the slash graphic one tick after anim 14846 in two fight logs");
  return new Map([["P3.slashLands", hits]]);
}

function wikiExpr(exportName) {
  if (exportName === "P1") return `wiki(${JSON.stringify(STRATEGIES)}, 15381731)`;
  if (exportName === "P3" || exportName === "VOID_LOC") return `wiki(${JSON.stringify(STRATEGIES)}, 15381236)`;
  if (exportName === "LOWEST_DEFENCE_FRACTION") return `wiki(${JSON.stringify(STRATEGIES)}, null)`;
  if (exportName === "P2" || exportName === "PORTAL") return `wiki(${JSON.stringify(STRATEGIES)}, null)`;
  return `wiki(${JSON.stringify(BOSS)}, null)`;
}

function noWikiWhy(exportName, tags) {
  if (tags.has("G") || ["NPC", "SEQ", "SPOT", "SOUND", "PORTAL", "VOID_LOC", "PROTECT_MELEE_ICON"].includes(exportName)) {
    return "a cache id, not a rule the wiki states";
  }
  if (exportName === "P1") return "the wiki's phase 1 text gives the order of the attacks but no tick count for this";
  if (exportName === "P2") return "the wiki's phase 2 text does not state this count";
  if (exportName === "P3") return "the wiki's phase 3 text does not state this count";
  return "his fight data cites no wiki statement for this value";
}

function cacheRecord(exportName, valueExpr) {
  if (exportName === "NPC") return `npc ${valueExpr}`;
  if (exportName === "SEQ") return `seq ${valueExpr}`;
  if (exportName === "SPOT") return `spotanim ${valueExpr}`;
  if (exportName === "SOUND") return `sound ${valueExpr}`;
  if (exportName === "PROTECT_MELEE_ICON") return "sprite 440 headicons_prayer";
  if (exportName === "PORTAL") return `object ${valueExpr}`;
  if (exportName === "VOID_LOC") return `object ${valueExpr}`;
  return null;
}

function youtubeIds(comment, tags) {
  const ids = new Set();
  if (tags.has("V")) ids.add("HAgq_qg0OIY");
  for (const match of comment.matchAll(/https:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]{11})/g)) ids.add(match[1]);
  for (const match of comment.matchAll(/youtube(?:\.com\/watch\?v=|\s+)([\w-]{11})/g)) ids.add(match[1]);
  return [...ids];
}

function stamp(comment) {
  const match = comment.match(/\d+:\d+(?::\d+)?(?:-\d+:\d+)?/);
  return match ? match[0] : null;
}

function basisOf(tags, confirmed) {
  if (confirmed) return "log-repeated";
  if (tags.has("G")) return "spec-confirmed";
  if (tags.has("R")) return "spec-confirmed";
  if (tags.has("V") || tags.has("O")) return "footage-once";
  if (tags.has("W")) return "spec-single";
  return "inferred";
}

function metaFor(exportName, pathName, comment, tags, hisLines, confirmed) {
  const note = comment.length > 0 ? comment : pathName;
  const sources = [];
  const used = new Set();
  if (tags.has("W")) {
    sources.push(wikiExpr(exportName));
    used.add("wiki");
    if (exportName === "LOWEST_DEFENCE_FRACTION" || comment.includes("news")) {
      sources.push(`news(${JSON.stringify(HOTFIX)})`);
      used.add("news");
    }
  } else {
    sources.push(`noWiki(${JSON.stringify(noWikiWhy(exportName, tags))})`);
    used.add("noWiki");
  }
  for (const hit of confirmed.get(pathName) ?? []) {
    sources.push(`fightLog(${JSON.stringify(hit.log)}, ${JSON.stringify(hit.at)})`);
    used.add("fightLog");
  }
  if (tags.has("R")) {
    sources.push(`analysis(${JSON.stringify(RSPROX)}, ${JSON.stringify(pathName)})`);
    used.add("analysis");
  }
  for (const id of youtubeIds(comment, tags)) {
    const at = stamp(comment) ?? (id === "HAgq_qg0OIY" ? "12:17 kill" : pathName);
    sources.push(`guide(${JSON.stringify(`https://www.youtube.com/watch?v=${id}`)}, ${JSON.stringify(at)})`);
    used.add("guide");
  }
  if (tags.has("G")) {
    used.add("cache");
  }
  const hisLine = hisLines[pathName];
  if (hisLine !== undefined) {
    sources.push(`ocellusSim(${JSON.stringify(`data.ts:${hisLine}`)})`);
    used.add("ocellusSim");
  }
  return { basis: basisOf(tags, confirmed.has(pathName)), note, sources, used, cache: tags.has("G") };
}

function emitSelected(valueExpr, meta, indent) {
  const args = [valueExpr, JSON.stringify(meta.basis), JSON.stringify("unscaled"), JSON.stringify(meta.note), ...meta.sources];
  const oneLine = `selected(${args.join(", ")})`;
  if (oneLine.length <= 120) return oneLine;
  const pad = " ".repeat(indent);
  return `selected(\n${args.map((arg) => `${pad}  ${arg}`).join(",\n")},\n${pad})`;
}

function tagsInsert(sources) {
  const ocellus = sources.findIndex((source) => source.startsWith("ocellusSim("));
  return ocellus === -1 ? sources.length : ocellus;
}

function convert(node, binding, pathName, inherited, indent, ctx) {
  const current = unwrapConst(node);
  if (ts.isIdentifier(current) && ctx.locals.has(current.text)) {
    return convert(ctx.locals.get(current.text), binding, pathName, inherited, indent, ctx);
  }
  if (isRangeCall(current)) {
    const [min, max] = current.arguments;
    return leaf(`{ min: ${min.getText(ctx.source)}, max: ${max.getText(ctx.source)} }`, binding, pathName, inherited, indent, ctx);
  }
  if (ts.isObjectLiteralExpression(current)) {
    return objectLiteral(current, binding, pathName, inherited, indent, ctx);
  }
  if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
    return leaf(`${current.getText(ctx.source)} as const`, binding, pathName, inherited, indent, ctx);
  }
  if (ts.isArrayLiteralExpression(current)) {
    if (hasObject(current)) throw new Error(`${pathName} has an object inside an array, which this codemod does not wrap`);
    const printed = current.getText(ctx.source).replace(/\s+/g, " ");
    return leaf(`${printed} as const`, binding, pathName, inherited, indent, ctx);
  }
  const printed = literalText(current);
  if (printed === null) throw new Error(`${pathName} is ${ts.SyntaxKind[current.kind]}, which this codemod does not wrap`);
  return leaf(printed, binding, pathName, inherited, indent, ctx);
}

function hasObject(node) {
  const current = unwrapConst(node);
  if (ts.isObjectLiteralExpression(current)) return true;
  if (ts.isArrayLiteralExpression(current)) return current.elements.some((element) => hasObject(element));
  return false;
}

function leaf(expr, binding, pathName, inherited, indent, ctx) {
  const meta = metaFor(ctx.exportName, pathName, inherited.comment, inherited.tags, ctx.hisLines, ctx.confirmed);
  meta.exportName = ctx.exportName;
  if (meta.cache) {
    const record = cacheRecord(ctx.exportName, expr.replace(/\s+as const$/, ""));
    if (record) {
      meta.sources.splice(tagsInsert(meta.sources), 0, `cache(${JSON.stringify(record)})`);
      ctx.used.add("cache");
    }
  }
  for (const helper of meta.used) ctx.used.add(helper);
  ctx.used.add("selected");
  return { sourced: emitSelected(expr, meta, indent), value: `${binding}.value` };
}

function objectLiteral(node, binding, pathName, inherited, indent, ctx) {
  const pad = " ".repeat(indent);
  const inner = " ".repeat(indent + 2);
  const fields = [];
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) throw new Error(`${pathName} has a property this codemod does not wrap`);
    const name = propName(prop.name);
    const childPath = `${pathName}.${name}`;
    const own = commentText(ctx.text, ctx.source, prop);
    const tags = new Set([...inherited.tags, ...tagsIn(own)]);
    const child = convert(prop.initializer, `${binding}${access(name)}`, childPath, { comment: own, tags }, indent + 2, ctx);
    fields.push({ name, sourced: child.sourced, value: child.value });
  }
  const sourced = `{\n${fields.map((field) => `${inner}${keyLiteral(field.name)}: ${field.sourced},`).join("\n")}\n${pad}}`;
  const value = `{\n${fields.map((field) => `${inner}${keyLiteral(field.name)}: ${field.value},`).join("\n")}\n${pad}}`;
  return { sourced, value };
}

function typeAliases(source) {
  const aliases = new Map();
  for (const statement of source.statements) {
    if (ts.isTypeAliasDeclaration(statement) && statement.name) aliases.set(statement.name.text, statement.getText(source));
  }
  return aliases;
}

function emitFile(fileName, chunks, used) {
  const helpers = ["analysis", "cache", "fightLog", "guide", "news", "noWiki", "ocellusSim", "selected", "wiki"].filter((name) => used.has(name));
  const body = [
    "// Generated by scripts/source-fight-data.mjs from src/content/ocellus/fight/data.ts. Edit that file, then rerun the script.",
    `import { ${helpers.join(", ")} } from "./select";`,
    "",
    chunks.join("\n\n"),
    "",
  ].join("\n");
  const target = path.join(outDir, fileName);
  if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === body) return;
  fs.writeFileSync(target, body);
}

function generate() {
  const hisLines = JSON.parse(textOf(indexPath));
  const confirmed = logCitations();
  const { text, source } = parse(dataPath);
  const aliases = typeAliases(source);
  const locals = new Map();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || statement.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer) locals.set(decl.name.text, decl.initializer);
    }
  }
  const files = new Map();
  const ensure = (fileName) => {
    if (!files.has(fileName)) files.set(fileName, { chunks: [], used: new Set() });
    return files.get(fileName);
  };
  if (aliases.has("Range")) ensure("looks.ts").chunks.push(aliases.get("Range"));
  if (aliases.has("BossOverhead")) ensure("looks.ts").chunks.push(aliases.get("BossOverhead"));

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !statement.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      const exportName = decl.name.text;
      if (SKIP.has(exportName)) continue;
      if (!ts.isObjectLiteralExpression(unwrapConst(decl.initializer)) && literalText(unwrapConst(decl.initializer)) === null && !isRangeCall(unwrapConst(decl.initializer))) {
        continue;
      }
      const fileName = PHASE_FILE[exportName] ?? "looks.ts";
      const bucket = ensure(fileName);
      const binding = bindingName(exportName);
      const comment = commentText(text, source, statement);
      const ctx = {
        text,
        source,
        locals,
        hisLines,
        confirmed,
        exportName,
        used: bucket.used,
      };
      const converted = convert(decl.initializer, binding, exportName, { comment, tags: tagsIn(comment) }, 0, ctx);
      const annotation = decl.type ? `: ${decl.type.getText(source)}` : "";
      bucket.chunks.push(`export const ${binding} = ${converted.sourced};`);
      bucket.chunks.push(`export const ${exportName}${annotation} = ${converted.value};`);
      if (exportName === "VOID_LOC" && aliases.has("VoidLocKind")) bucket.chunks.push(aliases.get("VoidLocKind"));
      if (exportName === "PARTY_SCALE") {
        bucket.chunks.push("export const scaledHp = (base: number, party: number): number => Math.round((base * (PARTY_SCALE[party] ?? 1)) / 10) * 10;");
      }
    }
  }
  for (const [fileName, bucket] of files) emitFile(fileName, bucket.chunks, bucket.used);
}

if (process.argv[2] === "--index") {
  const his = process.argv[3];
  if (!his) throw new Error("usage: node scripts/source-fight-data.mjs --index <ocellus-sim data.ts>");
  const lines = walkPaths(his);
  fs.writeFileSync(indexPath, `${JSON.stringify(lines, null, 2)}\n`);
} else {
  generate();
}
