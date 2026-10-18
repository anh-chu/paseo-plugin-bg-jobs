import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const jobStatusSchema = z.enum([
  "running",
  "stopping",
  "completed",
  "failed",
  "stopped",
  "ended",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const jobSchema = z.object({
  taskId: z.string(),
  command: z.string(),
  outputFile: z.string(),
  status: jobStatusSchema,
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  summary: z.string().nullable(),
});
export type Job = z.infer<typeof jobSchema>;

export const listJobsRpc = defineRpc({
  name: "jobs.list",
  input: z.object({ agentId: z.string() }),
  output: z.object({
    jobs: z.array(jobSchema.extend({ tail: z.string(), bytes: z.number() })),
  }),
});

export const runningCountsRpc = defineRpc({
  name: "jobs.running",
  input: z.object({}),
  output: z.object({ counts: z.record(z.string(), z.number()) }),
});

export const stopJobRpc = defineRpc({
  name: "jobs.stop",
  input: z.object({ agentId: z.string(), taskId: z.string() }),
  output: z.object({}),
});
