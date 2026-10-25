import { Flag, MessageSquare, Sparkle } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";
import { followLink } from "../../reader/route";
import { Button, SegmentedControl } from "../../ui";
import { needsYou } from "./navigation-attention";
import { useResearchNavigation } from "./ResearchNavigation";
import { threadDate } from "./team-model";
import { useWorkspaceTeams } from "./workspace-teams";
import styles from "./Inbox.module.css";

/**
 * Everything waiting on the researcher, as Linear's inbox: one row each, the
 * project and how long it has waited, opened where it was asked.
 */
export function Inbox({
  workspaceId,
  go,
}: {
  workspaceId?: string;
  go(hash: string): void;
}) {
  const { t, tn, locale } = useI18n();
  const { data } = useResearchNavigation();
  const open = data.workspaces.filter((w) => !w.archived);
  const teams = useWorkspaceTeams(open.map((w) => w.id));
  const messages = [...teams].flatMap(([id, team]) =>
    team.notifications.map((m) => ({ ...m, workspace_id: id })),
  );
  const all = needsYou(data, messages);
  const items = workspaceId
    ? all.filter((item) => item.workspaceId === workspaceId)
    : all;
  const names = new Map(open.map((w) => [w.id, w.name]));
  return (
    <main className={styles.page} data-testid="inbox">
      <header className={styles.head}>
        <Flag size={16} aria-hidden="true" />
        <h1>{t("inbox.title")}</h1>
        <span className={styles.count}>{tn("inbox.count", items.length)}</span>
        <div className={styles.grow} />
        <SegmentedControl
          kind="radio"
          label={t("inbox.title")}
          value={workspaceId ? "project" : "all"}
          onChange={(value) =>
            go(
              value === "all"
                ? "inbox"
                : `inbox?workspace=${workspaceId || open[0]?.id || ""}`,
            )
          }
          options={[
            { value: "project", label: t("inbox.thisProject") },
            { value: "all", label: t("projects.all") },
          ]}
        />
      </header>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id}>
            <a
              className={styles.row}
              href={`#${item.hash}`}
              onClick={followLink(go, item.hash)}
            >
              <span className={styles.mark} aria-hidden="true">
                {item.id.startsWith("research:") ? (
                  <Sparkle size={16} />
                ) : (
                  <MessageSquare size={16} />
                )}
              </span>
              <span className={styles.text}>
                <span className={styles.title}>{item.title}</span>
                <span className={styles.meta}>
                  {names.get(item.workspaceId)}
                  {item.at &&
                    ` · ${threadDate(item.at, locale, new Date(), "relative")}`}
                </span>
              </span>
              <Button size="sm" variant="secondary" tabIndex={-1}>
                {t("inbox.open")}
              </Button>
            </a>
          </li>
        ))}
      </ul>
      {!items.length && (
        <div className={styles.empty}>
          <Flag size={28} aria-hidden="true" />
          <span>{t("inbox.empty")}</span>
        </div>
      )}
    </main>
  );
}
