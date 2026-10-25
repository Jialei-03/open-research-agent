import { expect, test } from "@playwright/test";
import { createTranslator } from "../../src/i18n/i18n";
import type {
  AttentionMetrics,
  TeamWork,
} from "../../src/screens/research/team-work-api";
import type { TeamMessage } from "../../src/screens/research/team-api";
import { experiments, mockTeam } from "../fixtures/team";
import { signIn } from "../reader/fixtures";

test.use({ locale: "zh-CN" });

test("work navigation groups derived work, opens threads and shows member attention", async ({
  page,
}) => {
  const wid = "10000000-0000-4000-8000-000000000001";
  const { t, tn } = createTranslator("zh");
  const attention: AttentionMetrics = {
    asks: 2,
    pending: 1,
    median_wait_seconds: 60,
    waiting_seconds: 120,
    total_seconds: 240,
    waiting_share: 0.5,
    partial: true,
  };
  const member = {
    id: "writer",
    role: "custom",
    name: "Ada",
    status: "idle" as const,
    active_run_id: null,
  };
  const root: TeamMessage = {
    id: "thread-waiting",
    channel_id: experiments,
    thread_id: null,
    author_id: "writer",
    text: "Waiting topic",
    kind: "text",
    mentions: [],
    data: {},
    replies: 1,
    created_at: "2026-10-24T10:00:00Z",
  };
  const work: TeamWork = {
    generated_at: root.created_at,
    counts: { waiting: 1, review: 1, working: 1, queued: 1, done: 1 },
    attention: {
      total: attention,
      members: { writer: attention },
      researches: [],
    },
    items: (["waiting", "review", "working", "queued", "done"] as const).map(
      (group) => ({
        id: group,
        channel_id: experiments,
        thread_id: `thread-${group}`,
        research_id: null,
        title: `${group} topic`,
        group,
        status: group,
        member_ids: ["writer"],
        current_step: null,
        elapsed_seconds: 120,
        stuck: group === "waiting" ? ["owner_wait"] : [],
      }),
    ),
  };
  await page.addInitScript(() => localStorage.setItem("paper-locale", "zh"));
  await page.route("**/api/v1/health", (route) =>
    route.fulfill({ json: { mode: "local" } }),
  );
  await page.route("**/api/v1/translation-settings", (route) =>
    route.fulfill({
      json: {
        configured: true,
        active_id: "offline",
        models: [{ id: "offline", name: "Offline", model: "Offline" }],
      },
    }),
  );
  await page.route("**/api/v1/research/**", (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/settings"))
      return route.fulfill({ json: { computes: [], states: {} } });
    if (new URL(route.request().url()).pathname.endsWith("/navigation"))
      return route.fulfill({
        json: {
          workspaces: [
            {
              id: wid,
              name: "Team",
              kind: "research",
              archived: false,
              researches: [],
              location: { kind: "managed", path: "", connection_id: "" },
            },
          ],
          collections: [],
        },
      });
    return route.fulfill({ json: [] });
  });
  await mockTeam(page, {
    team: () => ({ members: [member] }),
    messages: (_channel, thread) => (thread ? [] : [root]),
  });
  await page.route("**/team/work", (route) => route.fulfill({ json: work }));
  await page.route("**/team/members/writer", (route) =>
    route.fulfill({
      json: { ...member, activity: "", threads: [], attention },
    }),
  );
  await signIn(page);
  await page.goto(`/#team/${wid}/${experiments}`);
  await page
    .getByRole("navigation", { name: "侧栏", exact: true })
    .locator('[data-id="board"]')
    .click();
  await expect(page).toHaveURL(new RegExp(`#team/${wid}/work$`));
  const board = page.getByTestId("team-work");
  await expect(board).toBeVisible();
  await expect(
    board.getByRole("heading", { name: tn("team.work.headline", 1) }),
  ).toBeVisible();
  await expect(board).not.toContainText(tn("team.work.asks", 2));
  await expect(board).toContainText(t("team.work.stuck"));
  // Four columns by state; review is work under way.
  const lane = (name: string) =>
    board.getByRole("region", { name, exact: true });
  await expect(board.getByRole("region")).toHaveText([
    new RegExp(`^${t("board.lane.queued")}`),
    new RegExp(`^${t("board.lane.working")}`),
    new RegExp(`^${t("board.lane.waiting")}`),
    new RegExp(`^${t("board.lane.done")}`),
  ]);
  for (const [name, topics] of [
    [t("board.lane.queued"), ["queued topic"]],
    [t("board.lane.working"), ["review topic", "working topic"]],
    [t("board.lane.waiting"), ["waiting topic"]],
    [t("board.lane.done"), ["done topic"]],
  ] as const)
    await expect(lane(name).getByRole("link")).toHaveText(
      topics.map((topic) => new RegExp(topic)),
    );
  await expect(
    lane(t("board.lane.waiting")).getByText(t("team.work.stuck")),
  ).toBeVisible();
  // By colleague: one column each, holding all their work; research-only has none here.
  await board.getByRole("radio", { name: t("board.byMember") }).click();
  await expect(lane("Ada").getByRole("link")).toHaveCount(5);
  await board.getByRole("radio", { name: t("board.research") }).click();
  await expect(board.getByRole("link")).toHaveCount(0);
  await board.getByRole("radio", { name: t("board.byState") }).click();
  await board.getByRole("link").filter({ hasText: "waiting topic" }).click();
  await expect(page).toHaveURL(
    new RegExp(`team/${wid}/${experiments}\\?thread=thread-waiting`),
  );
  await page.goto(`/#team/${wid}/settings?thread=member%3Awriter`);
  await expect(page.getByLabel(t("team.work.attention"))).toContainText(
    tn("team.work.asks", 2),
  );
});
