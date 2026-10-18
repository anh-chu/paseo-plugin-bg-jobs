import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { JobsPanel } from "./client/panel";
import { runningCountsRpc } from "./shared/contract";

const PANEL_ID = "jobs";
const POLL_MS = 4000;

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: PANEL_ID,
    title: "Background jobs",
    icon: "SquareTerminal",
    context: "agent",
    Component: JobsPanel,
  });
  client.addCommandCenterItem({
    id: "open-jobs",
    title: "Show background jobs",
    icon: "SquareTerminal",
    keywords: ["background", "jobs", "shell", "bash", "tasks"],
    context: "agent",
    onSelect({ openPanel }) {
      openPanel(PANEL_ID);
    },
  });

  // A pill appears only while an agent has running background jobs.
  const workspaces = new Map<string, string>();
  const pills = new Map<string, { registration: PluginButtonRegistration; count: number }>();
  const lifetime = new AbortController();

  const label = (count: number) => `${count} bg job${count === 1 ? "" : "s"}`;
  const removePill = (agentId: string) => {
    pills.get(agentId)?.registration.remove();
    pills.delete(agentId);
  };

  const sync = (counts: Record<string, number>) => {
    for (const agentId of [...pills.keys()]) {
      if (!counts[agentId] || !workspaces.has(agentId)) removePill(agentId);
    }
    for (const [agentId, count] of Object.entries(counts)) {
      const workspaceId = workspaces.get(agentId);
      if (!workspaceId) continue;
      const existing = pills.get(agentId);
      if (existing) {
        if (existing.count !== count) existing.registration.update({ label: label(count) });
        existing.count = count;
        continue;
      }
      const registration = client.addComposerPill({
        id: "bg-jobs",
        workspaceId,
        agentId,
        button: {
          title: "Show background jobs",
          icon: "SquareTerminal",
          label: label(count),
          behavior: {
            kind: "action",
            onPress() {
              client.openPanel(PANEL_ID, { workspaceId, agentId });
            },
          },
        },
      });
      pills.set(agentId, { registration, count });
    }
  };

  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      subscription.subscribe({
        snapshot: ({ entries }) => {
          workspaces.clear();
          for (const { agent } of entries) {
            if (agent.workspaceId) workspaces.set(agent.id, agent.workspaceId);
          }
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "upsert") {
            if (update.agent.workspaceId) workspaces.set(update.agent.id, update.agent.workspaceId);
            return;
          }
          workspaces.delete(update.agentId);
          removePill(update.agentId);
        },
      });
      return undefined;
    })
    .catch((error) => {
      if (!lifetime.signal.aborted) console.error("[bg-jobs] agent list failed", error);
    });

  const poll = () =>
    client
      .rpc(runningCountsRpc, {})
      .then(({ counts }) => !lifetime.signal.aborted && sync(counts))
      .catch(() => undefined);
  void poll();
  const timer = setInterval(poll, POLL_MS);

  return () => {
    lifetime.abort();
    clearInterval(timer);
    for (const agentId of [...pills.keys()]) removePill(agentId);
  };
}
