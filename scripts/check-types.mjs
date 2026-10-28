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
const REACT_PACKAGE = /^(react|react-dom)(\/|$)/;
const OCELUS = path.join(root, "src/content/ocellus");
const PHASE_SCRIPTS = [path.join(OCELUS, "full/p1"), path.join(OCELUS, "full/p2"), path.join(OCELUS, "full/p3")];
const ENGINE_PAGE_BAN = new Set(["director.ts", "sdk/EncounterRegion.ts", "sdk/EncounterPlayer.ts"]);

function engineFile(target) {
  if (!target || !target.startsWith(SIM + path.sep)) return null;
  const rel = path.relative(SIM, target).split(path.sep).join("/");
  const file = rel.endsWith(".ts") || rel.endsWith(".tsx") ? rel : `${rel}.ts`;
  return ENGINE_PAGE_BAN.has(file) ? file : null;
}
const PUBLIC = new Set(["OcellusRegion.ts", "OcellusLoadout.ts", "OcellusTimings.ts", "P4Types.ts", "p4/phase.ts"].map((file) => path.join(FIGHT, file)));
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

const bindingCache = new Map();

function hasExportModifier(node) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function bindingFile(file, name, stack) {
  if (!file || !fs.existsSync(file)) return null;
  const key = `${file}\0${name}`;
  if (bindingCache.has(key)) return bindingCache.get(key);
  if (stack.has(key)) return null;
  stack.add(key);
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const locals = new Map();
  const stars = [];
  const hops = [];
  let defined = false;
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.importClause) {
      const imported = resolveImport(file, statement.moduleSpecifier.text);
      if (imported && statement.importClause.name) locals.set(statement.importClause.name.text, { file: imported, name: "default" });
      const named = statement.importClause?.namedBindings;
      if (imported && named && ts.isNamedImports(named)) {
        for (const element of named.elements) locals.set(element.name.text, { file: imported, name: (element.propertyName ?? element.name).text });
      }
    }
    if (hasExportModifier(statement)) {
      const declared =
        (ts.isClassDeclaration(statement) ||
          ts.isFunctionDeclaration(statement) ||
          ts.isInterfaceDeclaration(statement) ||
          ts.isTypeAliasDeclaration(statement) ||
          ts.isEnumDeclaration(statement)) &&
        statement.name?.text === name;
      const variables =
        ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name);
      if (declared || variables) defined = true;
    }
    if (!ts.isExportDeclaration(statement)) continue;
    const specifier = ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : null;
    const target = specifier ? resolveImport(file, specifier) : null;
    if (!statement.exportClause) {
      if (target) stars.push(target);
      continue;
    }
    if (!ts.isNamedExports(statement.exportClause)) continue;
    for (const element of statement.exportClause.elements) {
      if (element.name.text !== name) continue;
      const local = (element.propertyName ?? element.name).text;
      if (target) hops.push({ file: target, name: local });
      else hops.push({ local });
    }
  }
  let found = null;
  if (defined) found = file;
  else {
    for (const hop of hops) {
      if (hop.local) {
        const binding = locals.get(hop.local);
        found = binding ? bindingFile(binding.file, binding.name, stack) : file;
      } else found = bindingFile(hop.file, hop.name, stack);
      if (found) break;
    }
    if (!found) {
      for (const star of stars) {
        found = bindingFile(star, name, stack);
        if (found) break;
      }
    }
  }
  stack.delete(key);
  bindingCache.set(key, found);
  return found;
}

function specifierNames(node) {
  let parent = node.parent;
  if (parent && ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent)) parent = parent.parent;
  if (!parent) return null;
  if (ts.isImportDeclaration(parent)) {
    if (!parent.importClause) return [];
    const names = [];
    if (parent.importClause.name) names.push("default");
    const named = parent.importClause.namedBindings;
    if (named && ts.isNamespaceImport(named)) return ["*"];
    if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) names.push((element.propertyName ?? element.name).text);
    }
    return names;
  }
  if (ts.isExportDeclaration(parent)) {
    if (!parent.exportClause) return ["*"];
    if (ts.isNamedExports(parent.exportClause)) return parent.exportClause.elements.map((element) => (element.propertyName ?? element.name).text);
    return null;
  }
  if (ts.isImportTypeNode(parent)) return parent.qualifier && ts.isIdentifier(parent.qualifier) ? [parent.qualifier.text] : ["*"];
  if (ts.isCallExpression(parent) && (parent.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(parent.expression) && parent.expression.text === "require"))) return ["*"];
  return null;
}

function exportedEngine(file, seen) {
  if (!file || seen.has(file) || !fs.existsSync(file)) return null;
  seen.add(file);
  const direct = engineFile(file);
  if (direct) return direct;
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const names = [];
  const stars = [];
  for (const statement of source.statements) {
    if (hasExportModifier(statement)) {
      if (statement.name && ts.isIdentifier(statement.name)) names.push(statement.name.text);
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
        }
      }
    }
    if (!ts.isExportDeclaration(statement)) continue;
    const specifier = ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : null;
    const target = specifier ? resolveImport(file, specifier) : null;
    if (!statement.exportClause) {
      if (target) stars.push(target);
      continue;
    }
    if (ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) names.push(element.name.text);
    }
  }
  for (const name of names) {
    const hit = engineFile(bindingFile(file, name, new Set()));
    if (hit) return hit;
  }
  for (const star of stars) {
    const hit = exportedEngine(star, seen);
    if (hit) return hit;
  }
  return null;
}

function reexportedEngine(specNode, target) {
  const names = specifierNames(specNode);
  if (!names || !target) return null;
  if (names.includes("*")) return exportedEngine(target, new Set());
  for (const name of names) {
    const hit = engineFile(bindingFile(target, name, new Set()));
    if (hit) return hit;
  }
  return null;
}

const findings = [];
for (const file of [...sources(path.join(root, "src")), ...sources(path.join(root, "test"))]) {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const inSrc = file.startsWith(path.join(root, "src") + path.sep);
  const insideFight = file.startsWith(FIGHT + path.sep);
  const insideSim = file.startsWith(SIM + path.sep);
  const insideSimCore = insideSim && !file.startsWith(SIM_SDK + path.sep);
  const insidePhaseScript = PHASE_SCRIPTS.some((dir) => file.startsWith(dir + path.sep) && !file.startsWith(path.join(dir, "sdk") + path.sep));
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
      if (insidePhaseScript && SDK_PACKAGE.test(node.text)) {
        report(node.getStart(sf), `phase script import of the SDK ${node.text}`);
      }
      if (insideSim && REACT_PACKAGE.test(node.text)) {
        report(node.getStart(sf), `sim import of React ${node.text}`);
      }
      const engineEntry = engineFile(target) ?? (!insideSim && !file.startsWith(OCELUS + path.sep) ? reexportedEngine(node, target) : null);
      if (engineEntry && !insideSim && !file.startsWith(OCELUS + path.sep)) {
        report(node.getStart(sf), `page import of the fight engine ${engineEntry}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

for (const finding of findings) console.log(finding);
console.log(`check-types: ${findings.length} finding(s)`);
process.exit(findings.length === 0 ? 0 : 1);
