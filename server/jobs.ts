import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { Job } from "../shared/contract";
import { scanTimeline, type TimelineEntry } from "./scan";

type Paseo = PluginHandlerContext["paseo"];

// ponytail: only the newest 2000 timeline entries are scanned, so a job launched earlier
// in a very long session is not listed. Upgrade: page backwards with `cursor`.
const TIMELINE_LIMIT = 2000;
const TAIL_BYTES = 16 * 1024;
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

const jobsByAgent = new Map<string, Job[]>();
const closedAt = new Map<string, string>();
const stopping = new Set<string>();

export async function refresh(paseo: Paseo, agentId: string): Promise<Job[]> {
  const page = await paseo.agents
    .ref(agentId)
    .timeline.refetch({ direction: "tail", limit: TIMELINE_LIMIT });
  const closed = closedAt.get(agentId);
  const jobs = scanTimeline(page.entries as readonly TimelineEntry[]).map((job) => {
    if (job.status !== "running") {
      stopping.delete(`${agentId}:${job.taskId}`);
      return job;
    }
    // Closing an agent's runtime ends the Claude process and its background shells.
    if (closed && job.startedAt && job.startedAt < closed) {
      return { ...job, status: "ended" as const, endedAt: closed };
    }
    if (stopping.has(`${agentId}:${job.taskId}`)) return { ...job, status: "stopping" as const };
    return job;
  });
  jobsByAgent.set(agentId, jobs);
  return jobs;
}

export function markClosed(agentId: string) {
  closedAt.set(agentId, new Date().toISOString());
}

export function markStopping(agentId: string, taskId: string) {
  stopping.add(`${agentId}:${taskId}`);
}

export function runningCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [agentId, jobs] of jobsByAgent) {
    const running = jobs.filter((j) => j.status === "running" || j.status === "stopping").length;
    if (running > 0) counts[agentId] = running;
  }
  return counts;
}

// The output path comes from timeline text, so only Claude Code's own task output files are read.
async function claudeTaskFile(file: string): Promise<string | null> {
  const name = `claude-${process.getuid?.() ?? ""}`;
  const bases = [process.env.CLAUDE_CODE_TMPDIR, tmpdir(), "/tmp"].filter((b): b is string => !!b);
  const target = await realpath(file);
  if (!target.endsWith(".output") || !target.includes(`${sep}tasks${sep}`)) return null;
  for (const base of bases) {
    const root = await realpath(join(base, name)).catch(() => null);
    if (root && target.startsWith(root + sep)) return target;
  }
  return null;
}

export async function readTail(file: string): Promise<{ tail: string; bytes: number }> {
  try {
    const target = await claudeTaskFile(file);
    if (!target) return { tail: "", bytes: 0 };
    const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const { size } = await handle.stat();
      const length = Math.min(size, TAIL_BYTES);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, size - length);
      let text = buffer.toString("utf8").replace(ANSI, "");
      if (size > length) text = text.slice(text.indexOf("\n") + 1);
      return { tail: text, bytes: size };
    } finally {
      await handle.close();
    }
  } catch {
    return { tail: "", bytes: 0 };
  }
}
