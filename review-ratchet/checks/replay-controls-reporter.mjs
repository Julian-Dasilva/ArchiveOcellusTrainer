import fs from "node:fs";

// Vitest leaves a hook that threw at "run" in result.hooks, and records a failed beforeAll, afterAll or collection on the suite or module itself.
const ownFault = (task) => {
  const hook = Object.entries(task.result?.hooks ?? {}).find(([, state]) => state !== "pass");
  const [error] = task.result?.errors ?? [];
  if (hook === undefined && (task.type === "test" || error === undefined)) return "";
  return (error?.message ?? `${hook[0]} did not finish`).split("\n")[0];
};

export default class ReplayControlsReporter {
  onTestRunEnd(modules) {
    const files = modules.map((module) => {
      const tests = [];
      const visit = (task, titles, inherited) => {
        const fault = inherited || ownFault(task);
        if (task.type === "test") {
          const state = task.result?.state;
          const status = state === "pass" ? "pass" : state === "fail" ? "fail" : "skip";
          const [error] = task.result?.errors ?? [];
          tests.push({
            name: [...titles, task.name].join(" > "),
            status,
            detail: error ? `${error.name}: ${error.message}`.split("\n")[0] : "",
            fault: fault || (status === "skip" ? "skipped after the overlay" : ""),
          });
          return;
        }
        const path = task === module.task ? titles : [...titles, task.name];
        for (const child of task.tasks ?? []) visit(child, path, fault);
      };
      visit(module.task, [], "");
      return { file: module.moduleId, error: ownFault(module.task), tests };
    });
    fs.writeFileSync(process.env.REPLAY_CONTROLS_REPORT, JSON.stringify({ files }));
  }
}
