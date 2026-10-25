import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { Button, toast } from "../../ui";
import {
  jobSeries,
  stopJob,
  type ResearchJob,
  type ResearchNode,
  type SeriesPoint,
} from "./research-api";
import { plainCommand } from "./process/model";
import { COUNTERS, RATES, format } from "./ResearchBoard";
import styles from "./ResearchBoard.module.css";

/** The settings a run usually names its length by. */
const TOTALS = [
  "epochs",
  "num_epochs",
  "total_steps",
  "max_steps",
  "steps",
  "iters",
  "iterations",
  "total",
];

/**
 * Each running experiment as it goes: how far, how long left, its latest
 * number and curve. What it logs (through `ora` or SwanLab) arrives while it
 * runs, so the card follows it without waiting for the end.
 */
export function LiveJobs({
  projectId,
  jobs,
  nodes,
  onLog,
  onChange,
}: {
  projectId: string;
  jobs: ResearchJob[];
  nodes: ResearchNode[];
  onLog(jobId: string): void;
  onChange(): void;
}) {
  const { t } = useI18n();
  const running = jobs.filter((job) => job.status === "running");
  if (!running.length) return null;
  return (
    <section aria-label={t("research.board.running")}>
      <h3>{t("research.board.running")}</h3>
      <div className={styles.live}>
        {running.map((job) => (
          <LiveJob
            key={job.id}
            projectId={projectId}
            job={job}
            node={nodes.find((n) => n.id === job.node_id)}
            onLog={() => onLog(job.id)}
            onChange={onChange}
          />
        ))}
      </div>
    </section>
  );
}

function LiveJob({
  projectId,
  job,
  node,
  onLog,
  onChange,
}: {
  projectId: string;
  job: ResearchJob;
  node?: ResearchNode;
  onLog(): void;
  onChange(): void;
}) {
  const { t } = useI18n();
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [clock, setClock] = useState(() => Date.now());
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    if (!job.points) return;
    jobSeries(projectId, job.id).then(setSeries, () => undefined);
  }, [projectId, job.id, job.points]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const name =
    String(job.config?.tag || "") ||
    node?.title.replace(/^[A-Z]\d+\s+/, "") ||
    plainCommand(job.command);
  const elapsed = job.started_at
    ? Math.max(0, (clock - Date.parse(job.started_at)) / 1000)
    : 0;
  // The number to watch: an accuracy-like one if it logs one, else its first.
  const names = Object.keys(series.at(-1) ?? job.metrics ?? {}).filter(
    (k) =>
      k !== "t" &&
      !COUNTERS.test(k) &&
      typeof (series.at(-1)?.[k] ?? job.metrics?.[k]) === "number",
  );
  const metric = names.find((k) => RATES.test(k)) ?? names[0];
  const points = metric
    ? series
        .map((row) => row[metric])
        .filter((v): v is number => typeof v === "number")
    : [];
  const latest = metric
    ? ((series.at(-1)?.[metric] ?? job.metrics?.[metric]) as number)
    : undefined;

  // How far: the last step it logged against the length its settings name.
  const total = TOTALS.map((k) => Number(job.config?.[k])).find(
    (n) => Number.isFinite(n) && n > 0,
  );
  const step = [...series].reverse().find((r) => typeof r.step === "number")
    ?.step as number | undefined;
  const done =
    total && step !== undefined ? Math.min(1, (step + 1) / total) : undefined;
  const left =
    done && done < 1 && elapsed > 30 ? (elapsed * (1 - done)) / done : 0;

  const stop = async () => {
    setStopping(true);
    try {
      await stopJob(projectId, job.id);
      onChange();
    } catch (error) {
      toast.show({
        message: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
      setStopping(false);
    }
  };

  return (
    <article className={styles.job} aria-label={name}>
      <div className={styles.jobHead}>
        <b>{name}</b>
        <span className={styles.jobTime}>
          {t("research.board.job.elapsed", {
            time: coarse(elapsed, t),
          })}
          {!!left &&
            ` · ${t("research.board.job.left", { time: coarse(left, t) })}`}
        </span>
      </div>
      {done !== undefined && (
        <div
          className={styles.progress}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(done * 100)}
        >
          <i style={{ width: `${done * 100}%` }} />
        </div>
      )}
      {metric && latest !== undefined && (
        <div className={styles.jobMetric}>
          <div>
            <span>{metric}</span>
            <strong>{format(metric, latest)}</strong>
          </div>
          <Spark points={points} />
        </div>
      )}
      <div className={styles.jobActions}>
        <Button size="sm" onClick={onLog}>
          {t("research.run.log")}
        </Button>
        <Button size="sm" disabled={stopping} onClick={stop}>
          {t("research.board.job.stop")}
        </Button>
      </div>
    </article>
  );
}

/** A duration to the minute: an experiment's clock, not a stopwatch. */
function coarse(seconds: number, t: ReturnType<typeof useI18n>["t"]) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60
    ? t("research.board.job.minutes", { n: minutes })
    : t("research.board.job.hours", {
        h: Math.floor(minutes / 60),
        m: minutes % 60,
      });
}

function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return <span />;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  const line = points
    .map(
      (v, i) =>
        `${(i / (points.length - 1)) * 100},${28 - ((v - lo) / span) * 24 - 2}`,
    )
    .join(" ");
  return (
    <svg
      className={styles.spark}
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline points={line} />
    </svg>
  );
}
