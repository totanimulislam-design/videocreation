import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const cli = join(root, "src/quality/cli.ts");
const fixtures = join(root, "tests/fixtures");

function run(args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });
}

test("CLI approves the strong fixture and writes artifacts", () => {
  const dir = mkdtempSync(join(tmpdir(), "quality-cli-"));
  try {
    const result = run([
      join(fixtures, "poster-strong.json"),
      "--assets", join(fixtures, "assets-strong.json"),
      "--brief", join(fixtures, "brief-strong.json"),
      "--exports", join(fixtures, "exports-strong.json"),
      "--critique", join(fixtures, "critique-strong.json"),
      "--preview", join(dir, "preview.svg"),
      "--report", join(dir, "report.json"),
      "--markdown", join(dir, "report.md"),
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes("approved"));
    assert.ok(existsSync(join(dir, "preview.svg")));
    assert.ok(existsSync(join(dir, "report.json")));
    assert.ok(existsSync(join(dir, "report.md")));
    const report = JSON.parse(readFileSync(join(dir, "report.json"), "utf8")) as {
      deliveryStatus: string;
      totalScore: number;
    };
    assert.equal(report.deliveryStatus, "approved");
    assert.ok(report.totalScore >= 85);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI rejects the weak fixture with exit code 2", () => {
  const result = run([join(fixtures, "poster-weak.json")]);
  assert.equal(result.status, 2, result.stderr);
  assert.ok(result.stdout.includes("rejected"));
  assert.ok(result.stdout.includes("critical"));
});

test("CLI reports usage errors with exit code 3", () => {
  const result = run([]);
  assert.equal(result.status, 3);
  assert.ok(result.stderr.includes("Usage"));
});
