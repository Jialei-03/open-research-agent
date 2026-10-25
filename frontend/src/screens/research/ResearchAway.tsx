import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n/i18n";
import { IconButton } from "../../ui";
import type { ProjectDetail, ResearchEvent } from "./research-api";
import type { ThreadItem } from "./talk/thread";
import styles from "./ResearchBoard.module.css";

/** Away for less than this, nothing is summed up. */
const AWAY_MS = 30 * 60_000;

interface Seen {
  at: string;
  tokens: number;
}

const key = (id: string) => `ora.research.seen.${id}`;

function read(id: string): Seen | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(id)) || "null");
    return value && typeof value.at === "string" ? value : null;
  } catch {
    return null;
  }
}

/** The visit before this one, per research: read once, so a remount keeps it. */
const previous = new Map<string, Seen | null>();
/** Summaries the researcher closed in this session. */
const dismissed = new Set<string>();

/**
 * The research as it was last seen: kept while the page is open, so the next
 * visit can say what happened in between.
 */
function useLastSeen(detail: ProjectDetail) {
  const id = detail.project.id;
  if (!previous.has(id)) previous.set(id, read(id));
  const tokens = detail.project.spent?.tokens || 0;
  useEffect(() => {
    const write = () =>
      localStorage.setItem(
        key(id),
        JSON.stringify({ at: new Date().toISOString(), tokens }),
      );
    write();
    const timer = window.setInterval(write, 60_000);
    return () => window.clearInterval(timer);
  }, [id, tokens]);
  return previous.get(id) ?? null;
}

/**
 * What happened while the researcher was away, from the record (no model):
 * rounds finished, hypotheses that changed, experiments that ended, what it
 * cost, what waits. Each line leads to where it happened.
 */
export function ResearchAway({
  detail,
  events,
  items,
  onDiscuss,
}: {
  detail: ProjectDetail;
  events: ResearchEvent[];
  items: ThreadItem[];
  onDiscuss(itemId: string): void;
}) {
  const { t } = useI18n();
  const before = useLastSeen(detail);
  const [closed, setClosed] = useState(() => dismissed.has(detail.project.id));
  if (closed || !before || Date.now() - Date.parse(before.at) < AWAY_MS)
    return null;
  const since = before.at;
  const after = (at?: string) => !!at && at > since;

  const rounds = detail.sprints.filter(
    (s) => s.status !== "running" && after(s.updated_at),
  );
  const firstRound = items.find(
    (i) => i.kind === "work" && rounds.some((s) => s.id === i.sprint.id),
  );
  const changes = events.filter(
    (e) =>
      e.action === "update_node" &&
      after(e.created_at) &&
      typeof (e.detail.after as Record<string, unknown> | undefined)?.status ===
        "string",
  );
  const lastChange = new Map<string, ResearchEvent>();
  for (const e of changes) if (e.node_id) lastChange.set(e.node_id, e);
  const jobs = detail.jobs.filter(
    (j) =>
      j.status !== "running" && j.status !== "queued" && after(j.finished_at),
  );
  const spent = Math.max(
    0,
    (detail.project.spent?.tokens || 0) - before.tokens,
  );
  const waiting = items.filter(
    (i) =>
      (i.kind === "decision" && i.open) || (i.kind === "plan" && i.current),
  );
  const nodes = new Map(detail.nodes.map((n) => [n.id, n]));
  const blockOf = (sprintId: string | null) =>
    items.find((i) => i.kind === "work" && i.sprint.id === sprintId)?.id;

  if (!rounds.length && !lastChange.size && !jobs.length && !waiting.length)
    return null;
  const compact = new Intl.NumberFormat(undefined, { notation: "compact" });
  return (
    <section className={styles.away} aria-label={t("research.away.title")}>
      <header>
        <h3>{t("research.away.title")}</h3>
        <IconButton
          size="sm"
          label={t("common.close")}
          icon={X}
          onClick={() => {
            dismissed.add(detail.project.id);
            setClosed(true);
          }}
        />
      </header>
      <ul>
        {!!rounds.length && (
          <li>
            <Line
              text={t("research.away.rounds", { n: rounds.length })}
              target={firstRound?.id}
              onDiscuss={onDiscuss}
            />
          </li>
        )}
        {[...lastChange.values()].map((e) => {
          const node = e.node_id ? nodes.get(e.node_id) : undefined;
          const status = String(
            (e.detail.after as Record<string, unknown>).status,
          );
          return (
            <li key={e.id}>
              <Line
                text={`${node?.title ?? ""} → ${t(`research.node.${status}` as MessageKey)}`}
                target={blockOf(e.sprint_id)}
                onDiscuss={onDiscuss}
              />
            </li>
          );
        })}
        {!!jobs.length && (
          <li>
            <Line
              text={t("research.away.jobs", { n: jobs.length })}
              target={blockOf(jobs.at(-1)!.sprint_id)}
              onDiscuss={onDiscuss}
            />
          </li>
        )}
        {!!spent && (
          <li>
            <Line
              text={t("research.away.spent", { tokens: compact.format(spent) })}
              onDiscuss={onDiscuss}
            />
          </li>
        )}
        {!!waiting.length && (
          <li>
            <Line
              text={t("research.away.waiting", { n: waiting.length })}
              target={waiting[0].id}
              onDiscuss={onDiscuss}
            />
          </li>
        )}
      </ul>
    </section>
  );
}

function Line({
  text,
  target,
  onDiscuss,
}: {
  text: string;
  target?: string;
  onDiscuss(itemId: string): void;
}) {
  return target ? (
    <button
      type="button"
      className={styles.link}
      onClick={() => onDiscuss(target)}
    >
      {text}
    </button>
  ) : (
    <span>{text}</span>
  );
}
