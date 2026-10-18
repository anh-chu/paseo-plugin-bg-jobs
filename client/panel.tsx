import type { PluginAgentPanelProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { listJobsRpc, stopJobRpc, type Job } from "../shared/contract";

type ListedJob = Job & { tail: string; bytes: number };

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

function elapsed(from: string | null, to: string | null, now: number): string {
  if (!from) return "";
  const end = to ? Date.parse(to) : now;
  const total = Math.max(0, Math.round((end - Date.parse(from)) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function statusColor(theme: PluginTheme, status: Job["status"]): string {
  if (status === "running") return theme.colors.accent;
  if (status === "stopping") return theme.colors.statusWarning;
  if (status === "completed") return theme.colors.statusSuccess;
  if (status === "failed") return theme.colors.statusDanger;
  return theme.colors.foregroundMuted;
}

function useStyles(theme: PluginTheme, compact: boolean) {
  return useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: { padding: compact ? 12 : 20, gap: 12 },
      empty: { color: theme.colors.foregroundMuted, fontSize: 14 },
      card: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 10,
        backgroundColor: theme.colors.surface1,
        overflow: "hidden" as const,
      },
      header: { padding: 12, gap: 6 },
      row: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      status: { fontSize: 12, fontWeight: "600" as const },
      meta: { color: theme.colors.foregroundMuted, fontSize: 12, flex: 1 },
      command: { color: theme.colors.foreground, fontFamily: MONO, fontSize: 13 },
      summary: { color: theme.colors.foregroundMuted, fontSize: 12 },
      stop: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.statusDanger,
      },
      stopText: { color: theme.colors.statusDanger, fontSize: 12, fontWeight: "600" as const },
      output: {
        maxHeight: compact ? 180 : 260,
        backgroundColor: theme.colors.surface2,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
      },
      outputText: { color: theme.colors.foreground, fontFamily: MONO, fontSize: 12, padding: 10 },
    }),
    [theme, compact],
  );
}

function JobCard({
  job,
  now,
  styles,
  theme,
  onStop,
}: {
  job: ListedJob;
  now: number;
  styles: ReturnType<typeof useStyles>;
  theme: PluginTheme;
  onStop: () => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const live = job.status === "running" || job.status === "stopping";
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.row}>
          <Text style={[styles.status, { color: statusColor(theme, job.status) }]}>
            {job.status}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {elapsed(job.startedAt, job.endedAt, now)} · {job.taskId}
          </Text>
          {job.status === "running" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Stop background task ${job.taskId}`}
              onPress={onStop}
              style={styles.stop}
            >
              <Text style={styles.stopText}>Stop</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.command} numberOfLines={3}>
          {job.command}
        </Text>
        {job.summary ? <Text style={styles.summary}>{job.summary}</Text> : null}
      </View>
      <ScrollView
        ref={scroll}
        style={styles.output}
        onContentSizeChange={() => live && scroll.current?.scrollToEnd({ animated: false })}
      >
        <Text style={styles.outputText} selectable>
          {job.tail || (job.bytes === 0 ? "(no output yet)" : "")}
        </Text>
      </ScrollView>
    </View>
  );
}

export function JobsPanel({ agentId, theme, layout }: PluginAgentPanelProps) {
  const list = useRpc(listJobsRpc);
  const stop = useRpc(stopJobRpc);
  const queryClient = useQueryClient();
  const styles = useStyles(theme, layout.compact);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const jobs = useQuery({
    queryKey: ["bg-jobs", agentId],
    queryFn: () => list({ agentId }),
    refetchInterval: 2000,
  });
  const stopJob = useMutation({
    mutationFn: (taskId: string) => stop({ agentId, taskId }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["bg-jobs", agentId] }),
  });

  const items = jobs.data?.jobs ?? [];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {jobs.error ? (
        <Text style={[styles.empty, { color: theme.colors.statusDanger }]}>
          {String(jobs.error)}
        </Text>
      ) : null}
      {stopJob.error ? (
        <Text style={[styles.empty, { color: theme.colors.statusDanger }]}>
          Stop failed: {String(stopJob.error)}
        </Text>
      ) : null}
      {items.length === 0 && !jobs.isLoading ? (
        <Text style={styles.empty}>This agent has no background commands.</Text>
      ) : null}
      {items.map((job) => (
        <JobCard
          key={job.taskId}
          job={job}
          now={now}
          styles={styles}
          theme={theme}
          onStop={() => stopJob.mutate(job.taskId)}
        />
      ))}
    </ScrollView>
  );
}
