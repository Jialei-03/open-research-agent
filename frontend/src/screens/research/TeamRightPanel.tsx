import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FileCode,
  FileText,
  Folder,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { Button, IconButton, SegmentedControl, toast } from "../../ui";
import { MemberAvatar } from "../team/MemberEditor";
import { memberName } from "../team/member-model";
import {
  listTeamFiles,
  refreshTeam,
  readTeamFile,
  saveTeamFile,
  sendTeamMessage,
  teamFileHistory,
  type Team,
  type TeamFile,
  type TeamFileChange,
  type TeamFileEntry,
  type TeamMember,
  type TeamMessage,
} from "./team-api";
import { colleagueStatus } from "./TeamMemberCard";
import { MemberStatus } from "./TeamNavigation";
import { Prose } from "./talk/ThreadView";
import { Trail } from "./process/Process";
import { api } from "../../api";
import type { MessageKey } from "../../i18n/i18n";
import { threadDate } from "./team-model";
import styles from "./TeamRightPanel.module.css";

export type PanelTab = "duty" | "files" | "changes" | "watch";

/** Sent by a task card's "Watch": the right panel follows that run live. */
export const WATCH_EVENT = "team-watch";

/**
 * The right panel of a conversation, as coding tools keep theirs: who is on
 * duty, the project's files (browse and edit), and what this conversation
 * changed. Expanded, it becomes an editor beside a narrower conversation.
 */
export function TeamRightPanel({
  team,
  messages,
  tab,
  onTab,
  watching = "",
  path,
  onPath,
  expanded,
  onExpand,
  onClose,
  onMember,
  outputs,
  member,
}: {
  team: Team;
  messages: TeamMessage[];
  tab: PanelTab;
  onTab(tab: PanelTab): void;
  /** The message whose run "Watch" follows. */
  watching?: string;
  path: string;
  onPath(path: string): void;
  expanded: boolean;
  onExpand(expanded: boolean): void;
  onClose(): void;
  onMember(member: TeamMember): void;
  /** What this conversation produced: pins, deliverables, sources. */
  outputs: ReactNode;
  /** In a direct message: whose desk the first tab shows. */
  member?: TeamMember;
}) {
  const { t } = useI18n();
  return (
    <aside
      className={styles.panel}
      data-expanded={expanded || undefined}
      aria-label={t("team.sidePanel")}
      data-testid="team-side-panel"
    >
      <header className={styles.header}>
        <SegmentedControl
          kind="radio"
          label={t("team.sidePanel")}
          value={tab}
          onChange={(value) => onTab(value as PanelTab)}
          options={[
            { value: "duty", label: t(member ? "panel.desk" : "panel.duty") },
            { value: "files", label: t("panel.files") },
            { value: "changes", label: t("panel.changes") },
            ...(watching ? [{ value: "watch", label: t("team.watch") }] : []),
          ]}
        />
        <span className={styles.grow} />
        <IconButton
          size="sm"
          icon={expanded ? Minimize2 : Maximize2}
          label={t(expanded ? "panel.collapse" : "panel.expand")}
          onClick={() => onExpand(!expanded)}
        />
        <IconButton
          size="sm"
          icon={X}
          label={t("team.hidePanel")}
          onClick={onClose}
        />
      </header>
      <div className={styles.body}>
        {tab === "duty" &&
          (member ? (
            <Desk
              member={member}
              messages={messages}
              onPath={(path) => {
                onPath(path);
                onTab("files");
              }}
            />
          ) : (
            <Duty team={team} onMember={onMember} />
          ))}
        {tab === "files" && (
          <Files
            workspace={team.workspace_id}
            team={team}
            path={path}
            onPath={onPath}
            expanded={expanded}
            outputs={outputs}
          />
        )}
        {tab === "watch" && (
          <Watch
            team={team}
            message={messages.find((m) => m.id === watching)}
          />
        )}
        {tab === "changes" && (
          <Changes
            messages={messages}
            onOpen={(file) => {
              onPath(file);
              onTab("files");
            }}
          />
        )}
      </div>
    </aside>
  );
}

const ORDER = ["working", "queued", "waiting", "idle"] as const;

function Duty({
  team,
  onMember,
}: {
  team: Team;
  onMember(m: TeamMember): void;
}) {
  const { t, tn } = useI18n();
  const members = team.members.filter((m) => m.role !== "human" && !m.deleted);
  const group = (m: TeamMember) =>
    m.enabled === false || m.paused
      ? "paused"
      : m.status === "working" || m.status === "queued"
        ? "working"
        : m.status === "waiting"
          ? "waiting"
          : "idle";
  return (
    <div className={styles.duty}>
      {(["working", "waiting", "idle", "paused"] as const).map((key) => {
        const rows = members
          .filter((m) => group(m) === key)
          .sort(
            (a, b) =>
              ORDER.indexOf(a.status as (typeof ORDER)[number]) -
              ORDER.indexOf(b.status as (typeof ORDER)[number]),
          );
        if (!rows.length) return null;
        return (
          <section key={key} aria-label={t(`panel.duty.${key}`)}>
            <h3>
              {t(`panel.duty.${key}`)} · {rows.length}
            </h3>
            {rows.map((member) => (
              <button
                key={member.id}
                type="button"
                className={styles.desk}
                onClick={() => onMember(member)}
              >
                <span className={styles.avatar}>
                  <MemberAvatar member={member} />
                  <MemberStatus
                    status={member.status}
                    enabled={member.enabled}
                    paused={member.paused}
                  />
                </span>
                <span className={styles.deskText}>
                  <span className={styles.deskName}>
                    {memberName(member, t)}
                  </span>
                  <span className={styles.deskState} data-state={key}>
                    {colleagueStatus(member, { t, tn })}
                  </span>
                </span>
              </button>
            ))}
          </section>
        );
      })}
      {!!team.tokens && (
        <section aria-label={t("panel.spend")}>
          <h3>{t("panel.spend")}</h3>
          <p className={styles.spend}>
            {t("panel.tokens", {
              count: new Intl.NumberFormat().format(team.tokens),
            })}
          </p>
        </section>
      )}
    </div>
  );
}

function Files({
  workspace,
  team,
  path,
  onPath,
  expanded,
  outputs,
}: {
  workspace: string;
  team: Team;
  path: string;
  onPath(path: string): void;
  expanded: boolean;
  outputs: ReactNode;
}) {
  const tree = (
    <FileTree workspace={workspace} current={path} onOpen={onPath} />
  );
  if (!path)
    return (
      <div className={styles.files}>
        {outputs}
        {tree}
      </div>
    );
  return (
    <div className={styles.editorLayout}>
      {expanded && <div className={styles.treeColumn}>{tree}</div>}
      <FileEditor
        key={path}
        workspace={workspace}
        team={team}
        path={path}
        onClose={() => onPath("")}
      />
    </div>
  );
}

function FileTree({
  workspace,
  current,
  onOpen,
}: {
  workspace: string;
  current: string;
  onOpen(path: string): void;
}) {
  const { t } = useI18n();
  const [folders, setFolders] = useState<Record<string, TeamFileEntry[]>>({});
  const [open, setOpen] = useState<Set<string>>(() => new Set([""]));
  const [error, setError] = useState("");
  const load = useCallback(
    (folder: string) =>
      listTeamFiles(workspace, folder).then(
        (listing) =>
          setFolders((old) => ({ ...old, [folder]: listing.entries })),
        (reason: unknown) => setError(String(reason)),
      ),
    [workspace],
  );
  useEffect(() => {
    void load("");
  }, [load]);
  const toggle = (folder: string) => {
    setOpen((old) => {
      const next = new Set(old);
      if (next.has(folder)) next.delete(folder);
      else {
        next.add(folder);
        if (!folders[folder]) void load(folder);
      }
      return next;
    });
  };
  const rows = (folder: string, depth: number): ReactNode =>
    (folders[folder] || []).map((entry) => (
      <div key={entry.path}>
        <button
          type="button"
          className={styles.treeRow}
          style={{
            paddingLeft: `calc(var(--ui-space-8) + ${depth} * var(--ui-space-16))`,
          }}
          aria-current={entry.path === current ? "true" : undefined}
          aria-expanded={
            entry.type === "dir" ? open.has(entry.path) : undefined
          }
          onClick={() =>
            entry.type === "dir" ? toggle(entry.path) : onOpen(entry.path)
          }
        >
          {entry.type === "dir" ? (
            open.has(entry.path) ? (
              <ChevronDown size={14} aria-hidden />
            ) : (
              <ChevronRight size={14} aria-hidden />
            )
          ) : (
            <span className={styles.treeSpacer} />
          )}
          {entry.type === "dir" ? (
            <Folder size={14} aria-hidden />
          ) : /\.(md|txt)$/i.test(entry.name) ? (
            <FileText size={14} aria-hidden />
          ) : (
            <FileCode size={14} aria-hidden />
          )}
          <span className={styles.treeName}>{entry.name}</span>
        </button>
        {entry.type === "dir" &&
          open.has(entry.path) &&
          rows(entry.path, depth + 1)}
      </div>
    ));
  return (
    <section className={styles.tree} aria-label={t("panel.projectFiles")}>
      <h3>{t("panel.projectFiles")}</h3>
      {error && <p role="alert">{error}</p>}
      {rows("", 0)}
    </section>
  );
}

function FileEditor({
  workspace,
  team,
  path,
  onClose,
}: {
  workspace: string;
  team: Team;
  path: string;
  onClose(): void;
}) {
  const { t, locale } = useI18n();
  const [file, setFile] = useState<TeamFile | null>(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<TeamFileChange[]>([]);
  const area = useRef<HTMLTextAreaElement>(null);
  const reload = useCallback(() => {
    readTeamFile(workspace, path).then(
      (value) => {
        setFile(value);
        setText(value.content);
        setMode(value.kind === "markdown" ? "preview" : "edit");
      },
      (reason: unknown) => setError(String(reason)),
    );
    teamFileHistory(workspace, path).then(setHistory, () => setHistory([]));
  }, [workspace, path]);
  useEffect(reload, [reload]);
  const editable =
    !!file &&
    !file.truncated &&
    ["text", "markdown", "csv"].includes(file.kind);
  const dirty = !!file && text !== file.content;
  const save = async () => {
    if (!editable || !dirty || saving) return;
    setSaving(true);
    try {
      await saveTeamFile(workspace, path, text);
      setFile({ ...file!, content: text });
      teamFileHistory(workspace, path).then(setHistory, () => undefined);
    } catch (reason) {
      toast.show({ message: String(reason), tone: "error" });
    } finally {
      setSaving(false);
    }
  };
  const latest = history[0];
  const author =
    latest?.author === "researcher"
      ? t("panel.you")
      : latest?.member_id
        ? memberName(
            team.members.find((m) => m.id === latest.member_id) ||
              ({ name: latest.name || "" } as TeamMember),
            t,
          )
        : latest?.name || "";
  const lines = text.split("\n").length;
  return (
    <section className={styles.editor} aria-label={path}>
      <div className={styles.editorHead}>
        <span className={styles.editorPath} title={path}>
          {path}
          {dirty && (
            <span className={styles.dirty} aria-label={t("panel.unsaved")} />
          )}
        </span>
        {file?.kind === "markdown" && (
          <SegmentedControl
            kind="radio"
            label={t("panel.mode")}
            value={mode}
            onChange={(value) => setMode(value as "edit" | "preview")}
            options={[
              { value: "edit", label: t("panel.edit") },
              { value: "preview", label: t("panel.preview") },
            ]}
          />
        )}
        <IconButton
          size="sm"
          icon={X}
          label={t("common.close")}
          onClick={onClose}
        />
      </div>
      {error && <p role="alert">{error}</p>}
      {file && mode === "preview" && file.kind === "markdown" ? (
        <div className={styles.preview}>
          <Prose text={text} />
        </div>
      ) : file && editable ? (
        <div className={styles.code}>
          <div className={styles.gutter} aria-hidden="true">
            {Array.from({ length: lines }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <textarea
            ref={area}
            className={styles.source}
            value={text}
            spellCheck={false}
            aria-label={path}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "s") {
                event.preventDefault();
                void save();
              }
              if (event.key === "Tab" && !event.shiftKey) {
                event.preventDefault();
                const el = event.currentTarget;
                const at = el.selectionStart;
                setText(text.slice(0, at) + "  " + text.slice(el.selectionEnd));
                requestAnimationFrame(() =>
                  el.setSelectionRange(at + 2, at + 2),
                );
              }
            }}
          />
        </div>
      ) : file ? (
        <p className={styles.unsupported}>{t("panel.notText")}</p>
      ) : (
        !error && <div className={styles.loading} aria-busy="true" />
      )}
      <footer className={styles.editorFoot}>
        {latest && (
          <span className={styles.origin}>
            {t("panel.changedBy", {
              name: author,
              when: threadDate(latest.at, locale, new Date(), "relative"),
              added: latest.added,
              removed: latest.removed,
            })}
          </span>
        )}
        <span className={styles.grow} />
        {editable && (
          <Button
            size="sm"
            variant={dirty ? "primary" : "secondary"}
            loading={saving}
            onClick={() => void save()}
          >
            {t("panel.save")}
          </Button>
        )}
      </footer>
    </section>
  );
}

function Changes({
  messages,
  onOpen,
}: {
  messages: TeamMessage[];
  onOpen(path: string): void;
}) {
  const { t } = useI18n();
  const files = new Map<string, { added: number; removed: number }>();
  for (const message of messages)
    for (const change of message.data.changes?.files || []) {
      const old = files.get(change.path) || { added: 0, removed: 0 };
      files.set(change.path, {
        added: old.added + change.added,
        removed: old.removed + change.removed,
      });
    }
  if (!files.size)
    return <p className={styles.unsupported}>{t("panel.noChanges")}</p>;
  return (
    <ul className={styles.changes}>
      {[...files].map(([path, change]) => (
        <li key={path}>
          <button
            type="button"
            className={styles.changeRow}
            onClick={() => onOpen(path)}
          >
            <FileCode size={14} aria-hidden />
            <span className={styles.treeName}>{path}</span>
            <span className={styles.added}>+{change.added}</span>
            <span className={styles.removed}>−{change.removed}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Over a colleague's shoulder: the live steps of one run, its answer as it comes, and a way to stop it. */
function Watch({ team, message }: { team: Team; message?: TeamMessage }) {
  const { t } = useI18n();
  const run = message?.run;
  if (!message || !run)
    return <p className={styles.unsupported}>{t("panel.watchGone")}</p>;
  const member = team.members.find((m) => m.id === message.author_id);
  const live = run.status === "running" || run.status === "queued";
  return (
    <div className={styles.watch}>
      <div className={styles.watchHead}>
        {member && <MemberAvatar member={member} size="sm" />}
        <span className={styles.deskName}>
          {member ? memberName(member, t) : ""}
        </span>
        <span
          className={styles.deskState}
          data-state={live ? "working" : "idle"}
        >
          {t(`team.task.${run.status}` as MessageKey) || run.status}
        </span>
        <span className={styles.grow} />
        {live && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void api(`/agent/runs/${encodeURIComponent(run.id)}/cancel`, {
                method: "POST",
              })
                .then(refreshTeam)
                .catch((e: unknown) =>
                  toast.show({ message: String(e), tone: "error" }),
                )
            }
          >
            {t("research.stop")}
          </Button>
        )}
      </div>
      <Trail steps={run.steps} live={live} />
      {(run.response || message.text) && (
        <div className={styles.watchAnswer}>
          <Prose text={run.response || message.text} />
        </div>
      )}
      {live && member && (
        <ChimeIn team={team} message={message} member={member} />
      )}
    </div>
  );
}

/** A word to a colleague while they work: it lands where the work is, and they take it in now. */
function ChimeIn({
  team,
  message,
  member,
}: {
  team: Team;
  message: TeamMessage;
  member: TeamMember;
}) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const direct = team.channels.find(
    (c) => c.id === message.channel_id,
  )?.member_id;
  const submit = async () => {
    const said = text.trim();
    if (!said || sending) return;
    setSending(true);
    try {
      await sendTeamMessage(team.workspace_id, message.channel_id, {
        text: direct ? said : `@${member.name || member.role} ${said}`,
        ...(message.thread_id ? { thread_id: message.thread_id } : {}),
        mode: "immediate",
        client_id: crypto.randomUUID(),
      });
      setText("");
      refreshTeam();
    } catch (reason) {
      toast.show({ message: String(reason), tone: "error" });
    } finally {
      setSending(false);
    }
  };
  return (
    <form
      className={styles.chime}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("panel.chimeIn", { name: memberName(member, t) })}
        aria-label={t("panel.chimeIn", { name: memberName(member, t) })}
        disabled={sending}
      />
      <IconButton
        type="submit"
        size="sm"
        icon={ArrowUp}
        label={t("reader.assistant.send")}
        disabled={!text.trim() || sending}
      />
    </form>
  );
}

/** A colleague's desk, in their direct message: what they do now, what they were given, what they made. */
function Desk({
  member,
  messages,
  onPath,
}: {
  member: TeamMember;
  messages: TeamMessage[];
  onPath(path: string): void;
}) {
  const { t, tn, locale } = useI18n();
  const tasks = messages
    .filter((m) => m.author_id === member.id && m.run)
    .slice(-8)
    .reverse();
  const live = tasks.find(
    (m) => m.run!.status === "running" || m.run!.status === "queued",
  );
  const files = [
    ...new Map(
      tasks.flatMap((m) => m.data.files || []).map((file) => [file.path, file]),
    ).values(),
  ].slice(0, 6);
  return (
    <div className={styles.duty}>
      <div className={styles.watchHead}>
        <span className={styles.avatar}>
          <MemberAvatar member={member} />
          <MemberStatus
            status={member.status}
            enabled={member.enabled}
            paused={member.paused}
          />
        </span>
        <span className={styles.deskText}>
          <span className={styles.deskName}>{memberName(member, t)}</span>
          <span
            className={styles.deskState}
            data-state={live ? "working" : "idle"}
          >
            {colleagueStatus(member, { t, tn })}
          </span>
        </span>
      </div>
      {live && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent(WATCH_EVENT, { detail: live.id }),
            )
          }
        >
          {t("team.watch")}
        </Button>
      )}
      {!!tasks.length && (
        <section aria-label={t("panel.tasks")}>
          <h3>{t("panel.tasks")}</h3>
          {tasks.map((task) => (
            <div key={task.id} className={styles.taskRow}>
              <span className={styles.taskChip} data-state={task.run!.status}>
                {t(`team.task.${task.run!.status}` as MessageKey) ||
                  task.run!.status}
              </span>
              <span className={styles.treeName}>
                {(task.preview || task.text || "").split("\n")[0] ||
                  t("team.noContent")}
              </span>
              <time className={styles.taskWhen}>
                {threadDate(task.created_at, locale, new Date(), "relative")}
              </time>
            </div>
          ))}
        </section>
      )}
      {!!files.length && (
        <section aria-label={t("panel.recentFiles")}>
          <h3>{t("panel.recentFiles")}</h3>
          {files.map((file) => (
            <button
              key={file.path}
              type="button"
              className={styles.treeRow}
              onClick={() => onPath(file.path)}
            >
              <FileText size={14} aria-hidden />
              <span className={styles.treeName}>{file.name}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
