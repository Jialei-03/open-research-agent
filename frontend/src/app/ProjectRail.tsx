import { LayoutGrid, Plus } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { followLink } from "../reader/route";
import { Tooltip } from "../ui";
import { needsYou } from "../screens/research/navigation-attention";
import { useResearchNavigation } from "../screens/research/ResearchNavigation";
import { teamHash } from "../screens/research/team-api";
import { useTeamWorkspace } from "../screens/research/TeamNavigation";
import { parseAppRoute } from "./routes";
import { CreateWorkspaceDialog } from "../screens/research/WorkspaceDialogs";
import { useWorkspaceTeams } from "../screens/research/workspace-teams";
import { sidebarId } from "./sidebar-entries";
import styles from "./AppSidebar.module.css";

/**
 * The projects as Slack shows workspaces: a tile each, a dot while a colleague
 * works in it, a count of what waits on the researcher; "All" above them and a
 * new project below.
 */
export function ProjectRail({
  hash,
  section,
  restore,
  go,
}: {
  hash: string;
  section: string;
  /** Where the researcher last was in the research section, to return to from the other sections. */
  restore?: string;
  go(hash: string): void;
}) {
  const { t, tn } = useI18n();
  const { data } = useResearchNavigation();
  const current = useTeamWorkspace(hash);
  const restored = useTeamWorkspace(restore || hash);
  const [creating, setCreating] = useState(false);
  const open = data.workspaces.filter((w) => !w.archived);
  const teams = useWorkspaceTeams(open.map((w) => w.id));
  const messages = [...teams].flatMap(([id, team]) =>
    team.notifications.map((m) => ({ ...m, workspace_id: id })),
  );
  const waiting = needsYou(data, messages);
  const all = section === "research" && hash.split("?")[0] === "all";
  return (
    <div className={styles.projectRail}>
      <Tooltip
        content={t("projects.all")}
        placement={{ side: "right", align: "center" }}
      >
        <a
          className={styles.projectTile}
          data-id={sidebarId("all-projects")}
          data-all
          href="#all"
          aria-label={t("projects.all")}
          aria-current={all ? "page" : undefined}
          onClick={followLink(go, "all")}
        >
          <LayoutGrid size={18} aria-hidden />
        </a>
      </Tooltip>
      <span className={styles.railDivider} />
      {open.map((w) => {
        const count = waiting.filter(
          (item) => item.workspaceId === w.id,
        ).length;
        const team = teams.get(w.id);
        const working =
          !!team?.members.some((m) => m.status === "working") ||
          w.researches.some((r) => r.working);
        const active = !all && section === "research" && current === w.id;
        // From materials, tasks or customize a click on a project's tile returns to where its
        // work was left; the address stays the project's own (a new tab opens its home).
        const target =
          section !== "research" &&
          restore &&
          restored === w.id &&
          parseAppRoute(restore).screen !== "all-projects"
            ? restore
            : teamHash(w.id);
        return (
          <Tooltip
            key={w.id}
            content={w.name}
            placement={{ side: "right", align: "center" }}
          >
            <a
              className={styles.projectTile}
              data-id={sidebarId("project")}
              href={`#${teamHash(w.id)}`}
              aria-label={w.name}
              aria-current={active ? "page" : undefined}
              onClick={followLink(go, target)}
            >
              {Array.from(w.name.trim())[0] || "·"}
              {count > 0 && (
                <span
                  className={styles.tileCount}
                  aria-label={tn("inbox.badge", count)}
                >
                  {count}
                </span>
              )}
              {working && (
                <span
                  className={styles.tileWorking}
                  role="img"
                  aria-label={t("research.status.running")}
                />
              )}
            </a>
          </Tooltip>
        );
      })}
      <Tooltip
        content={t("workspace.add")}
        placement={{ side: "right", align: "center" }}
      >
        <button
          type="button"
          className={styles.projectTile}
          data-id={sidebarId("add-project")}
          data-add
          aria-label={t("workspace.add")}
          onClick={() => setCreating(true)}
        >
          <Plus size={18} aria-hidden />
        </button>
      </Tooltip>
      {creating && (
        <CreateWorkspaceDialog
          onClose={() => setCreating(false)}
          onCreated={(workspace) => {
            setCreating(false);
            go(teamHash(workspace.id));
          }}
        />
      )}
    </div>
  );
}
