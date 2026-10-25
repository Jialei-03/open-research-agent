import { UserPlus } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
import { followLink } from "../../reader/route";
import { SidebarItem } from "../../ui";
import { sidebarId } from "../../app/sidebar-entries";
import { useResearchNavigation } from "../research/ResearchNavigation";
import { useWorkspaceTeams } from "../research/workspace-teams";
import { colleagueKey } from "./colleagues-api";
import { MemberAvatar } from "./MemberEditor";
import { memberName } from "./member-model";

/** The colleagues section's list: hire, then everyone, working ones marked. */
export function ColleagueNavigation({
  selected,
  go,
}: {
  selected?: string;
  go(hash: string): void;
}) {
  const { t } = useI18n();
  const { data } = useResearchNavigation();
  const personal = data.workspaces.find((w) => w.kind === "personal");
  const teams = useWorkspaceTeams(
    data.workspaces.filter((w) => !w.archived).map((w) => w.id),
  );
  const team = personal ? teams.get(personal.id) : undefined;
  // Someone is working if they work in any project.
  const busy = new Set(
    [...teams.values()].flatMap((other) =>
      other.members
        .filter((m) => m.status === "working" || m.status === "queued")
        .map((m) => colleagueKey(m)),
    ),
  );
  return (
    <>
      <SidebarItem
        data-id={sidebarId("hire")}
        icon={UserPlus}
        label={t("members.hire")}
        href="#colleagues?hire=1"
        onClick={followLink(go, "colleagues?hire=1")}
      />
      {team?.members
        .filter((m) => !m.deleted && m.role !== "human")
        .map((m) => {
          const key = colleagueKey(m);
          const path = `colleagues/${encodeURIComponent(key)}`;
          return (
            <SidebarItem
              key={m.id}
              data-id={sidebarId("colleague")}
              icon={UserPlus}
              iconContent={<MemberAvatar member={m} size="sm" />}
              label={memberName(m, t)}
              meta={busy.has(key) ? t("team.status.working") : undefined}
              href={`#${path}`}
              active={selected === key}
              onClick={followLink(go, path)}
            />
          );
        })}
    </>
  );
}
