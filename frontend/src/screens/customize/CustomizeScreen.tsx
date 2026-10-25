import { useI18n } from "../../i18n/I18nProvider";
import { PlaybookPanel } from "../research/PlaybookPanel";
import { RolesSection } from "./RolesSection";
import { WorkflowsSection } from "../workflows/WorkflowsSection";
import styles from "./CustomizeScreen.module.css";

export type CustomizeSection = "playbook" | "roles" | "workflows";

/** Full-page access to the configuration ORA already saves and uses. */
export function CustomizeScreen({
  section = "playbook",
}: {
  section?: CustomizeSection;
}) {
  const { t } = useI18n();
  return (
    <section className={styles.page} aria-label={t(`customize.${section}`)}>
      <div
        className={
          section === "workflows"
            ? `${styles.content} ${styles.workflowContent}`
            : styles.content
        }
      >
        {section === "roles" ? (
          <RolesSection />
        ) : section === "workflows" ? (
          <WorkflowsSection />
        ) : (
          <PlaybookPanel />
        )}
      </div>
    </section>
  );
}
