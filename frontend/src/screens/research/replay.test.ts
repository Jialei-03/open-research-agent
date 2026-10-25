import { describe, expect, it } from "vitest";
import type { ProjectDetail, ResearchEvent } from "./research-api";
import { milestones, replayMarkdown, rewind } from "./replay";

const t = ((key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}${JSON.stringify(vars)}` : key) as Parameters<
  typeof milestones
>[2];

const event = (
  id: string,
  at: string,
  action: string,
  detail: Record<string, unknown>,
  extra: Partial<ResearchEvent> = {},
): ResearchEvent => ({
  id,
  node_id: null,
  sprint_id: null,
  actor: "executor",
  action,
  detail,
  created_at: at,
  ...extra,
});

const events: ResearchEvent[] = [
  event("s1", "2026-10-20T01:00:00Z", "stage_changed", {
    from: "scoping",
    to: "experiments",
  }),
  event(
    "a1",
    "2026-10-20T02:00:00Z",
    "add_node",
    { kind: "hypothesis", title: "H1 lr", reason: "" },
    { node_id: "h1" },
  ),
  event(
    "u1",
    "2026-10-21T03:00:00Z",
    "update_node",
    {
      before: { status: "active" },
      after: { status: "refuted" },
      reason: "三个种子都没有提升",
    },
    { node_id: "h1", sprint_id: "sp2" },
  ),
  event("c1", "2026-10-22T04:00:00Z", "concluded", { summary: "不需要" }),
  event("m1", "2026-10-22T05:00:00Z", "message", { text: "hi" }),
];

const detail = {
  project: {
    id: "p",
    stage: "done",
    status: "finished",
    spent: { sprints: 2, tokens: 300, job_seconds: 0 },
    conclusion_record: { summary: "不需要" },
  },
  nodes: [
    {
      id: "root",
      parent_id: null,
      title: "Q",
      status: "supported",
      created_at: "2026-10-20T00:00:00Z",
    },
    {
      id: "h1",
      parent_id: "root",
      title: "H1 lr",
      status: "refuted",
      created_at: "2026-10-20T02:00:00Z",
    },
  ],
  sprints: [
    {
      id: "sp1",
      status: "ended",
      tokens: 100,
      created_at: "2026-10-20T01:30:00Z",
      updated_at: "2026-10-20T02:30:00Z",
    },
    {
      id: "sp2",
      status: "ended",
      tokens: 200,
      created_at: "2026-10-21T02:00:00Z",
      updated_at: "2026-10-21T03:30:00Z",
    },
  ],
  jobs: [
    {
      id: "j1",
      status: "succeeded",
      started_at: "2026-10-21T02:10:00Z",
      finished_at: "2026-10-21T02:50:00Z",
      metrics: { acc: 0.9 },
      points: 3,
    },
  ],
} as unknown as ProjectDetail;

describe("replay", () => {
  it("keeps the steps that moved the research, with why", () => {
    const steps = milestones(events, detail.nodes, t);
    expect(steps.map((s) => s.id)).toEqual(["s1", "a1", "u1", "c1"]);
    expect(steps[2].why).toBe("三个种子都没有提升");
    expect(steps[2].sprintId).toBe("sp2");
  });

  it("rebuilds the board as it stood at a moment", () => {
    const then = rewind(detail, events, "2026-10-21T02:20:00Z");
    expect(then.detail.project.stage).toBe("experiments");
    expect(then.detail.project.status).toBe("active");
    expect(then.detail.nodes.find((n) => n.id === "h1")?.status).toBe("active");
    // The experiment was running then; its numbers came later.
    expect(then.detail.jobs[0]).toMatchObject({ status: "running", points: 0 });
    expect(then.detail.sprints.map((s) => s.status)).toEqual([
      "ended",
      "running",
    ]);
    expect(then.detail.project.spent.tokens).toBe(300);
    expect(then.events.map((e) => e.id)).toEqual(["s1", "a1"]);
    // Before anything, the stage is the one it started in.
    expect(
      rewind(detail, events, "2026-10-19T00:00:00Z").detail.project.stage,
    ).toBe("scoping");
    // The whole record leaves the present as it is.
    const now = rewind(detail, events, "2026-10-23T00:00:00Z").detail;
    expect(now.project.status).toBe("finished");
    expect(now.nodes.find((n) => n.id === "h1")?.status).toBe("refuted");
  });

  it("writes the timeline as one Markdown page, a section a day", () => {
    const steps = milestones(events, detail.nodes, t);
    const md = replayMarkdown(
      "Title",
      "Q?",
      steps,
      (a) => a,
      (at) => at.slice(0, 10),
      (at) => at.slice(11, 16),
      (who, what) => `${who}: ${what}`,
    );
    expect(md.split("\n").filter((l) => l.startsWith("## "))).toEqual([
      "## 2026-10-20",
      "## 2026-10-21",
      "## 2026-10-22",
    ]);
    expect(md).toContain("  三个种子都没有提升");
  });
});
