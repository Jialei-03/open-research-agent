import {
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
  readTeamFile,
  saveTeamFile,
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
import { threadDate } from "./team-model";
import styles from "./TeamRightPanel.module.css";

export type PanelTab = "duty" | "files" | "changes";

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
  path,
  onPath,
  expanded,
  onExpand,
  onClose,
  onMember,
  outputs,
}: {
  team: Team;
  messages: TeamMessage[];
  tab: PanelTab;
  onTab(tab: PanelTab): void;
  path: string;
  onPath(path: string): void;
  expanded: boolean;
  onExpand(expanded: boolean): void;
  onClose(): void;
  onMember(member: TeamMember): void;
  /** What this conversation produced: pins, deliverables, sources. */
  outputs: ReactNode;
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
            { value: "duty", label: t("panel.duty") },
            { value: "files", label: t("panel.files") },
            { value: "changes", label: t("panel.changes") },
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
        {tab === "duty" && <Duty team={team} onMember={onMember} />}
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
