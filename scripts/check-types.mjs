#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ts = createRequire(import.meta.url)("typescript");
const root = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const FIGHT = path.join(root, "src/content/ocellus/js");
const SIM = path.join(root, "src/sim");
const SIM_SDK = path.join(SIM, "sdk");
const SDK_PACKAGE = /^osrs-sdk(-[a-z]+)?(\/|$)/;
const PUBLIC = new Set(["OcellusRegion.ts", "OcellusTimings.ts", "P4Types.ts", "P3Region.ts", "P3Types.ts", "P2Region.ts", "P2Types.ts", "P1Region.ts", "P1Types.ts"].map((file) => path.join(FIGHT, file)));
const SUPPRESSION = /@ts-(ignore|expect-error|nocheck)\b/;
const TEST_FILE = /(^|[/\\])__tests__[/\\]|\.(test|spec)(-d)?\.[cm]?[jt]sx?$/;

function sources(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [file] : [];
  });
}

function resolveImport(from, specifier) {
  if (!specifier.startsWith(".") && !path.isAbsolute(specifier)) return null;
  const base = path.resolve(path.dirname(from), specifier);
  return [".ts", ".tsx", "/index.ts"].map((ext) => base + ext).find((file) => fs.existsSync(file)) ?? base;
}

const findings = [];
for (const file of [...sources(path.join(root, "src")), ...sources(path.join(root, "test"))]) {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const inSrc = file.startsWith(path.join(root, "src") + path.sep);
  const insideFight = file.startsWith(FIGHT + path.sep);
  const insideSim = file.startsWith(SIM + path.sep);
  const insideSimCore = insideSim && !file.startsWith(SIM_SDK + path.sep);
  const report = (pos, rule) => {
    const { line, character } = sf.getLineAndCharacterOfPosition(pos);
    findings.push(`${path.relative(root, file)}:${line + 1}:${character + 1} ${rule}`);
  };

  if (insideFight && TEST_FILE.test(path.relative(FIGHT, file))) {
    report(0, "test file inside the fight; tests drive the region from src/content/ocellus/tests");
  }

  if (inSrc) {
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, sf.languageVariant, text);
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      const isComment = token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia;
      if (isComment && SUPPRESSION.test(scanner.getTokenText())) report(scanner.getTokenPos(), "compiler suppression comment");
    }
  }

  const visit = (node) => {
    if (inSrc) {
      if (node.kind === ts.SyntaxKind.AnyKeyword) report(node.getStart(sf), "explicit any");
      if (ts.isAsExpression(node) && !(ts.isTypeReferenceNode(node.type) && node.type.typeName.getText(sf) === "const")) {
        report(node.getStart(sf), "type assertion with as");
      }
      if (ts.isTypeAssertionExpression(node)) report(node.getStart(sf), "angle-bracket type assertion");
      if (ts.isNonNullExpression(node)) report(node.getStart(sf), "non-null assertion");
      if ((ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) && node.exclamationToken) {
        report(node.getStart(sf), "definite assignment assertion");
      }
    }
    if (ts.isStringLiteralLike(node)) {
      const target = resolveImport(file, node.text);
      if (!insideFight && target && target.startsWith(FIGHT + path.sep) && !PUBLIC.has(target)) {
        report(node.getStart(sf), `import of fight internal ${path.relative(root, target)}`);
      }
      if (insideSim && target && !target.startsWith(SIM + path.sep)) {
        report(node.getStart(sf), `sim import from outside src/sim ${path.relative(root, target)}`);
      }
      if (insideSimCore && SDK_PACKAGE.test(node.text)) {
        report(node.getStart(sf), `sim core import of the SDK ${node.text}`);
      }
      if (insideSimCore && target && target.startsWith(SIM_SDK + path.sep)) {
        report(node.getStart(sf), `sim core import of src/sim/sdk ${path.relative(root, target)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

for (const finding of findings) console.log(finding);
console.log(`check-types: ${findings.length} finding(s)`);
process.exit(findings.length === 0 ? 0 : 1);
