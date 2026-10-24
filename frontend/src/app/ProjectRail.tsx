import { LayoutGrid, Plus } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { followLink } from "../reader/route";
import { Tooltip } from "../ui";
import { needsYou } from "../screens/research/navigation-attention";
import { useResearchNavigation } from "../screens/research/ResearchNavigation";
import { teamHash } from "../screens/research/team-api";
import { useTeamWorkspace } from "../screens/research/TeamNavigation";
import { CreateWorkspaceDialog } from "../screens/research/WorkspaceDialogs";
import { useWorkspaceTeams } from "../screens/research/workspace-teams";
import { sidebarId } from "./sidebar-entries";
import styles from "./AppSidebar.module.css";

/** A hue from the project's id: the same project keeps its colour on every machine. */
function hue(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/**
 * The projects as Slack shows workspaces: a tile each, a dot while a colleague
 * works in it, a count of what waits on the researcher; "All" above them and a
 * new project below.
 */
export function ProjectRail({
  hash,
  section,
  go,
}: {
  hash: string;
  section: string;
  go(hash: string): void;
}) {
  const { t } = useI18n();
  const { data } = useResearchNavigation();
  const current = useTeamWorkspace(hash);
  const [creating, setCreating] = useState(false);
  const open = data.workspaces.filter((w) => !w.archived);
  const teams = useWorkspaceTeams(open.map((w) => w.id));
  const messages = [...teams].flatMap(([id, team]) =>
    team.notifications.map((m) => ({ ...m, workspace_id: id })),
  );
  const waiting = needsYou(data, messages);
  const all = section === "research" && hash.startsWith("projects");
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
          href="#projects"
          aria-label={t("projects.all")}
          aria-current={all ? "page" : undefined}
          onClick={followLink(go, "projects")}
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
        return (
          <Tooltip
            key={w.id}
            content={w.name}
            placement={{ side: "right", align: "center" }}
          >
            <a
              className={styles.projectTile}
              data-id={sidebarId("project")}
              style={{ "--tile": `hsl(${hue(w.id)} 55% 48%)` } as CSSProperties}
              href={`#${teamHash(w.id)}`}
              aria-label={w.name}
              aria-current={active ? "page" : undefined}
              onClick={followLink(go, teamHash(w.id))}
            >
              {Array.from(w.name.trim())[0] || "·"}
              {count > 0 && (
                <span
                  className={styles.tileCount}
                  aria-label={t("team.unreadCount", { count })}
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
