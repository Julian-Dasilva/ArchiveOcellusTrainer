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
no failure in that replay is evidence about the base's behaviour. Vitest files
report through their JSON reporter; *.test.sh files print PASS name or FAIL name.
Each test run may take up to --timeout seconds (default 600).

A head that changes a shared fixture on purpose acknowledges the controls it
makes fail in review-ratchet/replay-acknowledged.json:
  { "acknowledged": [{ "test": "FILE::TEST", "reason": "..." }] }
Only entries the head adds or changes apply; an entry identical at the base
is ignored. An acknowledged control that fails after the overlay is
reported as ACKNOWLEDGED instead of BROKEN. An entry that names no control of
a replayed file, or whose control passes after the overlay, is STALE and
fails the check. An acknowledged control with no result or a skipped result
after the overlay, or in a file that reports an error outside its tests, is
still BROKEN.

The check guards against honest mistakes, not an author who means to deceive
it. Vitest's report does not say whether a failed test failed in its own body
or in a beforeEach, afterEach or cleanup around it, so the review of each
acknowledgement owns that judgement.

Exits 0 when every control still passes or fails as acknowledged, 1 when one
breaks or an acknowledgement is stale, and 2 when a revision, the
acknowledgement file, the worktree or a test runner cannot be used.
`;

const TEST_FILE = /\.test\.(?:[cm]?[jt]sx?|sh)$/;
const SUPPORT = /(^|\/)tests?\//;
const ACKNOWLEDGEMENTS = "review-ratchet/replay-acknowledged.json";

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

function acknowledgements(repo, revision) {
  if (!exists(repo, revision, ACKNOWLEDGEMENTS)) return [];
  let parsed;
  try {
    parsed = JSON.parse(git(repo, ["show", `${revision}:${ACKNOWLEDGEMENTS}`]));
  } catch (error) {
    throw new Undecidable(`${ACKNOWLEDGEMENTS} at ${revision} is not JSON: ${error.message}`);
  }
  const entries = parsed?.acknowledged;
  const valid = (entry) => typeof entry?.test === "string" && entry.test.includes("::") && typeof entry.reason === "string" && entry.reason.trim() !== "";
  if (!Array.isArray(entries) || !entries.every(valid)) throw new Undecidable(`${ACKNOWLEDGEMENTS} at ${revision} must be { "acknowledged": [{ "test": "FILE::TEST", "reason": "..." }] }`);
  return entries;
}

function shellSource(text, name) {
  const lines = text.split("\n");
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = lines.findIndex((line) => new RegExp(`^${escaped}\\s*\\(\\)\\s*\\{`).test(line));
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && /^\}/.test(line));
  return end < 0 ? null : lines.slice(start, end + 1).join("\n");
}

function vitestSources(ts, file, text) {
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const found = new Map();
  const callee = (node) =>
    ts.isIdentifier(node) ? node.text : ts.isPropertyAccessExpression(node) ? `${callee(node.expression)}.${node.name.text}` : "";
  const visit = (node, titles) => {
    if (ts.isCallExpression(node)) {
      const [first, body] = node.arguments;
      const title = first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) ? first.text : null;
      const name = callee(node.expression);
      if (title !== null && body && /^describe(\.(only|skip|concurrent))?$/.test(name)) {
        ts.forEachChild(body, (child) => visit(child, [...titles, title]));
        return;
      }
      if (title !== null && body && /^(test|it)(\.(only|skip|concurrent))?$/.test(name)) {
        found.set([...titles, title].join(" > "), node.getText(source));
        return;
      }
    }
    ts.forEachChild(node, (child) => visit(child, titles));
  };
  visit(source, []);
  return found;
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
    outcomes.set(match[2], { status: match[1] === "PASS" ? "pass" : "fail", detail, error: "" });
  });
  return outcomes;
}

function runVitest(worktree, suites, report) {
  const vitest = path.join(worktree, "node_modules", ".bin", "vitest");
  if (!fs.existsSync(vitest)) throw new Undecidable(`no vitest at ${vitest}; install dependencies in the repository first`);
  const result = run(vitest, ["run", "--reporter=json", `--outputFile=${report}`, ...suites], worktree);
  if (result.error || !fs.existsSync(report)) throw new Undecidable(`vitest wrote no report: ${(result.error?.message || result.stderr || "").trim().split("\n").slice(-3).join(" ")}`);
  const outcomes = new Map(suites.map((suite) => [suite, new Map()]));
  const root = fs.realpathSync(worktree);
  for (const file of JSON.parse(fs.readFileSync(report, "utf8")).testResults) {
    const suite = path.relative(root, fs.realpathSync(file.name));
    const tests = outcomes.get(suite) ?? new Map();
    const error = (file.message ?? "").split("\n")[0];
    for (const test of file.assertionResults) {
      const detail = (test.failureMessages[0] ?? "").split("\n")[0];
      const status = test.status === "passed" ? "pass" : test.status === "failed" ? "fail" : "skip";
      tests.set([...test.ancestorTitles, test.title].join(" > "), { status, detail, error });
    }
    outcomes.set(suite, tests);
  }
  return outcomes;
}

function runSuites(worktree, suites, scratch, label) {
  const outcomes = new Map();
  const vitestSuites = suites.filter((suite) => !suite.endsWith(".sh"));
  if (vitestSuites.length > 0) {
    for (const [suite, tests] of runVitest(worktree, vitestSuites, path.join(scratch, `${label}.json`))) outcomes.set(suite, tests);
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
  const inherited = new Set(acknowledgements(repo, base).map(({ test, reason }) => JSON.stringify([test, reason])));
  const acknowledged = new Map(acknowledgements(repo, head).filter(({ test, reason }) => !inherited.has(JSON.stringify([test, reason]))).map(({ test, reason }) => [test, reason]));
  const stale = (judged) => [...acknowledged].filter(([test]) => !judged.has(test)).map(([test]) => `STALE ${test} is acknowledged but is not a control of a replayed file`);
  if (suites.length === 0) {
    console.log(`replay-controls: base ${short(base)}, head ${short(head)}: no test file exists at both with changed test code; nothing to replay`);
    const unmatched = stale(new Set());
    for (const line of unmatched) console.log(line);
    return unmatched.length === 0 ? 0 : 1;
  }

  const sources = new Map();
  const sourceOf = (revision, suite, name) => {
    const key = `${revision}:${suite}`;
    if (!sources.has(key)) {
      const text = git(repo, ["show", key]);
      sources.set(key, suite.endsWith(".sh") ? { shell: text } : { vitest: vitestSources(createRequire(import.meta.url)("typescript"), suite, text) });
    }
    const parsed = sources.get(key);
    return parsed.shell !== undefined ? shellSource(parsed.shell, name) : parsed.vitest.get(name) ?? null;
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
    const accepted = [];
    const passing = [];
    const judged = new Set();
    let controls = 0;
    for (const suite of suites) {
      for (const [name, outcome] of native.get(suite) ?? new Map()) {
        if (outcome.status !== "pass") continue;
        const source = sourceOf(base, suite, name);
        if (source === null || source !== sourceOf(head, suite, name)) continue;
        controls++;
        const test = `${suite}::${name}`;
        judged.add(test);
        const after = replayed.get(suite)?.get(name);
        if (after?.status === "pass") {
          if (acknowledged.has(test)) passing.push(`STALE ${test} is acknowledged but passes after the overlay`);
        } else if (acknowledged.has(test) && after?.status === "fail" && after.error === "") {
          accepted.push(`ACKNOWLEDGED ${test} fails after the overlay: ${acknowledged.get(test)}`);
        } else {
          broken.push({ suite, name, detail: after ? after.error || after.detail : "no result after the overlay" });
        }
      }
    }
    const unmatched = [...stale(judged), ...passing];
    console.log(`replay-controls: base ${short(base)}, head ${short(head)}: ${suites.length} file(s) replayed, ${controls} unchanged control(s), ${accepted.length} acknowledged`);
    for (const line of accepted) console.log(line);
    for (const line of unmatched) console.log(line);
    for (const { suite, name, detail } of broken) console.log(`BROKEN ${suite}::${name} passes on the base but not after the overlay${detail ? `: ${detail}` : ""}`);
    if (broken.length > 0) console.log(`replay-controls: ${broken.length} control(s) broke, so the head's test code does not run on the base and failures in this replay are not evidence against it`);
    return broken.length === 0 && unmatched.length === 0 ? 0 : 1;
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
