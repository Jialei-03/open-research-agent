import { MemberAvatar } from "../team/MemberEditor";
import { TeamMemberCard, colleagueStatus } from "./TeamMemberCard";
import { followLink } from "../../reader/route";
import { memberName } from "../team/member-model";
import {
  Bell,
  Columns3,
  Flag,
  FolderPlus,
  LayoutGrid,
  MoreHorizontal,
  Sparkle,
  User,
  Hash,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import { useCallback, useContext, useEffect, useState } from "react";
import { parseAppRoute } from "../../app/routes";
import { useI18n } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n/i18n";
import {
  Button,
  Dialog,
  IconButton,
  Menu,
  SidebarItem,
  SidebarSection,
  TextField,
} from "../../ui";
import {
  createChannel,
  getTeam,
  refreshTeam,
  settingsHash,
  TEAM_EVENT,
  teamHash,
  type Team,
  type TeamMember,
} from "./team-api";
import { useResearchNavigation } from "./ResearchNavigation";
import { needsYou } from "./navigation-attention";
import { useWorkspaceTeams } from "./workspace-teams";
import { AppActions } from "../../app/AppSidebar";
import { sidebarId } from "../../app/sidebar-entries";
import {
  MESSAGE_FIRST,
  pageRows,
  sidebarPageKey,
  SidebarPagination,
  useSidebarPage,
} from "../../app/sidebar-pagination";
import { CreateWorkspaceDialog, WorkspacePicker } from "./WorkspaceDialogs";
import { SidebarResearches } from "./SidebarResearches";
import styles from "./Team.module.css";
import { defaultChannelNames, threadDate } from "./team-model";
import nav from "./TeamNavigation.module.css";

export function useTeam(id: string) {
  const [team, setTeam] = useState<Team | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    setTeam(null);
  }, [id]);
  useEffect(() => {
    if (!id) return;
    let stale = false;
    getTeam(id).then(
      (value) => {
        if (!stale) {
          setTeam(value);
          setError("");
        }
      },
      (reason: unknown) => {
        if (!stale) setError(String(reason));
      },
    );
    return () => {
      stale = true;
    };
  }, [id, revision]);
  useEffect(() => {
    const timer = window.setInterval(reload, 1000);
    window.addEventListener(TEAM_EVENT, reload);
    return () => {
      clearInterval(timer);
      window.removeEventListener(TEAM_EVENT, reload);
    };
  }, [reload]);
  return { team, error, reload };
}

export function useTeamWorkspace(hash: string) {
  const { data } = useResearchNavigation();
  const route = parseAppRoute(hash);
  if (route.screen === "team") return route.workspaceId;
  if (route.screen === "inbox" && route.workspaceId) return route.workspaceId;
  if (route.screen === "research")
    return (
      data.workspaces.find((w) =>
        w.researches.some((r) => r.id === route.projectId),
      )?.id || ""
    );
  if (
    (route.screen === "new-research" ||
      route.screen === "workspaces" ||
      route.screen === "projects") &&
    route.workspaceId
  )
    return route.workspaceId;
  return data.workspaces.find((w) => !w.archived)?.id || "";
}

/** The project's name at the top of its sidebar, with what belongs to the whole project behind "⋯". */
export function ProjectHeader({
  hash,
  go,
}: {
  hash: string;
  go(hash: string): void;
}) {
  const { t } = useI18n();
  const id = useTeamWorkspace(hash);
  const { data } = useResearchNavigation();
  const workspace = data.workspaces.find((w) => w.id === id);
  const all = parseAppRoute(hash).screen === "all-projects";
  return (
    <div className={styles.switcher}>
      <h2 className={nav.projectName} data-id={sidebarId("workspace")}>
        {all ? t("projects.all") : workspace?.name || t("workspace.choose")}
      </h2>
      {id && !all && (
        <Menu
          label={t("research.actions")}
          trigger={(props) => (
            <IconButton
              {...props}
              data-id={sidebarId("project-menu")}
              icon={MoreHorizontal}
              label={t("research.actions")}
            />
          )}
          items={[
            {
              id: "members",
              icon: Users,
              label: t("team.members"),
              onSelect: () => go(settingsHash(id, "members")),
            },
            {
              id: "settings",
              icon: Settings,
              label: t("team.settings"),
              onSelect: () => go(settingsHash(id, "workflow")),
            },
            {
              id: "activity",
              icon: Bell,
              label: t("team.activity"),
              onSelect: () => go(teamHash(id, "mentions")),
            },
            {
              id: "all",
              icon: LayoutGrid,
              label: t("projects.all"),
              onSelect: () => go("all"),
            },
          ]}
        />
      )}
    </div>
  );
}

export function MemberStatus({
  status,
  enabled,
  paused,
}: Pick<TeamMember, "status" | "enabled" | "paused">) {
  const { t } = useI18n();
  const state = enabled === false ? "disabled" : paused ? "paused" : status;
  return (
    <span
      className={styles.status}
      data-status={state}
      role="img"
      aria-label={t(
        state === "disabled" ? "members.disabled" : `team.status.${state}`,
      )}
    />
  );
}

export function TeamNavigation({
  hash,
  go,
}: {
  hash: string;
  go(hash: string): void;
}) {
  const { t } = useI18n();
  const id = useTeamWorkspace(hash);
  const { team, error, reload } = useTeam(id);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const { ready } = useResearchNavigation();
  if (parseAppRoute(hash).screen === "all-projects")
    return <AllConversations go={go} />;
  // Nothing to list before there is a project: one way forward, nothing that leads nowhere.
  if (!id)
    return ready ? (
      <div className={nav.empty} data-sidebar-place="empty">
        <FolderPlus size={24} aria-hidden="true" />
        <span>{t("sidebar.noProject")}</span>
        <Button
          size="sm"
          variant="secondary"
          data-id={sidebarId("create-project")}
          onClick={() => setCreatingProject(true)}
        >
          {t("workspace.add")}
        </Button>
        {creatingProject && (
          <CreateWorkspaceDialog
            onClose={() => setCreatingProject(false)}
            onCreated={(workspace) => {
              setCreatingProject(false);
              go(teamHash(workspace.id));
            }}
          />
        )}
      </div>
    ) : null;
  return (
    <>
      <TeamConversationList
        team={team}
        id={id}
        hash={hash}
        go={go}
        onCreate={() => {
          setCreating(true);
          setName("");
          setFailure("");
        }}
      />
      {error && (
        <Button variant="ghost" onClick={reload}>
          {t("common.retry")}
        </Button>
      )}
      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title={t("team.addChannel")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              loading={saving}
              disabled={!name.trim()}
              onClick={async () => {
                setSaving(true);
                try {
                  await createChannel(id, name);
                  setCreating(false);
                  refreshTeam();
                } catch (e) {
                  setFailure(String(e));
                } finally {
                  setSaving(false);
                }
              }}
            >
              {t("projects.save")}
            </Button>
          </>
        }
      >
        <TextField
          label={t("team.channelName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {failure && <p role="alert">{failure}</p>}
      </Dialog>
    </>
  );
}

function UnreadBadge({ count }: { count: number }) {
  const { t } = useI18n();
  return count > 0 ? (
    <span className={nav.badge} aria-label={t("team.unreadCount", { count })}>
      {count}
    </span>
  ) : null;
}

export function TeamConversationList({
  team,
  id,
  hash,
  go,
  onCreate,
}: {
  team: Team | null;
  id: string;
  hash: string;
  go(hash: string): void;
  onCreate(): void;
}) {
  const { t, tn, locale } = useI18n();
  const { owner = "" } = useContext(AppActions);
  const [groupLimit, chooseGroups] = useSidebarPage(
    sidebarPageKey(owner, id, "groups"),
    MESSAGE_FIRST,
  );
  const [dmLimit, chooseDms] = useSidebarPage(
    sidebarPageKey(owner, id, "dms"),
    MESSAGE_FIRST,
  );
  const { data } = useResearchNavigation();
  const waiting = needsYou(
    data,
    (team?.notifications || []).map((m) => ({ ...m, workspace_id: id })),
  ).filter((item) => item.workspaceId === id).length;
  const route = parseAppRoute(hash);
  const members = new Map(team?.members.map((member) => [member.id, member]));
  const channels = (team?.channels || [])
    .filter(
      (channel) =>
        !channel.member_id ||
        (members.has(channel.member_id) &&
          !members.get(channel.member_id)!.deleted),
    )
    .sort(
      (a, b) =>
        (Date.parse(b.last_at ?? "") || 0) -
          (Date.parse(a.last_at ?? "") || 0) || a.id.localeCompare(b.id),
    );
  const selectedChannel =
    route.screen === "team"
      ? team?.channels.find(
          (channel) =>
            channel.id === route.channelId ||
            channel.key === (route.channelId || "experiments"),
        )
      : undefined;
  const current = (channel: string) =>
    route.screen === "team" &&
    (route.channelId === channel || selectedChannel?.id === channel);
  // The settings page's tab: members have their own entry, the rest is "team settings".
  const settingsTab =
    route.screen === "team" && route.channelId === "settings"
      ? (route.threadId || "members").startsWith("member")
        ? "members"
        : route.threadId
      : undefined;
  const keep = (channel: (typeof channels)[number]) =>
    current(channel.id) ||
    !!channel.working_member_ids?.length ||
    channel.unread > 0;
  const groupRows = pageRows(
    channels.filter((channel) => !channel.member_id),
    groupLimit,
    keep,
  );
  const dmRows = pageRows(
    channels.filter((channel) => !!channel.member_id),
    dmLimit,
    keep,
  );
  const avatar = (member: TeamMember) => (
    <span className={nav.memberAvatar}>
      <MemberAvatar member={member} />
      <MemberStatus
        status={member.status}
        enabled={member.enabled}
        paused={member.paused}
      />
    </span>
  );
  const row = (channel: (typeof channels)[number]) => {
    const member = channel.member_id
      ? members.get(channel.member_id)
      : undefined;
    const name = member
      ? memberName(member, t)
      : defaultChannelNames[channel.key] === channel.name
        ? t(`team.channel.${channel.key}` as MessageKey)
        : channel.name;
    // Empty messages (a run that said nothing) leave no preview.
    const last = channel.last_message?.text?.trim()
      ? channel.last_message
      : undefined;
    const author = last?.author_id ? members.get(last.author_id) : undefined;
    const authorName = author ? memberName(author, t) : last?.author_name;
    const activeMember =
      member && ["working", "queued"].includes(member.status)
        ? member
        : channel.working_member_ids
            ?.map((id) => members.get(id))
            .find(
              (item) => item && ["working", "queued"].includes(item.status),
            );
    // A run can be active while the member reads "waiting" or "idle"; the preview still says it is working.
    const working = !!activeMember || !!channel.working_member_ids?.length;
    const target = teamHash(id, channel.id);
    return (
      <div key={channel.id} className={nav.conversationRow}>
        <a
          className={nav.conversation}
          data-id={sidebarId(member ? "dm" : "conversation")}
          href={`#${target}`}
          aria-label={name}
          aria-current={current(channel.id) ? "page" : undefined}
          onClick={followLink(go, target)}
        >
          {member ? (
            <span className={nav.memberAvatar} aria-hidden />
          ) : (
            <span className={nav.channelAvatar}>
              <Hash size={16} aria-hidden="true" />
            </span>
          )}
          <span className={nav.content}>
            <span className={nav.line}>
              <span className={nav.name}>{name}</span>
              {channel.last_at && (
                <time dateTime={channel.last_at}>
                  {threadDate(
                    channel.last_at,
                    locale,
                    new Date(),
                    "conversation",
                  )}
                </time>
              )}
            </span>
            <span className={nav.line}>
              <span className={nav.preview} data-working={working || undefined}>
                {member?.paused
                  ? t("team.status.paused")
                  : activeMember
                    ? colleagueStatus(activeMember, { t, tn })
                    : working
                      ? t("team.workingPreview")
                      : last
                        ? authorName
                          ? t("team.preview", {
                              author: authorName,
                              text: last.text,
                            })
                          : last.text
                        : ""}
              </span>
              <UnreadBadge count={channel.unread} />
            </span>
          </span>
        </a>
        {member && team && (
          <TeamMemberCard
            team={team}
            member={member}
            className={nav.profileTrigger}
          >
            {avatar(member)}
          </TeamMemberCard>
        )}
      </div>
    );
  };
  return (
    <div className={nav.navigation}>
      <SidebarSection>
        <div className={nav.shortcut}>
          <SidebarItem
            data-id={sidebarId("inbox")}
            icon={Flag}
            label={t("inbox.title")}
            href={`#inbox?workspace=${id}`}
            active={route.screen === "inbox"}
            onClick={followLink(go, `inbox?workspace=${id}`)}
          />
          {waiting > 0 && (
            <span
              className={nav.waitingCount}
              aria-label={t("team.unreadCount", { count: waiting })}
            >
              {waiting}
            </span>
          )}
        </div>
        <SidebarItem
          data-id={sidebarId("board")}
          icon={Columns3}
          label={t("board.title")}
          href={`#${teamHash(id, "work")}`}
          active={current("work")}
          onClick={followLink(go, teamHash(id, "work"))}
        />
      </SidebarSection>
      <SidebarResearches workspaceId={id} hash={hash} go={go} />
      <div className={nav.heading} data-sidebar-place="groups">
        <span id="team-groups">{t("sidebar.groups")}</span>
        <IconButton
          data-id={sidebarId("create-channel")}
          icon={Plus}
          label={t("team.addChannel")}
          onClick={onCreate}
        />
      </div>
      <div
        className={nav.conversations}
        data-sidebar-place="groups"
        data-id={sidebarId("groups")}
        role="group"
        aria-labelledby="team-groups"
      >
        {groupRows.rows.map(row)}
        <SidebarPagination
          list="groups"
          first={MESSAGE_FIRST}
          limit={groupLimit}
          hidden={groupRows.hidden}
          choose={chooseGroups}
        />
      </div>
      <div className={nav.heading} data-sidebar-place="dms">
        <span id="team-dms">{t("sidebar.dms")}</span>
        <IconButton
          data-id={sidebarId("add-member")}
          icon={Plus}
          label={t("members.add")}
          onClick={() => go(settingsHash(id, "members"))}
        />
      </div>
      <div
        className={nav.conversations}
        data-sidebar-place="dms"
        data-id={sidebarId("dms")}
        role="group"
        aria-labelledby="team-dms"
      >
        {dmRows.rows.map(row)}
        <SidebarPagination
          list="dms"
          first={MESSAGE_FIRST}
          limit={dmLimit}
          hidden={dmRows.hidden}
          choose={chooseDms}
        />
      </div>
    </div>
  );
}

/** In "All projects": each project's latest conversations, newest first, under its name. */
function AllConversations({ go }: { go(hash: string): void }) {
  const { t, locale } = useI18n();
  const { data } = useResearchNavigation();
  const open = data.workspaces.filter((w) => !w.archived);
  const teams = useWorkspaceTeams(open.map((w) => w.id));
  return (
    <div className={nav.navigation} data-sidebar-place="all">
      {open.map((w) => {
        const team = teams.get(w.id);
        const members = new Map(team?.members.map((m) => [m.id, m]));
        const rows = [
          ...w.researches
            .filter((r) => !r.archived_at)
            .map((r) => ({
              key: `r:${r.id}`,
              at: r.updated_at,
              name: r.title || r.question,
              hash: `research/${r.id}`,
              mark: "research" as const,
            })),
          ...(team?.channels || []).map((c) => {
            const member = c.member_id ? members.get(c.member_id) : undefined;
            return {
              key: `c:${c.id}`,
              at: c.last_at || "",
              name: member
                ? memberName(member, t)
                : defaultChannelNames[c.key] === c.name
                  ? t(`team.channel.${c.key}` as MessageKey)
                  : c.name,
              hash: teamHash(w.id, c.id),
              mark: member ? ("dm" as const) : ("group" as const),
            };
          }),
        ]
          .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
          .slice(0, 4);
        return (
          <section key={w.id} aria-label={w.name}>
            <a
              className={nav.heading}
              href={`#${teamHash(w.id)}`}
              onClick={followLink(go, teamHash(w.id))}
            >
              <span>{w.name}</span>
            </a>
            <div className={nav.conversations}>
              {rows.map((row) => (
                <a
                  key={row.key}
                  className={nav.allRow}
                  href={`#${row.hash}`}
                  onClick={followLink(go, row.hash)}
                >
                  {row.mark === "group" ? (
                    <Hash size={14} aria-hidden="true" />
                  ) : row.mark === "research" ? (
                    <Sparkle size={14} aria-hidden="true" />
                  ) : (
                    <User size={14} aria-hidden="true" />
                  )}
                  <span className={nav.name}>{row.name}</span>
                  {row.at && (
                    <time dateTime={row.at}>
                      {threadDate(row.at, locale, new Date(), "conversation")}
                    </time>
                  )}
                </a>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
