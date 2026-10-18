import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listJobsRpc, runningCountsRpc, stopJobRpc } from "./shared/contract";
import { markClosed, markStopping, readTail, refresh, runningCounts } from "./server/jobs";

export default function contribute(server: PluginServerContext) {
  let primed: Promise<void> | null = null;

  server.on("agent.turn_ended", (event, { paseo }) => refresh(paseo, event.agent.id).then(() => {}));
  server.on("agent.closed", (event, { paseo }) => {
    markClosed(event.agent.id);
    return refresh(paseo, event.agent.id).then(() => {});
  });

  server.handle(listJobsRpc, async ({ agentId }, { paseo }) => {
    const jobs = await refresh(paseo, agentId);
    return {
      jobs: await Promise.all(
        jobs.reverse().map(async (job) => ({ ...job, ...(await readTail(job.outputFile)) })),
      ),
    };
  });

  server.handle(runningCountsRpc, async (_input, { paseo }) => {
    // After a plugin start, scan live agents once so jobs launched earlier show up.
    primed ??= paseo.agents
      .list()
      .then(({ entries }) =>
        Promise.allSettled(entries.map(({ agent }) => refresh(paseo, agent.id))),
      )
      .then(() => {});
    await primed;
    return { counts: runningCounts() };
  });

  server.handle(stopJobRpc, async ({ agentId, taskId }, { paseo }) => {
    await paseo.agents
      .ref(agentId)
      .send(
        `Stop background task ${taskId} with TaskStop now. Do nothing else and reply in one line.`,
        { activeTurnBehavior: "steer" },
      );
    markStopping(agentId, taskId);
    await refresh(paseo, agentId);
    return {};
  });

  return () => {};
}
