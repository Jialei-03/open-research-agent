import type { Translator } from "../../i18n/i18n";
import type { MessageKey } from "../../i18n/i18n";
import type {
  ProjectDetail,
  ResearchEvent,
  ResearchNode,
} from "./research-api";

/** One step on a research's timeline: what happened, who did it, why. */
export interface Milestone {
  id: string;
  at: string;
  actor: string;
  text: string;
  why: string;
  sprintId: string | null;
}

const statusOf = (value: unknown) =>
  typeof value === "string" ? value : undefined;

/** What the record says moved the research: stages, plans, verdicts, results, answers. */
export function milestones(
  events: ResearchEvent[],
  nodes: ResearchNode[],
  t: Translator["t"],
): Milestone[] {
  const titles = new Map(nodes.map((n) => [n.id, n.title]));
  const out: Milestone[] = [];
  for (const e of events) {
    const d = e.detail;
    const title = (e.node_id && titles.get(e.node_id)) || String(d.title || "");
    const add = (text: string, why = "") =>
      out.push({
        id: e.id,
        at: e.created_at,
        actor: e.actor,
        text,
        why: why.trim(),
        sprintId: e.sprint_id,
      });
    switch (e.action) {
      case "stage_changed":
        add(
          t("research.replay.stage", {
            stage: t(`research.stage.${String(d.to)}` as MessageKey),
          }),
          String(d.note || ""),
        );
        break;
      case "plan_proposed":
        add(t("research.replay.plan"));
        break;
      case "add_node":
        if (d.kind !== "question")
          add(t("research.replay.added", { title }), String(d.reason || ""));
        break;
      case "update_node": {
        const after = statusOf((d.after as Record<string, unknown>)?.status);
        if (!after) break;
        const reason = String(d.reason || "");
        add(
          t("research.replay.status", {
            title,
            status: t(`research.node.${after}` as MessageKey),
          }),
          /^[a-z_]+$/.test(reason) ? "" : reason,
        );
        break;
      }
      case "record_result":
        add(t("research.replay.result", { title }), String(d.summary || ""));
        break;
      case "advice":
        if (d.verdict === "kill" || d.verdict === "pivot")
          add(
            t(`research.replay.${d.verdict}` as MessageKey, { title }),
            String(d.reason || ""),
          );
        break;
      case "human_decision":
        add(
          t(d.approve ? "research.replay.agreed" : "research.replay.declined"),
          String(d.note || ""),
        );
        break;
      case "concluded":
        add(t("research.replay.concluded"), String(d.summary || ""));
        break;
    }
  }
  return out;
}

/**
 * The research as it stood at a moment, rebuilt from the record: hypotheses
 * as they were, the experiments started by then, the stage it was in.
 */
export function rewind(
  detail: ProjectDetail,
  events: ResearchEvent[],
  at: string,
): { detail: ProjectDetail; events: ResearchEvent[] } {
  const until = events.filter((e) => e.created_at <= at);
  const nodes = new Map<string, ResearchNode>(
    detail.nodes
      .filter((n) => !n.parent_id || n.created_at <= at)
      .map((n) => [n.id, { ...n }]),
  );
  // Undo what changed afterwards, newest first.
  for (const e of [...events].reverse()) {
    if (e.created_at <= at || e.action !== "update_node" || !e.node_id)
      continue;
    const node = nodes.get(e.node_id);
    const before = e.detail.before as Partial<ResearchNode> | undefined;
    if (node && before) Object.assign(node, before);
  }
  const later = (value?: string) => !!value && value > at;
  const jobs = detail.jobs
    .filter((j) => j.started_at && j.started_at <= at)
    .map((j) =>
      later(j.finished_at)
        ? { ...j, status: "running" as const, metrics: {}, points: 0 }
        : j,
    );
  const sprints = detail.sprints
    .filter((s) => s.created_at <= at)
    .map((s) =>
      s.status !== "running" && later(s.updated_at)
        ? { ...s, status: "running" as const }
        : s,
    );
  const stage =
    [...until].reverse().find((e) => e.action === "stage_changed")?.detail.to ??
    events.find((e) => e.action === "stage_changed")?.detail.from ??
    detail.project.stage;
  const concluded = until.some((e) => e.action === "concluded");
  return {
    events: until,
    detail: {
      ...detail,
      project: {
        ...detail.project,
        stage: String(stage) as ProjectDetail["project"]["stage"],
        status: concluded ? "finished" : "active",
        conclusion_record: concluded ? detail.project.conclusion_record : {},
        spent: {
          ...detail.project.spent,
          tokens: sprints.reduce((sum, s) => sum + (s.tokens || 0), 0),
        },
      },
      nodes: [...nodes.values()],
      jobs,
      sprints,
    },
  };
}

/** The timeline as one Markdown page, for a methods section or a group meeting. */
export function replayMarkdown(
  title: string,
  question: string,
  steps: Milestone[],
  actorName: (actor: string) => string,
  day: (at: string) => string,
  time: (at: string) => string,
  /** "who: what", in the reader's language. */
  said: (who: string, what: string) => string,
) {
  const lines = [`# ${title}`, "", `> ${question}`, ""];
  let current = "";
  for (const step of steps) {
    const date = day(step.at);
    if (date !== current) {
      current = date;
      lines.push(`## ${date}`, "");
    }
    lines.push(
      `- **${time(step.at)}** ${said(actorName(step.actor), step.text)}`,
    );
    if (step.why) lines.push(`  ${step.why.replace(/\n+/g, " ")}`);
  }
  return lines.join("\n") + "\n";
}
