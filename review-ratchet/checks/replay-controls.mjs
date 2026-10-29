#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const usage = `usage: replay-controls.mjs --base REV [--head REV] [--repo DIR] [--timeout SECS]

Replays the head's test changes over the base, the way a base-replay gate
does: it checks out REV --base, runs every test file that exists at both
revisions and whose test code changed, overlays the head's test files and
test support (files under a test/ or tests/ directory), and runs them again.
A control is a test whose own source is identical at both revisions and that
passed on the base before the overlay. A control that fails after the
overlay shows that the head's test code itself does not run on the base, so
no failure in that replay is evidence about the base's behaviour. A Vitest
test that reads a top-level declaration of its own file, such as a fixture
const or a helper, directly or through other declarations, is not a control
when the head changed that declaration: its input changed on purpose, so its
own result is not judged. Instead its file runs once more on the base with
every such test's body emptied and every other test skipped, and that run
must pass; a failure there comes from collection, hooks or cleanup, not from
a test body, so each such test is BROKEN, and otherwise each is listed as NOT
A CONTROL. That holds only while the file's imports, hooks and other
statements outside its tests and top-level declarations are identical at both
revisions; when they differ, every test whose own source is unchanged stays a
control. *.test.sh files print PASS name or FAIL name.
Each test run may take up to --timeout seconds (default 600).

Exits 0 when every control still passes, 1 when one breaks, and 2 when a
revision, the worktree or a test runner cannot be used.
`;

const TEST_FILE = /\.test\.(?:[cm]?[jt]sx?|sh)$/;
const SUPPORT = /(^|\/)tests?\//;
const DESCRIBE = /^describe(\.(only|skip|concurrent))?$/;
const TEST = /^(test|it)(\.(only|skip|concurrent))?$/;
const TEST_ROOT = /^(test|it)$/;
const CONTROL = { kind: "control" };
const CHANGED = { kind: "changed" };

/**
 * @typedef {Readonly<{ source: string; reads: readonly string[] }>} VitestTest
 * @typedef {Readonly<{ kind: "vitest"; setup: string; declarations: ReadonlyMap<string, string>; tests: ReadonlyMap<string, VitestTest> }
 *   | { kind: "shell"; text: string }>} SuiteSource
 * @typedef {Readonly<{ kind: "control" } | { kind: "changed" } | { kind: "changed-input"; declarations: readonly string[] }>} Standing
 */

class Undecidable extends Error {}

let runTimeoutMs = 600_000;

function parseArguments(argv) {
  const options = { base: null, head: "HEAD", repo: process.cwd(), timeout: "600" };
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]];
    if (flag === "-h" || flag === "--help") {
      process.stdout.write(usage);
      process.exit(0);
    }
    if (value === undefined || !["--base", "--head", "--repo", "--timeout"].includes(flag)) throw new Undecidable(`unexpected argument ${flag}\n${usage}`);
    options[flag.slice(2)] = value;
  }
  if (options.base === null) throw new Undecidable(`--base is required\n${usage}`);
  if (!/^[1-9]\d*$/.test(options.timeout)) throw new Undecidable(`--timeout must be a positive number of seconds\n${usage}`);
  runTimeoutMs = Number(options.timeout) * 1000;
  return { ...options, repo: path.resolve(options.repo) };
}

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: runTimeoutMs, killSignal: "SIGKILL" });
}

function git(repo, args) {
  const result = run("git", args, repo);
  if (result.error || result.status !== 0) throw new Undecidable(`git ${args.join(" ")} failed: ${(result.stderr || result.error?.message || "").trim()}`);
  return result.stdout;
}

function exists(repo, revision, file) {
  return run("git", ["cat-file", "-e", `${revision}:${file}`], repo).status === 0;
}

function shellSource(text, name) {
  const lines = text.split("\n");
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = lines.findIndex((line) => new RegExp(`^${escaped}\\s*\\(\\)\\s*\\{`).test(line));
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && /^\}/.test(line));
  return end < 0 ? null : lines.slice(start, end + 1).join("\n");
}

function suiteCall(ts, node) {
  if (!ts.isCallExpression(node)) return null;
  const [first, body] = node.arguments;
  if (!body || !first || !(ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) return null;
  const callee = (expression) =>
    ts.isIdentifier(expression) ? expression.text : ts.isPropertyAccessExpression(expression) ? `${callee(expression.expression)}.${expression.name.text}` : "";
  const name = callee(node.expression);
  return DESCRIBE.test(name) ? { kind: "describe", title: first.text, body } : TEST.test(name) ? { kind: "test", title: first.text, body } : null;
}

/** @returns {SuiteSource} */
function vitestFile(ts, file, text) {
  const name = file.endsWith("x") ? "/suite.tsx" : "/suite.ts";
  const options = { noLib: true, noResolve: true, types: [] };
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (requested) => (requested === name ? source : undefined);
  const checker = ts.createProgram([name], options, host).getTypeChecker();

  const bindings = new Map();
  const texts = new Map();
  const setup = [];
  const bind = (binding, declaration, text) => {
    if (!ts.isIdentifier(binding)) {
      for (const element of binding.elements) if (!ts.isOmittedExpression(element)) bind(element.name, element, text);
      return;
    }
    bindings.set(declaration, binding.text);
    texts.set(binding.text, [...(texts.get(binding.text) ?? []), text]);
  };
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      const [first] = statement.declarationList.declarations;
      const keyword = statement.getText(source).slice(0, first.getStart(source) - statement.getStart(source));
      for (const declaration of statement.declarationList.declarations) bind(declaration.name, declaration, keyword + declaration.getText(source));
    } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name) {
      bind(statement.name, statement, statement.getText(source));
    } else if (!ts.isTypeAliasDeclaration(statement) && !ts.isInterfaceDeclaration(statement)) {
      setup.push(statement);
    }
  }

  const owner = (declaration) => {
    let node = declaration;
    while (ts.isBindingElement(node) || ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) node = node.parent;
    return ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node) ? node : null;
  };
  const assigned = (identifier) => {
    let target = identifier;
    while (
      ts.isParenthesizedExpression(target.parent) ||
      ts.isArrayLiteralExpression(target.parent) ||
      ts.isObjectLiteralExpression(target.parent) ||
      ts.isSpreadElement(target.parent) ||
      ts.isSpreadAssignment(target.parent) ||
      (ts.isShorthandPropertyAssignment(target.parent) && target.parent.name === target) ||
      (ts.isPropertyAssignment(target.parent) && target.parent.initializer === target)
    ) {
      target = target.parent;
    }
    const { parent } = target;
    if ((ts.isForOfStatement(parent) || ts.isForInStatement(parent)) && parent.initializer === target) return true;
    return ts.isBinaryExpression(parent) && parent.left === target && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
  };
  const runtimeHeritage = (node) =>
    ts.isExpressionWithTypeArguments(node) && ts.isHeritageClause(node.parent) && node.parent.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(node.parent.parent);
  const valueReads = (node) => {
    const found = new Set();
    const visit = (child) => {
      if (ts.isTypeNode(child) && !runtimeHeritage(child)) return;
      if (ts.isIdentifier(child) && !assigned(child)) {
        const symbol = ts.isShorthandPropertyAssignment(child.parent) && child.parent.name === child ? checker.getShorthandAssignmentValueSymbol(child.parent) : checker.getSymbolAtLocation(child);
        for (const declaration of symbol?.declarations ?? []) found.add(declaration);
      }
      ts.forEachChild(child, visit);
    };
    visit(node);
    return found;
  };
  const inputs = (test) => {
    const names = new Set();
    const seen = new Set([test]);
    const pending = [test];
    while (pending.length > 0) {
      for (const declaration of valueReads(pending.pop())) {
        if (bindings.has(declaration)) names.add(bindings.get(declaration));
        const declared = owner(declaration);
        if (declared === null || seen.has(declared)) continue;
        seen.add(declared);
        pending.push(declared);
      }
    }
    return [...names];
  };

  const tests = new Map();
  const visit = (node, titles) => {
    const call = suiteCall(ts, node);
    if (call?.kind === "describe") {
      ts.forEachChild(call.body, (child) => visit(child, [...titles, call.title]));
      return;
    }
    if (call?.kind === "test") {
      tests.set([...titles, call.title].join(" > "), { source: node.getText(source), reads: inputs(node) });
      return;
    }
    ts.forEachChild(node, (child) => visit(child, titles));
  };
  visit(source, []);

  const setupText = (statement) => {
    const call = ts.isExpressionStatement(statement) ? suiteCall(ts, statement.expression) : null;
    if (call?.kind === "test") return [];
    if (call?.kind === "describe" && (ts.isArrowFunction(call.body) || ts.isFunctionExpression(call.body)) && ts.isBlock(call.body.body)) return call.body.body.statements.flatMap(setupText);
    return [statement.getText(source)];
  };
  const declarations = new Map([...texts].map(([read, declared]) => [read, declared.join("\n")]));
  return { kind: "vitest", setup: setup.flatMap(setupText).join("\n"), declarations, tests };
}

/** @returns {Standing} */
function standing(base, head, name) {
  if (base.kind === "shell") {
    const source = shellSource(base.text, name);
    return source !== null && source === shellSource(head.text, name) ? CONTROL : CHANGED;
  }
  const [before, after] = [base.tests.get(name), head.tests.get(name)];
  if (!before || !after || before.source !== after.source) return CHANGED;
  if (base.setup !== head.setup) return CONTROL;
  const declarations = [...new Set([...before.reads, ...after.reads])].filter((read) => base.declarations.get(read) !== head.declarations.get(read)).sort();
  return declarations.length > 0 ? { kind: "changed-input", declarations } : CONTROL;
}

function emptiedSource(ts, file, text, keep) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const root = (node) => (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node) ? root(node.expression) : node);
  const edits = [];
  const visit = (node, titles) => {
    const call = suiteCall(ts, node);
    if (call?.kind === "describe") {
      ts.forEachChild(call.body, (child) => visit(child, [...titles, call.title]));
      return;
    }
    if (call?.kind === "test" && keep.has([...titles, call.title].join(" > "))) {
      for (const argument of node.arguments.slice(1)) if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) edits.push([argument.getStart(source), argument.end, "() => {}"]);
      return;
    }
    const registrar = ts.isCallExpression(node) ? root(node.expression) : null;
    if (registrar !== null && ts.isIdentifier(registrar) && TEST_ROOT.test(registrar.text)) {
      edits.push([node.getStart(source), node.end, `${registrar.text}.skip("", () => {})`]);
      return;
    }
    ts.forEachChild(node, (child) => visit(child, titles));
  };
  visit(source, []);
  return edits.sort((a, b) => b[0] - a[0]).reduce((result, [start, end, replacement]) => result.slice(0, start) + replacement + result.slice(end), text);
}

function runShell(worktree, suite) {
  const result = run("bash", [suite], worktree);
  if (result.error) throw new Undecidable(`bash ${suite} did not finish: ${result.error.message}`);
  const output = `${result.stdout}${result.stderr}`.split("\n");
  const outcomes = new Map();
  output.forEach((line, index) => {
    const match = line.match(/^(PASS|FAIL) (\S+)\s*$/);
    if (!match) return;
    const detail = output.slice(index + 1).filter((next) => /^\s+\S/.test(next)).slice(0, 2).map((next) => next.trim()).join(" / ");
    outcomes.set(match[2], { status: match[1] === "PASS" ? "pass" : "fail", detail });
  });
  return { error: "", tests: outcomes };
}

function runVitest(worktree, suites, report) {
  const vitest = path.join(worktree, "node_modules", ".bin", "vitest");
  if (!fs.existsSync(vitest)) throw new Undecidable(`no vitest at ${vitest}; install dependencies in the repository first`);
  const result = run(vitest, ["run", "--reporter=json", `--outputFile=${report}`, ...suites], worktree);
  if (result.error || !fs.existsSync(report)) throw new Undecidable(`vitest wrote no report: ${(result.error?.message || result.stderr || "").trim().split("\n").slice(-3).join(" ")}`);
  const outcomes = new Map(suites.map((suite) => [suite, { error: "", tests: new Map() }]));
  const root = fs.realpathSync(worktree);
  for (const file of JSON.parse(fs.readFileSync(report, "utf8")).testResults) {
    const suite = path.relative(root, fs.realpathSync(file.name));
    const tests = new Map();
    for (const test of file.assertionResults) {
      const detail = (test.failureMessages[0] ?? "").split("\n")[0];
      tests.set([...test.ancestorTitles, test.title].join(" > "), { status: test.status === "passed" ? "pass" : "fail", detail });
    }
    outcomes.set(suite, { error: (file.message ?? "").split("\n")[0], tests });
  }
  return { exit: result.status, outcomes };
}

function runSuites(worktree, suites, scratch, label) {
  const outcomes = new Map();
  const vitestSuites = suites.filter((suite) => !suite.endsWith(".sh"));
  if (vitestSuites.length > 0) {
    for (const [suite, outcome] of runVitest(worktree, vitestSuites, path.join(scratch, `${label}.json`)).outcomes) outcomes.set(suite, outcome);
  }
  for (const suite of suites.filter((file) => file.endsWith(".sh"))) outcomes.set(suite, runShell(worktree, suite));
  return outcomes;
}

function replay({ base: baseRevision, head: headRevision, repo }) {
  git(repo, ["rev-parse", "--show-toplevel"]);
  const base = git(repo, ["rev-parse", "--verify", `${baseRevision}^{commit}`]).trim();
  const head = git(repo, ["rev-parse", "--verify", `${headRevision}^{commit}`]).trim();
  const changed = git(repo, ["diff", "--name-only", "--no-renames", base, head]).split("\n").filter(Boolean);
  const overlay = changed.filter((file) => TEST_FILE.test(file) || SUPPORT.test(file));
  const supportChanged = overlay.some((file) => !TEST_FILE.test(file));
  const blob = (revision, file) => git(repo, ["rev-parse", `${revision}:${file}`]).trim();
  const suites = git(repo, ["ls-tree", "-r", "--name-only", base])
    .split("\n")
    .filter((file) => TEST_FILE.test(file) && exists(repo, head, file))
    .filter((file) => blob(base, file) !== blob(head, file) || (supportChanged && !file.endsWith(".sh")));
  const short = (sha) => sha.slice(0, 7);
  if (suites.length === 0) {
    console.log(`replay-controls: base ${short(base)}, head ${short(head)}: no test file exists at both with changed test code; nothing to replay`);
    return 0;
  }

  const sources = new Map();
  const sourceOf = (revision, suite) => {
    const key = `${revision}:${suite}`;
    if (!sources.has(key)) {
      const text = git(repo, ["show", key]);
      sources.set(key, suite.endsWith(".sh") ? { kind: "shell", text } : vitestFile(createRequire(import.meta.url)("typescript"), suite, text));
    }
    return sources.get(key);
  };

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "replay-controls."));
  const worktree = path.join(scratch, "base");
  git(repo, ["worktree", "add", "--detach", "--quiet", worktree, base]);
  try {
    if (fs.existsSync(path.join(repo, "node_modules"))) fs.symlinkSync(path.join(repo, "node_modules"), path.join(worktree, "node_modules"));
    const native = runSuites(worktree, suites, scratch, "native");
    for (const file of overlay) {
      const target = path.join(worktree, file);
      if (exists(repo, head, file)) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, git(repo, ["show", `${head}:${file}`]));
      } else {
        fs.rmSync(target, { force: true });
      }
    }
    const replayed = runSuites(worktree, suites, scratch, "replay");

    const broken = [];
    const exempt = new Map();
    let controls = 0;
    for (const suite of suites) {
      const overlaid = replayed.get(suite);
      for (const [name, outcome] of native.get(suite)?.tests ?? new Map()) {
        if (outcome.status !== "pass") continue;
        const verdict = standing(sourceOf(base, suite), sourceOf(head, suite), name);
        if (verdict.kind === "changed") continue;
        if (verdict.kind === "changed-input") {
          exempt.set(suite, [...(exempt.get(suite) ?? []), { name, declarations: verdict.declarations }]);
          continue;
        }
        controls++;
        const after = overlaid?.tests.get(name);
        const detail = after ? after.detail : overlaid?.error || "no result after the overlay";
        if (after?.status !== "pass") broken.push(`${suite}::${name} passes on the base but not after the overlay${detail ? `: ${detail}` : ""}`);
      }
    }
    const changedInput = [];
    const ts = createRequire(import.meta.url)("typescript");
    for (const [index, [suite, tests]] of [...exempt].entries()) {
      fs.writeFileSync(path.join(worktree, suite), emptiedSource(ts, suite, git(repo, ["show", `${head}:${suite}`]), new Set(tests.map(({ name }) => name))));
      const { exit, outcomes } = runVitest(worktree, [suite], path.join(scratch, `emptied-${index}.json`));
      const emptied = outcomes.get(suite);
      const detail = tests.map(({ name }) => emptied.tests.get(name)).find((test) => test?.status !== "pass")?.detail || emptied.error || `vitest exited ${exit}`;
      for (const { name, declarations } of tests) {
        if (exit === 0) changedInput.push(`${suite}::${name} reads ${declarations.join(", ")}, which the head changed`);
        else broken.push(`${suite}::${name} reads ${declarations.join(", ")}, which the head changed, but its file does not pass on the base with the exempt test bodies emptied: ${detail}`);
      }
    }
    console.log(`replay-controls: base ${short(base)}, head ${short(head)}: ${suites.length} file(s) replayed, ${controls} unchanged control(s), ${changedInput.length} test(s) reading changed declarations`);
    for (const line of changedInput) console.log(`NOT A CONTROL ${line}`);
    for (const line of broken) console.log(`BROKEN ${line}`);
    if (broken.length === 0) return 0;
    console.log(`replay-controls: ${broken.length} test(s) broke, so the head's test code does not run on the base and failures in this replay are not evidence against it`);
    return 1;
  } finally {
    run("git", ["worktree", "remove", "--force", worktree], repo);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

try {
  process.exit(replay(parseArguments(process.argv.slice(2))));
} catch (error) {
  process.stderr.write(`replay-controls: ${error instanceof Undecidable ? error.message : error.stack}\n`);
  process.exit(2);
}
