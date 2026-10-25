import { useI18n } from "../../i18n/I18nProvider";
import { useResearchNavigation } from "../research/ResearchNavigation";
import { useWorkspaceTeams } from "../research/workspace-teams";
import { colleagueKey } from "./colleagues-api";
import { Members } from "./Members";
import styles from "./TeamSettings.module.css";

/**
 * The researcher's colleagues, whatever project they are in. They are drawn from
 * the personal space, where everyone is; an edit there reaches every project.
 */
export function ColleaguesScreen({
  colleague,
  go,
}: {
  colleague?: string;
  go(hash: string): void;
}) {
  const { t } = useI18n();
  const { data } = useResearchNavigation();
  const personal = data.workspaces.find((w) => w.kind === "personal");
  const teams = useWorkspaceTeams(personal ? [personal.id] : []);
  const team = personal ? teams.get(personal.id) : undefined;
  const selected = team?.members.find(
    (m) => !m.deleted && m.role !== "human" && colleagueKey(m) === colleague,
  );
  const hire =
    new URLSearchParams(location.hash.split("?")[1] || "").get("hire") === "1";
  return (
    <section className={styles.page} aria-label={t("app.section.colleagues")}>
      <header className={styles.header}>
        <h1>{t("app.section.colleagues")}</h1>
      </header>
      {team && (
        <Members
          team={team}
          roster
          selected={selected?.id}
          hireOpen={hire}
          hashFor={(m) =>
            m
              ? `colleagues/${encodeURIComponent(colleagueKey(m))}`
              : "colleagues"
          }
          go={go}
        />
      )}
    </section>
  );
}
