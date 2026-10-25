import { Check } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n/i18n";
import { Button } from "../../ui";
import type {
  ProjectDetail,
  ResearchEvent,
  ResearchJob,
  ResearchNode,
} from "./research-api";
import type { ThreadItem } from "./talk/thread";
import { shortDuration } from "./process/model";
import { LiveJobs } from "./LiveJobs";
import styles from "./ResearchBoard.module.css";

/** The stages a research moves through, in order, as the board draws them. */
const STAGES = ["scoping", "experiments", "conclusion", "done"] as const;

const roleKey = (role: string) => `research.role.${role}` as MessageKey;

/**
 * A research at a glance: where it is now, what waits on the researcher, each
 * hypothesis with why it stands as it does, and the numbers so far. Every row
 * leads to the discussion that produced it.
 */
export function ResearchBoard({
  detail,
  events,
  items,
  onDiscuss,
  onLog,
  onChange,
  onDecide,
  replay = false,
}: {
  detail: ProjectDetail;
  events: ResearchEvent[];
  items: ThreadItem[];
  onDiscuss(itemId: string): void;
  onLog(jobId: string): void;
  onChange(): void;
  onDecide(requestId: string, approve: boolean, note: string): void;
  /** As it stood at an earlier moment: nothing to act on, nothing live. */
  replay?: boolean;
}) {
  const { t } = useI18n();
  const p = detail.project;
  const hypotheses = detail.nodes.filter((n) => n.parent_id);
  const running = detail.sprints.find((s) => s.status === "running");
  const jobsRunning = detail.jobs.filter((j) =>
    ["queued", "running"].includes(j.status),
  );
  const decisions = (replay ? [] : items).filter(
    (item): item is Extract<ThreadItem, { kind: "decision" }> =>
      item.kind === "decision" && item.open,
  );
  const plan = (replay ? [] : items).find(
    (item): item is Extract<ThreadItem, { kind: "plan" }> =>
      item.kind === "plan" && item.current,
  );
  const stageIndex = Math.max(
    0,
    STAGES.indexOf(
      (p.stage === "retrospective"
        ? "conclusion"
        : p.stage) as (typeof STAGES)[number],
    ),
  );
  const lastSummary = [...detail.sprints]
    .reverse()
    .find((s) => s.status !== "running" && s.summary)?.summary;
  const focus = running
    ? [...events]
        .reverse()
        .find((e) => e.sprint_id === running.id && e.action === "focus")
    : undefined;

  // Where it is now, in one line, from what is recorded (no model).
  const now = running
    ? t("research.board.now.working", {
        who: t(roleKey(running.role)),
        what:
          (typeof focus?.detail.intent === "string" && focus.detail.intent) ||
          t("team.colleague.thinking"),
      }) +
      (jobsRunning.length
        ? ` · ${t("research.board.now.jobs", { n: jobsRunning.length })}`
        : "")
    : plan ||
        decisions.some(
          (i) => !["checkin", "question"].includes(String(i.event.detail.kind)),
        )
      ? t("research.board.now.waiting")
      : p.status === "finished"
        ? firstSentence(p.conclusion_record?.summary || lastSummary || "")
        : jobsRunning.length
          ? t("research.board.now.jobs", { n: jobsRunning.length })
          : firstSentence(lastSummary || "") ||
            t(`research.stage.${p.stage}` as MessageKey);

  return (
    <div className={styles.board} data-testid="research-board">
      <div
        className={styles.now}
        data-live={!!running || !!jobsRunning.length || undefined}
      >
        <span className={styles.dot} aria-hidden />
        <span>{now}</span>
      </div>

      <ol className={styles.stages} aria-label={t("research.board.stages")}>
        {STAGES.map((stage, index) => (
          <li
            key={stage}
            data-state={
              p.status === "finished" || index < stageIndex
                ? "done"
                : index === stageIndex
                  ? "now"
                  : undefined
            }
          >
            <b>
              {p.status === "finished" || index < stageIndex ? (
                <Check size={12} aria-hidden />
              ) : (
                index + 1
              )}
            </b>
            {t(`research.stage.${stage}` as MessageKey)}
          </li>
        ))}
      </ol>

      {(plan || !!decisions.length) && (
        <section className={styles.decide} aria-label={t("inbox.title")}>
          <h3>{t("inbox.title")}</h3>
          {plan && (
            <div className={styles.decision}>
              <span>{t("research.board.planWaiting")}</span>
              <Button
                size="sm"
                variant="primary"
                onClick={() => onDiscuss(plan.id)}
              >
                {t("inbox.open")}
              </Button>
            </div>
          )}
          {decisions.map((item) =>
            item.event.detail.kind === "checkin" ? (
              <div key={item.id} className={styles.decision}>
                <span>
                  {String(item.event.detail.reason || "")}
                  {" · "}
                  {t(
                    `research.node.${String(item.event.detail.status)}` as MessageKey,
                  )}
                </span>
                <Button size="sm" onClick={() => onDecide(item.id, true, "")}>
                  {t("research.ask.seen")}
                </Button>
              </div>
            ) : (
              <div key={item.id} className={styles.decision}>
                <span>
                  {firstSentence(
                    String(
                      item.event.detail.reason ||
                        item.event.detail.question ||
                        "",
                    ),
                  ) || t("research.board.decision")}
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onDiscuss(item.id)}
                >
                  {t("inbox.open")}
                </Button>
              </div>
            ),
          )}
        </section>
      )}

      {!replay && (
        <LiveJobs
          projectId={p.id}
          jobs={detail.jobs}
          nodes={detail.nodes}
          onLog={onLog}
          onChange={onChange}
        />
      )}

      {!!hypotheses.length && (
        <section aria-label={t("research.board.hypotheses")}>
          <h3>{t("research.board.hypotheses")}</h3>
          <ul className={styles.hypotheses}>
            {hypotheses.map((node, index) => {
              const why = latestWhy(node, events);
              const discussed = discussion(node, events, detail.jobs, items);
              // Titles often carry their own label ("H2 …", "F0 …"); else number them.
              const own = /^([A-Z]\d+)\s+(.*)$/s.exec(node.title);
              return (
                <li key={node.id} data-status={node.status}>
                  <span className={styles.id}>
                    {own ? own[1] : `H${index + 1}`}
                  </span>
                  <span className={styles.what}>
                    <span>{own ? own[2] : node.title}</span>
                    {why && <small>{why}</small>}
                  </span>
                  <span className={styles.chip} data-status={node.status}>
                    {t(`research.node.${node.status}` as MessageKey)}
                  </span>
                  {discussed ? (
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => onDiscuss(discussed)}
                    >
                      {t("research.board.discuss")}
                    </button>
                  ) : (
                    <span />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-label={t("research.board.numbers")}>
        <h3>{t("research.board.numbers")}</h3>
        <div className={styles.numbers}>
          {numbers(detail.jobs).map(([name, value, job]) => (
            <button
              key={`${job.id}:${name}`}
              type="button"
              className={styles.number}
              data-live={job.status === "running" || undefined}
              onClick={() => {
                const item = items.find(
                  (i) => i.kind === "work" && i.sprint.id === job.sprint_id,
                );
                if (item) onDiscuss(item.id);
              }}
            >
              <span>{name}</span>
              <strong>{value}</strong>
            </button>
          ))}
          <div className={styles.number}>
            <span>{t("research.board.spent")}</span>
            <strong>
              {new Intl.NumberFormat(undefined, { notation: "compact" }).format(
                p.spent?.tokens || 0,
              )}
            </strong>
            {!!p.spent?.job_seconds && (
              <small>{shortDuration(p.spent.job_seconds, t)}</small>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function firstSentence(text: string) {
  const line =
    text
      .replaceAll("\\n", "\n")
      .split("\n")
      .find((l) => l.trim()) || "";
  // A Chinese full stop ends a sentence by itself; a Latin one needs a space after.
  const cut = line.search(/[\u3002\uff01\uff1f]|[.!?](\s|$)/);
  return (cut > 0 ? line.slice(0, cut + 1) : line).slice(0, 160).trim();
}

/** Why a hypothesis stands as it does: its last status change, or its last result. */
function latestWhy(node: ResearchNode, events: ResearchEvent[]) {
  const change = [...events]
    .reverse()
    .find(
      (e) =>
        e.node_id === node.id && e.action === "update_node" && e.detail.reason,
    );
  // A reason that is an action's name ("record_result") says nothing; skip it.
  if (change && !/^[a-z_]+$/.test(String(change.detail.reason)))
    return firstSentence(String(change.detail.reason));
  const result = [...node.evidence_for, ...node.evidence_against].at(-1);
  return result ? firstSentence(result.summary) : "";
}

/** The conversation where a hypothesis was last worked on: its sprint's block. */
function discussion(
  node: ResearchNode,
  events: ResearchEvent[],
  jobs: ResearchJob[],
  items: ThreadItem[],
) {
  const blocks = new Set(
    items.filter((i) => i.kind === "work").map((i) => i.id),
  );
  const sprints = [
    ...events.filter((e) => e.node_id === node.id).map((e) => e.sprint_id),
    ...jobs.filter((j) => j.node_id === node.id).map((j) => j.sprint_id),
  ].filter((id): id is string => !!id && blocks.has(id));
  return sprints.at(-1) || "";
}

/** The numbers so far: each experiment's reported metrics, newest first, a few. */
function numbers(jobs: ResearchJob[]): [string, string, ResearchJob][] {
  const out: [string, string, ResearchJob][] = [];
  const seen = new Set<string>();
  // A running experiment shows live above; these are the finished ones.
  for (const job of [...jobs]
    .filter((j) => j.status !== "running")
    .sort((a, b) =>
      (b.finished_at || b.started_at).localeCompare(
        a.finished_at || a.started_at,
      ),
    )) {
    for (const [name, value] of Object.entries(job.metrics || {})) {
      // Counters (step, epoch) are where a run is, not what it found.
      if (typeof value !== "number" || seen.has(name) || COUNTERS.test(name))
        continue;
      seen.add(name);
      out.push([name, format(name, value), job]);
      if (out.length >= 3) return out;
    }
  }
  return out;
}

export const COUNTERS =
  /^(step|steps|epoch|epochs|iter|iteration|global_step|n|count)$/i;
/** Rates and accuracies read as percentages; losses and the rest as numbers. */
export const RATES = /acc|accuracy|rate|ratio|auc|precision|recall|f1|share/i;

export function format(name: string, value: number) {
  if (RATES.test(name) && value >= 0 && value <= 1)
    return `${(value * 100).toFixed(1)}%`;
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}
