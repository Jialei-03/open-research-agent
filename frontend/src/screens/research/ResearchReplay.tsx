import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n/i18n";
import { Button } from "../../ui";
import type { ProjectDetail, ResearchEvent } from "./research-api";
import { ResearchBoard } from "./ResearchBoard";
import { milestones, replayMarkdown, rewind } from "./replay";
import type { ThreadItem } from "./talk/thread";
import styles from "./ResearchBoard.module.css";

/**
 * 回放: the research's timeline, each step with why and a way to its discussion,
 * and the board as it stood at any step.
 */
export function ResearchReplay({
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
  const steps = useMemo(
    () => milestones(events, detail.nodes, t),
    [events, detail.nodes, t],
  );
  const [chosen, setChosen] = useState<number | null>(null);
  const index = chosen ?? steps.length - 1;
  const at = steps[index]?.at ?? "";
  const then = useMemo(
    () => (at ? rewind(detail, events, at) : null),
    [detail, events, at],
  );
  const blocks = new Set(
    items.filter((i) => i.kind === "work").map((i) => i.id),
  );
  const who = (actor: string) =>
    actor === "human"
      ? t("research.replay.you")
      : actor === "system"
        ? t("research.replay.system")
        : t(`research.role.${actor}` as MessageKey);
  const title = detail.project.title || detail.project.question;
  const save = () => {
    const text = replayMarkdown(
      `${title} · ${t("research.view.replay")}`,
      detail.project.question,
      steps,
      who,
      localDay,
      localTime,
      (name, text) => t("research.replay.said", { name, text }),
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([text], { type: "text/markdown;charset=utf-8" }),
    );
    link.download = `${title.slice(0, 60)}-${t("research.view.replay")}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (!steps.length)
    return (
      <div className={styles.board}>
        <p className={styles.replayEmpty}>{t("research.replay.empty")}</p>
      </div>
    );
  const days: [string, number[]][] = [];
  steps.forEach((step, i) => {
    const day = localDay(step.at);
    if (days.at(-1)?.[0] !== day) days.push([day, []]);
    days.at(-1)![1].push(i);
  });
  return (
    <div className={styles.replay} data-testid="research-replay">
      <div className={styles.scrub}>
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          value={index}
          aria-label={t("research.replay.when")}
          aria-valuetext={`${localDay(at)} ${localTime(at)}`}
          onChange={(event) => setChosen(Number(event.target.value))}
        />
        <span>
          {localDay(at)} {localTime(at)}
        </span>
        <Button size="sm" icon={Download} onClick={save}>
          {t("research.replay.export")}
        </Button>
      </div>
      {then && (
        <ResearchBoard
          replay
          detail={then.detail}
          events={then.events}
          items={items}
          onDiscuss={onDiscuss}
          onLog={() => undefined}
          onChange={() => undefined}
          onDecide={() => undefined}
        />
      )}
      <ol className={styles.timeline} aria-label={t("research.view.replay")}>
        {days.map(([day, members]) => (
          <li key={day}>
            <h3>{day}</h3>
            <ul>
              {members.map((i) => {
                const step = steps[i];
                return (
                  <li
                    key={step.id}
                    data-current={i === index || undefined}
                    data-later={i > index || undefined}
                  >
                    <button
                      type="button"
                      className={styles.step}
                      onClick={() => setChosen(i)}
                    >
                      <time dateTime={step.at}>{localTime(step.at)}</time>
                      <span>
                        <b>{who(step.actor)}</b> {step.text}
                        {step.why && <small>{step.why}</small>}
                      </span>
                    </button>
                    {step.sprintId && blocks.has(step.sprintId) && (
                      <button
                        type="button"
                        className={styles.link}
                        onClick={() => onDiscuss(step.sprintId!)}
                      >
                        {t("research.board.discuss")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

const localDay = (at: string) => new Date(at).toLocaleDateString();
const localTime = (at: string) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
