import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { Button, IconButton } from "../../ui";
import { memberName } from "../team/member-model";
import type { Team, TeamCatchup as Catchup } from "./team-api";
import { TeamFileCard } from "./TeamSidePanel";
import styles from "./TeamCatchup.module.css";

export function TeamCatchup({
  team,
  summary,
  onFile,
  onJump,
}: {
  team: Team;
  summary: Catchup;
  onFile(path: string): void;
  onJump(): void;
}) {
  const { t, tn, locale } = useI18n();
  const [open, setOpen] = useState(true);
  const name = (id: string | null) => {
    const member = team.members.find((member) => member.id === id);
    return member ? memberName(member, t) : t("team.system");
  };
  if (!summary.show) return null;
  return (
    <section
      className={styles.summary}
      aria-label={t("team.catchup.title")}
      data-testid="team-catchup"
    >
      <header>
        <strong>
          {summary.since
            ? t("team.catchup.since", {
                time: sinceLabel(summary.since, locale),
              })
            : t("team.catchup.title")}
        </strong>
        <IconButton
          size="sm"
          icon={open ? ChevronDown : ChevronRight}
          label={t(open ? "team.catchup.collapse" : "team.catchup.expand")}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        />
      </header>
      {open && (
        <ul className={styles.events}>
          {summary.new_messages > 0 && (
            <li>{tn("team.catchup.messages", summary.new_messages)}</li>
          )}
          {summary.completed.map((item) => (
            <li key={item.member_id}>
              {tn("team.catchup.completed", item.count, {
                name: name(item.member_id),
              })}
            </li>
          ))}
          {summary.files.map((file) =>
            file.deleted ? (
              <li key={file.path}>
                {t("team.catchup.deleted", { path: file.name })}
              </li>
            ) : (
              <li key={file.path} className={styles.file}>
                <TeamFileCard file={file} onFile={onFile} />
              </li>
            ),
          )}
          {summary.handoffs.map((item) => (
            <li key={item.message_id}>
              {t("team.catchup.handoff", {
                name: name(item.member_id),
                to: new Intl.ListFormat(locale, {
                  style: "short",
                  type: "conjunction",
                }).format(item.to.map(name)),
              })}
            </li>
          ))}
          {summary.waiting.map((item) => (
            <li key={item.message_id} data-tone="waiting">
              {t("team.catchup.waiting", {
                name: name(item.member_id),
                text: item.text,
              })}
            </li>
          ))}
          {summary.failed.map((item) => (
            <li key={item.message_id} data-tone="failed">
              {t("team.catchup.failed", {
                name: name(item.member_id),
                text: item.text,
              })}
            </li>
          ))}
        </ul>
      )}
      {summary.first_unread && (
        <Button variant="ghost" size="sm" onClick={onJump}>
          {t("team.catchup.jump")}
        </Button>
      )}
    </section>
  );
}

export function catchupAnchor(
  summary: Catchup | null,
  messages: { id: string }[],
) {
  if (!summary?.show || !messages.length) return null;
  return (
    messages.find(
      (message) =>
        message.id ===
        (summary.first_unread?.thread_id || summary.first_unread?.id),
    )?.id || messages[0].id
  );
}

/** When you left: the time today, the weekday this week, else the date. */
function sinceLabel(value: string, locale: string) {
  const at = new Date(value);
  const days = (Date.now() - at.getTime()) / 86400000;
  const time = at.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (new Date().toDateString() === at.toDateString()) return time;
  return days < 6
    ? `${at.toLocaleDateString(locale, { weekday: "short" })} ${time}`
    : at.toLocaleDateString(locale, { month: "short", day: "numeric" });
}
