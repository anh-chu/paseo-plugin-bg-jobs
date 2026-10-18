import { describe, expect, it } from "vitest";
import { scanTimeline } from "./scan";

const launch = (id: string, command: string) => ({
  timestamp: "2026-10-18T10:00:00.000Z",
  item: {
    type: "tool_call",
    name: "Bash",
    status: "completed",
    detail: {
      type: "shell",
      command,
      output: `Command running in background with ID: ${id}. Output is being written to: /tmp/claude-1001/x/tasks/${id}.output. You will be notified when it completes.`,
    },
  },
});

const notify = (id: string, status: string) => ({
  timestamp: "2026-10-18T10:05:00.000Z",
  item: {
    type: "tool_call",
    name: "task_notification",
    status: "completed",
    detail: { type: "plain_text", label: `Background command "${id}" ${status}` },
    metadata: { taskId: id, status },
  },
});

describe("scanTimeline", () => {
  it("finds a background launch and keeps it running", () => {
    const [job] = scanTimeline([launch("b1", "sleep 1800")]);
    expect(job).toMatchObject({
      taskId: "b1",
      command: "sleep 1800",
      outputFile: "/tmp/claude-1001/x/tasks/b1.output",
      status: "running",
      startedAt: "2026-10-18T10:00:00.000Z",
    });
  });

  it("ignores foreground shell calls", () => {
    const foreground = {
      item: { type: "tool_call", detail: { type: "shell", command: "ls", output: "a\nb" } },
    };
    expect(scanTimeline([foreground])).toEqual([]);
  });

  it("applies the task notification status", () => {
    const jobs = scanTimeline([
      launch("b1", "a"),
      launch("b2", "b"),
      launch("b3", "c"),
      notify("b1", "completed"),
      notify("b2", "failed"),
      notify("b3", "killed"),
    ]);
    expect(jobs.map((j) => j.status)).toEqual(["completed", "failed", "stopped"]);
    expect(jobs[0].endedAt).toBe("2026-10-18T10:05:00.000Z");
  });

  it("marks a job stopped after a completed TaskStop call", () => {
    const stop = {
      item: {
        type: "tool_call",
        name: "TaskStop",
        status: "completed",
        detail: { type: "unknown", input: { task_id: "b1" }, output: "ok" },
      },
    };
    expect(scanTimeline([launch("b1", "a"), stop])[0].status).toBe("stopped");
  });
});
