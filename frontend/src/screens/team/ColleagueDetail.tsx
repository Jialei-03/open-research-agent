import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { followLink } from "../../reader/route";
import { IconButton, toast } from "../../ui";
import { MemberStatus } from "../research/TeamNavigation";
import { teamHash } from "../research/team-api";
import {
  readColleagueMemory,
  saveColleagueMemory,
  type Colleague,
  type ColleagueMemory as Memory,
  type MemoryTarget,
} from "./colleagues-api";
import styles from "./Members.module.css";

/** The projects a colleague is in, each a link to their place there. */
export function ColleagueProjects({
  colleagueKey,
  colleagues,
  go,
}: {
  colleagueKey: string;
  colleagues: Colleague[];
  go(hash: string): void;
}) {
  const { t } = useI18n();
  const colleague = colleagues.find((c) => c.key === colleagueKey);
  if (!colleague) return null;
  return (
    <>
      <h3>{t("colleagues.projects")}</h3>
      <ul className={styles.list} aria-label={t("colleagues.projects")}>
        {colleague.projects.map((p) => (
          <li key={p.workspace_id} className={styles.projectRow}>
            <MemberStatus status={p.status} />
            <a
              href={`#${teamHash(p.workspace_id)}`}
              onClick={followLink(go, teamHash(p.workspace_id))}
            >
              {p.personal ? t("personal.title") : p.workspace_name}
            </a>
            <span>{t(`team.status.${p.status}`)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** What a colleague keeps across projects: their notes and what they know about the researcher. */
export function ColleagueMemory({ colleagueKey }: { colleagueKey: string }) {
  const { t } = useI18n();
  const [memory, setMemory] = useState<Memory | null>(null);
  const [drafts, setDrafts] = useState<Record<MemoryTarget, string>>({
    memory: "",
    user: "",
  });
  useEffect(() => {
    let stale = false;
    setMemory(null);
    readColleagueMemory(colleagueKey).then(
      (value) => !stale && setMemory(value),
      () => undefined,
    );
    return () => {
      stale = true;
    };
  }, [colleagueKey]);
  if (!memory) return null;
  const save = async (target: MemoryTarget, entries: string[]) => {
    try {
      setMemory(await saveColleagueMemory(colleagueKey, target, entries));
      setDrafts((old) => ({ ...old, [target]: "" }));
    } catch (reason) {
      toast.show({ message: String(reason), tone: "error" });
    }
  };
  return (
    <>
      {(["user", "memory"] as const).map((target) => {
        const entries = memory.entries[target];
        const used = entries.join("\n§\n").length;
        const title = t(`colleagues.memory.${target}`);
        return (
          <section key={target} aria-label={title}>
            <h3 className={styles.memoryHead}>
              {title}
              <span>
                {used} / {memory.limits[target]}
              </span>
            </h3>
            <ul className={styles.memory}>
              {entries.map((entry, index) => (
                <li key={`${index}:${entry}`}>
                  <span>{entry}</span>
                  <IconButton
                    size="sm"
                    icon={X}
                    label={t("common.remove")}
                    onClick={() =>
                      void save(
                        target,
                        entries.filter((_, i) => i !== index),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
            <form
              className={styles.memoryAdd}
              onSubmit={(event) => {
                event.preventDefault();
                if (drafts[target].trim())
                  void save(target, [...entries, drafts[target].trim()]);
              }}
            >
              <input
                value={drafts[target]}
                aria-label={t("colleagues.memory.add", { title })}
                placeholder={t("colleagues.memory.add", { title })}
                onChange={(event) =>
                  setDrafts((old) => ({
                    ...old,
                    [target]: event.target.value,
                  }))
                }
              />
              <IconButton
                type="submit"
                size="sm"
                icon={Plus}
                label={t("colleagues.memory.add", { title })}
                disabled={!drafts[target].trim()}
              />
            </form>
          </section>
        );
      })}
    </>
  );
}
