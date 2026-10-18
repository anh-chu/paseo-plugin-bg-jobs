import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readTail } from "./jobs";

const root = join(tmpdir(), `claude-${process.getuid?.() ?? ""}`, `bg-jobs-test-${process.pid}`);
const tasks = join(root, "tasks");
const outside = join(tmpdir(), `bg-jobs-outside-${process.pid}.output`);
mkdirSync(tasks, { recursive: true });
writeFileSync(join(tasks, "b1.output"), "line 1\nline 2\n");
writeFileSync(outside, "secret");
symlinkSync(outside, join(tasks, "link.output"));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { force: true });
});

describe("readTail", () => {
  it("reads a Claude Code task output file", async () => {
    expect(await readTail(join(tasks, "b1.output"))).toEqual({ tail: "line 1\nline 2\n", bytes: 14 });
  });

  it("refuses a file outside the Claude Code temp folder", async () => {
    expect(await readTail(outside)).toEqual({ tail: "", bytes: 0 });
  });

  it("refuses a symlink that points outside", async () => {
    expect(await readTail(join(tasks, "link.output"))).toEqual({ tail: "", bytes: 0 });
  });
});
