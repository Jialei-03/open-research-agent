import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { followLink } from "../../reader/route";
import { SegmentedControl } from "../../ui";
import { MemberAvatar } from "../team/MemberEditor";
import { memberName } from "../team/member-model";
import { colleagueTask } from "./TeamMemberCard";
import { shortDuration } from "./process/model";
import { TEAM_EVENT, teamHash, type Team } from "./team-api";
import {
  getTeamWork,
  type AttentionMetrics,
  type TeamWork,
  type WorkItem,
} from "./team-work-api";
import styles from "./TeamWork.module.css";

export function AttentionLine({ value }: { value: AttentionMetrics }) {
  const { t, tn, locale } = useI18n();
  return (
    <div className={styles.attention} aria-label={t("team.work.attention")}>
      <span>{tn("team.work.asks", value.asks)}</span>
      <span>
        {t("team.work.median", {
          value:
            value.median_wait_seconds === null
              ? "—"
              : shortDuration(value.median_wait_seconds, t),
        })}
      </span>
      <span>
        {t("team.work.share", {
          value:
            value.waiting_share === null
              ? "—"
              : new Intl.NumberFormat(locale, {
                  style: "percent",
                  maximumFractionDigits: 1,
                }).format(value.waiting_share),
        })}
      </span>
      {value.partial && <span>{t("team.work.partial")}</span>}
    </div>
  );
}

type Lane = { key: string; label: string; items: WorkItem[] };

/** The project's board: every piece of work as a card, in columns by state or by colleague. */
export function TeamWorkView({
  team,
  work,
  go,
}: {
  team: Team;
  work: TeamWork;
  go(hash: string): void;
}) {
  const { t, tn } = useI18n();
  const [view, setView] = useState<"state" | "member" | "research">("state");
  const members = new Map(team.members.map((m) => [m.id, m]));
  const items =
    view === "research"
      ? work.items.filter((item) => item.research_id)
      : work.items;
  // Review is work under way, by a reviewer; the board keeps four columns.
  const column = (item: WorkItem) =>
    item.group === "review" ? "working" : item.group;
  const lanes: Lane[] =
    view === "member"
      ? team.members
          .filter((m) => m.role !== "human" && !m.deleted)
          .map((m) => ({
            key: m.id,
            label: memberName(m, t),
            items: items.filter((item) => item.member_ids.includes(m.id)),
          }))
      : (["queued", "working", "waiting", "done"] as const).map((key) => ({
          key,
          label: t(`board.lane.${key}`),
          items: items.filter((item) => column(item) === key),
        }));
  const card = (item: WorkItem) => {
    const status =
      item.status === "working"
        ? colleagueTask(item.current_step, t)
        : t(`team.work.${item.status}`);
    const target = teamHash(
      team.workspace_id,
      item.channel_id,
      item.thread_id || "",
    );
    return (
      <li key={item.id}>
        <a
          className={styles.card}
          data-group={item.group}
          data-stuck={item.stuck.length ? true : undefined}
          href={`#${target}`}
          onClick={followLink(go, target)}
        >
          <span className={styles.title}>{item.title}</span>
          <span className={styles.meta}>
            <span className={styles.avatars}>
              {item.member_ids.slice(0, 3).map((id) => {
                const assignee = members.get(id);
                return assignee ? (
                  <span key={id} title={memberName(assignee, t)}>
                    <MemberAvatar member={assignee} size="sm" />
                  </span>
                ) : null;
              })}
            </span>
            <span className={styles.status}>{status}</span>
            {!!item.stuck.length && (
              <span className={styles.stuck}>{t("team.work.stuck")}</span>
            )}
            <span className={styles.elapsed}>
              {shortDuration(item.elapsed_seconds, t)}
            </span>
          </span>
        </a>
      </li>
    );
  };
  return (
    <div className={styles.page} data-testid="team-work">
      <div className={styles.toolbar}>
        <h2>
          {work.counts.waiting
            ? tn("team.work.headline", work.counts.waiting)
            : t("team.work.clear")}
        </h2>
        <span className={styles.grow} />
        <SegmentedControl
          kind="radio"
          label={t("board.title")}
          value={view}
          onChange={(value) => setView(value as typeof view)}
          options={[
            { value: "state", label: t("board.byState") },
            { value: "member", label: t("board.byMember") },
            { value: "research", label: t("board.research") },
          ]}
        />
      </div>
      <div className={styles.lanes}>
        {lanes.map((lane) => (
          <section
            key={lane.key}
            className={styles.lane}
            aria-label={lane.label}
          >
            <h3>
              {lane.label}
              <span>{lane.items.length}</span>
            </h3>
            <ul>{lane.items.map(card)}</ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export function TeamWorkScreen({
  team,
  go,
}: {
  team: Team;
  go(hash: string): void;
}) {
  const [work, setWork] = useState<TeamWork | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let stale = false;
    let request = 0;
    setWork(null);
    setError("");
    const load = () => {
      const current = ++request;
      getTeamWork(team.workspace_id).then(
        (value) => {
          if (!stale && current === request) {
            setWork(value);
            setError("");
          }
        },
        (reason: unknown) => {
          if (!stale && current === request) setError(String(reason));
        },
      );
    };
    load();
    const timer = window.setInterval(load, 5000);
    window.addEventListener(TEAM_EVENT, load);
    return () => {
      stale = true;
      window.clearInterval(timer);
      window.removeEventListener(TEAM_EVENT, load);
    };
  }, [team.workspace_id]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {work ? (
        <TeamWorkView team={team} work={work} go={go} />
      ) : (
        <div className={styles.loading} aria-busy="true" />
      )}
    </>
  );
}
