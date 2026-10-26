#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const POLICIES = "review-ratchet/guarded-policies.json";
const usage = `usage: shell-test-runs-entry.mjs [--timeout SECS] [ROOT]

ROOT (default: the current directory) names in ${POLICIES}
each script its shell tests guard, the tests that guard it, and the script's
policies. A policy's mutation is a list of literal edits that break it:
  { "ignore": ["DIR", ...],
    "scripts": [{ "path": "scripts/build.sh", "tests": ["scripts/build.test.sh"],
                  "policies": [{ "policy": "...", "mutation": [{ "find": "...", "replace": "..." }] }] }] }
Every *.test.sh under ROOT outside the ignored directories must be listed.
Each test runs as bash TEST from a fresh scratch copy of ROOT, once as it is
and once per policy of each script it guards, with that policy's mutation
applied to the copy's script. A test that still passes under a mutation does
not exercise the policy it guards, for example because it runs its own copy
of the script's code under its own shell options.

A mutant must pass its syntax check (bash -n for .sh, node --check for .mjs,
and for .ts esbuild, the parser tsx runs it with),
so a test that runs the real script reaches its assertions. A test reports
each case on a line "PASS NAME" or "FAIL NAME", followed by that case's
output; output before the first case belongs to no case. Each case prints
"ready NAME" once its setup is done, and a failed assertion prints a line that
starts "ASSERTION FAILED: "; either line may be indented. A failure under a
mutation counts only when the test reports the same cases as it does as it
is, and a case that printed its ready line in both runs fails with an
assertion line after it; a setup error or failed precondition, a crash or a
different set of cases cannot show that the test checks the policy.

Exits 0 when every test passes as it is with every case passing and fails an
assertion after a ready line under every mutation, and 1 when a test passes
under one.
Without such a finding it exits 2 when the policy file is missing or
malformed, a mutation's text does not occur exactly once, a mutant fails its
syntax check, a shell test is not listed, a test or one of its cases fails as
it is, or a test times out, cannot start or fails under a mutation without
such a case. Each run may take up to --timeout seconds (default 300).
`;

const CASE = /^(PASS|FAIL) (\S+)$/;
const ASSERTION_FAILED = /^[ \t]*ASSERTION FAILED: /;
const SYNTAX_CHECKS = { ".sh": ["bash", "-n"], ".mjs": [process.execPath, "--check"], ".ts": [fileURLToPath(new URL("../../node_modules/.bin/esbuild", import.meta.url))] };

class Undecidable extends Error {}

/**
 * @typedef {Readonly<{ find: string; replace: string }>} Edit
 * @typedef {Readonly<{ policy: string; mutation: readonly Edit[] }>} Policy
 * @typedef {Readonly<{ path: string; tests: readonly string[]; policies: readonly Policy[] }>} Guarded
 * @typedef {Readonly<{ ignore: readonly string[]; scripts: readonly Guarded[] }>} Registry
 * @typedef {Readonly<{ script: string; text: string }>} Mutant
 * @typedef {Readonly<{ name: string; result: "passed"; ready: boolean } | { name: string; result: "asserted" | "errored" }>} Case
 * @typedef {Readonly<{ kind: "passed"; cases: readonly Case[] } | { kind: "failed"; ending: string; output: string; cases: readonly Case[] } | { kind: "unrunnable"; reason: string }>} Outcome
 */

function parseArguments(argv) {
  const options = { timeout: "300" };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(usage);
      process.exit(0);
    }
    if (arg === "--timeout") options.timeout = argv[(index += 1)];
    else if (arg.startsWith("-")) throw new Undecidable(`unexpected argument ${arg}\n${usage}`);
    else positional.push(arg);
  }
  if (positional.length > 1) throw new Undecidable(`expected at most one ROOT\n${usage}`);
  if (!/^[1-9]\d*$/.test(options.timeout ?? "")) throw new Undecidable(`--timeout must be a positive number of seconds\n${usage}`);
  const root = path.resolve(positional[0] ?? ".");
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Undecidable(`ROOT is not a directory: ${root}`);
  return { root, timeoutMs: Number(options.timeout) * 1000 };
}

function strings(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item !== "");
}

/** @returns {Registry} */
function parseRegistry(text) {
  const registry = JSON.parse(text);
  if (!strings(registry?.ignore)) throw new Error("ignore must be an array of paths");
  if (!Array.isArray(registry.scripts) || registry.scripts.length === 0) throw new Error("scripts must be a non-empty array");
  for (const [index, script] of registry.scripts.entries()) {
    const where = `scripts[${index}]`;
    if (typeof script?.path !== "string" || script.path === "") throw new Error(`${where} needs a path`);
    if (!strings(script.tests) || script.tests.length === 0) throw new Error(`${where} needs a non-empty array of tests`);
    if (!Array.isArray(script.policies) || script.policies.length === 0) throw new Error(`${where} needs a non-empty array of policies`);
    for (const policy of script.policies) {
      if (typeof policy?.policy !== "string" || policy.policy === "") throw new Error(`${where} has a policy with no description`);
      const edits = policy.mutation;
      if (!Array.isArray(edits) || edits.length === 0 || !edits.every((edit) => typeof edit?.find === "string" && edit.find !== "" && typeof edit.replace === "string")) {
        throw new Error(`${where} policy "${policy.policy}" needs a mutation: a non-empty array of { find, replace } strings`);
      }
    }
  }
  return registry;
}

function walk(root, dir = "") {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === ".git" || entry.name === "node_modules") return [];
    const file = path.posix.join(dir, entry.name);
    return entry.isDirectory() ? walk(root, file) : [file];
  });
}

// Inside a work tree, git's view leaves out ignored build output, which can be large; elsewhere every file is copied.
function listFiles(root) {
  const git = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const files = git.status === 0 ? git.stdout.split("\0").filter(Boolean) : walk(root);
  return files.filter((file) => fs.existsSync(path.join(root, file)));
}

/** @param {readonly Edit[]} edits */
function mutate(text, edits) {
  let mutated = text;
  for (const { find, replace } of edits) {
    const count = mutated.split(find).length - 1;
    if (count !== 1) throw new Error(`${JSON.stringify(find)} occurs ${count} times`);
    mutated = mutated.replace(find, () => replace);
  }
  return mutated;
}

function withTail(message, output) {
  return message + output.split("\n").filter(Boolean).slice(-6).map((line) => `\n  ${line}`).join("");
}

/** @returns {Case[]} */
function cases(output) {
  const lines = output.split("\n");
  const starts = lines.flatMap((line, index) => (CASE.test(line) ? [index] : []));
  return starts.map((start, index) => {
    const [, word, name] = CASE.exec(lines[start]);
    const own = lines.slice(start + 1, starts[index + 1]);
    const ready = own.findIndex((line) => line.trim() === `ready ${name}`);
    if (word === "PASS") return { name, result: "passed", ready: ready !== -1 };
    const behaviour = ready === -1 ? [] : own.slice(ready + 1);
    return { name, result: behaviour.some((line) => ASSERTION_FAILED.test(line)) ? "asserted" : "errored" };
  });
}

/** @param {readonly Case[]} found */
function names(found) {
  return found.map(({ name }) => name).sort().join(" ");
}

/** @returns {string | null} */
function syntaxError(script, text) {
  const check = SYNTAX_CHECKS[path.extname(script)];
  if (check === undefined) return `no syntax check is known for ${script}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shell-test-runs-entry."));
  try {
    const file = path.join(dir, path.basename(script));
    fs.writeFileSync(file, text);
    const [command, ...args] = check;
    const result = spawnSync(command, [...args, file], { cwd: dir, encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] });
    if (result.error) return `cannot run ${command}: ${result.error.message}`;
    if (result.status === 0) return null;
    return withTail(`the mutant fails ${[path.basename(command), ...args].join(" ")}`, result.stderr.replaceAll(file, script));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function plan(root) {
  const files = listFiles(root);
  if (!files.includes(POLICIES)) throw new Undecidable(`cannot read ${POLICIES}`);
  let registry;
  try {
    registry = parseRegistry(fs.readFileSync(path.join(root, POLICIES), "utf8"));
  } catch (error) {
    throw new Undecidable(`cannot use ${POLICIES}: ${error.message}`);
  }
  const problems = [];
  const fileSet = new Set(files);
  const ignored = (file) => registry.ignore.some((dir) => file === dir || file.startsWith(`${dir.replace(/\/$/, "")}/`));
  const listed = new Set(registry.scripts.flatMap((script) => script.tests));
  for (const test of files.filter((file) => file.endsWith(".test.sh") && !ignored(file) && !listed.has(file))) {
    problems.push(`${test} is not listed in ${POLICIES}, so no mutation checks it`);
  }
  /** @type {{ test: string; policy: string; mutant: Mutant }[]} */
  const mutants = [];
  for (const script of registry.scripts) {
    for (const file of [script.path, ...script.tests]) {
      if (!fileSet.has(file)) problems.push(`${file} is not a file under ROOT`);
    }
    if (!fileSet.has(script.path)) continue;
    const text = fs.readFileSync(path.join(root, script.path), "utf8");
    for (const { policy, mutation } of script.policies) {
      try {
        const mutant = { script: script.path, text: mutate(text, mutation) };
        const invalid = syntaxError(script.path, mutant.text);
        if (invalid !== null) throw new Error(invalid);
        mutants.push(...script.tests.map((test) => ({ test, policy, mutant })));
      } catch (error) {
        problems.push(`cannot break "${policy}" in ${script.path}: ${error.message}`);
      }
    }
  }
  if (problems.length > 0) throw new Undecidable(problems.join("\nshell-test-runs-entry: "));
  return { files, tests: [...listed], mutants };
}

// The test's own background processes share its group, so a run ends with none left behind.
function killGroup(pid) {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {}
}

/**
 * @param {Mutant | null} mutant
 * @returns {Promise<Outcome>}
 */
async function runTest(root, files, test, mutant, timeoutMs) {
  const run = fs.mkdtempSync(path.join(os.tmpdir(), "shell-test-runs-entry."));
  const copy = path.join(run, "root");
  const log = path.join(run, "output.log");
  try {
    fs.mkdirSync(path.join(run, "tmp"));
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(copy, file)), { recursive: true });
      fs.copyFileSync(path.join(root, file), path.join(copy, file));
    }
    if (fs.existsSync(path.join(root, "node_modules"))) fs.symlinkSync(path.join(root, "node_modules"), path.join(copy, "node_modules"));
    if (mutant !== null) fs.writeFileSync(path.join(copy, mutant.script), mutant.text);
    const output = fs.openSync(log, "w");
    const child = spawn("bash", [test], { cwd: copy, env: { ...process.env, TMPDIR: path.join(run, "tmp") }, detached: true, stdio: ["ignore", output, output] });
    fs.closeSync(output);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child.pid);
    }, timeoutMs);
    /** @type {{ status: number | null; signal: string | null; error: Error | null }} */
    const exit = await new Promise((resolve) => {
      child.on("error", (error) => resolve({ status: null, signal: null, error }));
      child.on("exit", (status, signal) => resolve({ status, signal, error: null }));
    });
    clearTimeout(timer);
    killGroup(child.pid);
    if (exit.error !== null) return { kind: "unrunnable", reason: `cannot start bash: ${exit.error.message}` };
    if (timedOut) return { kind: "unrunnable", reason: `timed out after ${timeoutMs / 1000}s` };
    const printed = fs.readFileSync(log, "utf8").trimEnd();
    if (exit.status === 0) return { kind: "passed", cases: cases(printed) };
    const ending = exit.status === null ? `signal ${exit.signal}` : `exit ${exit.status}`;
    return { kind: "failed", ending, output: printed, cases: cases(printed) };
  } finally {
    fs.rmSync(run, { recursive: true, force: true });
  }
}

async function inParallel(tasks, limit) {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/** @param {readonly Outcome[]} outcomes */
function verdict(tests, mutants, outcomes) {
  /** @type {Map<string, readonly Case[]>} */
  const controls = new Map();
  const findings = [];
  const undecided = [];
  for (const [index, test] of tests.entries()) {
    const outcome = outcomes[index];
    switch (outcome.kind) {
      case "passed": {
        const failing = outcome.cases.filter(({ result }) => result !== "passed");
        if (failing.length === 0) controls.set(test, outcome.cases);
        else undecided.push(`${test} reports ${failing.map(({ name }) => `FAIL ${name}`).join(", ")} before any mutation`);
        break;
      }
      case "failed":
        undecided.push(withTail(`${test} fails with ${outcome.ending} before any mutation`, outcome.output));
        break;
      case "unrunnable":
        undecided.push(`${test} ${outcome.reason} before any mutation`);
        break;
      default: {
        /** @type {never} */
        const unhandled = outcome;
        throw new Error(`unhandled outcome ${JSON.stringify(unhandled)}`);
      }
    }
  }
  for (const [index, { test, policy, mutant }] of mutants.entries()) {
    const control = controls.get(test);
    if (control === undefined) continue;
    const outcome = outcomes[tests.length + index];
    switch (outcome.kind) {
      case "passed":
        findings.push(`${test}: passes when ${mutant.script} breaks "${policy}", so the test does not run the policy it guards`);
        break;
      case "failed": {
        const ready = new Set(control.flatMap((found) => (found.result === "passed" && found.ready ? [found.name] : [])));
        if (names(outcome.cases) !== names(control)) {
          undecided.push(withTail(`${test} fails with ${outcome.ending} when ${mutant.script} breaks "${policy}" without reporting the cases it reports as it is, so no case shows that the test checks the policy`, outcome.output));
        } else if (!outcome.cases.some(({ name, result }) => result === "asserted" && ready.has(name))) {
          undecided.push(withTail(`${test} fails with ${outcome.ending} when ${mutant.script} breaks "${policy}" without a case that prints its ready line in both runs and then fails with an ASSERTION FAILED line, so the failure does not show that the test checks the policy`, outcome.output));
        }
        break;
      }
      case "unrunnable":
        undecided.push(`${test} ${outcome.reason} when ${mutant.script} breaks "${policy}"`);
        break;
      default: {
        /** @type {never} */
        const unhandled = outcome;
        throw new Error(`unhandled outcome ${JSON.stringify(unhandled)}`);
      }
    }
  }
  return { findings, undecided };
}

async function main() {
  const { root, timeoutMs } = parseArguments(process.argv.slice(2));
  const { files, tests, mutants } = plan(root);
  const runs = [...tests.map((test) => ({ test, mutant: null })), ...mutants];
  const outcomes = await inParallel(
    runs.map(({ test, mutant }) => () => runTest(root, files, test, mutant, timeoutMs)),
    os.availableParallelism(),
  );
  const { findings, undecided } = verdict(tests, mutants, outcomes);
  for (const finding of findings) console.log(finding);
  console.log(`shell-test-runs-entry: ${findings.length} finding(s) in ${tests.length} shell test(s)`);
  for (const message of undecided) process.stderr.write(`shell-test-runs-entry: ${message}\n`);
  return findings.length > 0 ? 1 : undecided.length > 0 ? 2 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`shell-test-runs-entry: ${error instanceof Undecidable ? error.message : error.stack}\n`);
    process.exit(2);
  },
);
