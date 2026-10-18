import type { Job } from "../shared/contract";

export interface TimelineEntry {
  item: unknown;
  timestamp?: string | null;
}

// Claude Code's reply to a Bash call with run_in_background: true.
const LAUNCH_PATTERN =
  /Command running in background with ID: (\S+?)\. Output is being written to: (\S+?\.output)/;
const STOP_TOOLS = new Set(["TaskStop", "KillShell", "KillBash"]);

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec =>
  value && typeof value === "object" ? (value as Rec) : {};
const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

function notificationStatus(status: string | null): Job["status"] {
  const s = status?.toLowerCase();
  if (s === "failed" || s === "error") return "failed";
  if (s === "killed" || s === "stopped" || s === "canceled" || s === "cancelled") return "stopped";
  return "completed";
}

/** Rebuilds an agent's background Bash jobs from its timeline, oldest entry first. */
export function scanTimeline(entries: readonly TimelineEntry[]): Job[] {
  const jobs = new Map<string, Job>();
  for (const { item: raw, timestamp } of entries) {
    const item = rec(raw);
    if (item.type !== "tool_call") continue;
    const detail = rec(item.detail);
    const metadata = rec(item.metadata);
    const at = timestamp ?? null;

    if (detail.type === "shell") {
      const match = str(detail.output)?.match(LAUNCH_PATTERN);
      if (match && !jobs.has(match[1])) {
        jobs.set(match[1], {
          taskId: match[1],
          command: str(detail.command) ?? "",
          outputFile: match[2],
          status: "running",
          startedAt: at,
          endedAt: null,
          summary: null,
        });
      }
      continue;
    }

    if (item.name === "task_notification") {
      const job = jobs.get(str(metadata.taskId) ?? "");
      if (!job) continue;
      job.status = notificationStatus(str(metadata.status));
      job.endedAt = at;
      job.summary = str(rec(item.detail).label);
      continue;
    }

    if (STOP_TOOLS.has(String(item.name)) && item.status === "completed") {
      const input = rec(detail.input ?? item.input);
      const job = jobs.get(str(input.task_id) ?? str(input.shell_id) ?? "");
      if (job && (job.status === "running" || job.status === "stopping")) {
        job.status = "stopped";
        job.endedAt = at;
      }
    }
  }
  return [...jobs.values()];
}
