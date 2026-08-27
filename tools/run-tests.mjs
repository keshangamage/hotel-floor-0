/**
 * Runs every suite in apps/web/tests and reports which failed.
 *
 * These are plain scripts rather than a framework: they build real floors and
 * walk real colliders, so a runner and a non-zero exit code is all they need.
 *
 *   bun run test
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const DIR = "apps/web/tests";
const only = process.argv[2];
const suites = readdirSync(DIR)
  .filter((f) => f.endsWith(".test.ts"))
  .filter((f) => !only || f.includes(only))
  .sort();

if (suites.length === 0) {
  console.error(only ? `no suite matching "${only}"` : `no suites in ${DIR}`);
  process.exit(1);
}

const failed = [];
for (const suite of suites) {
  const name = suite.replace(".test.ts", "");
  const run = spawnSync("bun", ["run", `${DIR}/${suite}`], { encoding: "utf8" });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const ok = run.status === 0;
  if (!ok) failed.push({ name, output });
  const summary = output.match(/(\d+) CHECK\(S\) FAILED/)?.[0]
    ?? (ok ? `${(output.match(/^PASS/gm) ?? []).length} checks` : "did not run");
  console.log(`${ok ? "  ok  " : "FAIL  "}${name.padEnd(18)} ${summary}`);
}

for (const { name, output } of failed) {
  console.log(`\n----- ${name} -----`);
  console.log(output.split("\n").filter((l) => l.startsWith("FAIL") || l.includes("Error")).join("\n"));
}

console.log(failed.length === 0
  ? `\n${suites.length} suites passed`
  : `\n${failed.length} of ${suites.length} suites failed`);
process.exit(failed.length === 0 ? 0 : 1);
