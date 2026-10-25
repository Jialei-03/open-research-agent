import { useI18n } from "../../i18n/I18nProvider";
import { followLink } from "../../reader/route";
import { MemberAvatar } from "../team/MemberEditor";
import { memberName } from "../team/member-model";
import { needsYou } from "./navigation-attention";
import { NewResearch } from "./NewResearch";
import { useResearchNavigation } from "./ResearchNavigation";
import { teamHash } from "./team-api";
import { colleagueStatus } from "./TeamMemberCard";
import { useWorkspaceTeams } from "./workspace-teams";
import styles from "./AllProjects.module.css";

/** Every project at once: what waits on you, who is working where, and each project's state. */
export function AllProjects({ go }: { go(hash: string): void }) {
  const { t, tn } = useI18n();
  const { data, ready } = useResearchNavigation();
  const open = data.workspaces.filter(
    (w) => !w.archived && w.kind !== "personal",
  );
  const teams = useWorkspaceTeams(open.map((w) => w.id));
  const messages = [...teams].flatMap(([id, team]) =>
    team.notifications.map((m) => ({ ...m, workspace_id: id })),
  );
  const waiting = needsYou(data, messages);
  const working = open.flatMap((w) =>
    (teams.get(w.id)?.members || [])
      .filter((m) => m.status === "working" || m.status === "queued")
      .map((member) => ({ workspace: w, member })),
  );
  const tokens = [...teams.values()].reduce(
    (n, team) => n + (team.tokens || 0),
    0,
  );
  // Before the first project there is nothing to oversee: start one here.
  if (ready && !open.length) return <NewResearch go={go} />;
  return (
    <main className={styles.page} data-testid="all-projects">
      <header className={styles.head}>
        <h1>{t("projects.all")}</h1>
      </header>
      <div className={styles.body}>
        <div className={styles.metrics}>
          <a
            className={styles.metric}
            href="#inbox"
            onClick={followLink(go, "inbox")}
          >
            <span>{t("inbox.title")}</span>
            <strong data-tone="waiting">{waiting.length}</strong>
          </a>
          <div className={styles.metric}>
            <span>{t("panel.duty.working")}</span>
            <strong data-tone="working">{working.length}</strong>
          </div>
          <div className={styles.metric}>
            <span>{t("all.projects")}</span>
            <strong>{open.length}</strong>
          </div>
          <div className={styles.metric}>
            <span>{t("panel.spend")}</span>
            <strong>
              {new Intl.NumberFormat(undefined, { notation: "compact" }).format(
                tokens,
              )}
            </strong>
          </div>
        </div>
        {!!working.length && (
          <section aria-label={t("panel.duty.working")}>
            <h2>{t("panel.duty.working")}</h2>
            <ul className={styles.list}>
              {working.map(({ workspace, member }) => {
                const dm = teams
                  .get(workspace.id)
                  ?.channels.find((c) => c.member_id === member.id);
                const target = teamHash(workspace.id, dm?.id || "");
                return (
                  <li key={`${workspace.id}:${member.id}`}>
                    <a
                      className={styles.row}
                      href={`#${target}`}
                      onClick={followLink(go, target)}
                    >
                      <MemberAvatar member={member} size="sm" />
                      <span className={styles.name}>
                        {memberName(member, t)}
                      </span>
                      <span className={styles.project}>{workspace.name}</span>
                      <span className={styles.state}>
                        {colleagueStatus(member, { t, tn })}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <section aria-label={t("all.projects")}>
          <h2>{t("all.projects")}</h2>
          <div className={styles.cards}>
            {open.map((w) => {
              const count = waiting.filter(
                (item) => item.workspaceId === w.id,
              ).length;
              const running = w.researches.filter((r) => r.working).length;
              return (
                <a
                  key={w.id}
                  className={styles.card}
                  href={`#${teamHash(w.id)}`}
                  onClick={followLink(go, teamHash(w.id))}
                >
                  <strong>{w.name}</strong>
                  <span>
                    {[
                      tn("all.researches", w.researches.length),
                      running ? tn("all.running", running) : "",
                      count ? tn("all.waiting", count) : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
