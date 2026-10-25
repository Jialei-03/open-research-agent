import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { Button, Dialog, TextArea, TextField } from "../../ui";
import { readModels } from "../setup/model-api";
import type { NavigationWorkspace } from "./navigation-api";
import { refreshResearchNavigation } from "./navigation-api";
import { createWorkspace, startProject } from "./research-api";
import type { TeamMember, TeamMessage } from "./team-api";

const NEW = "";

/**
 * 在项目里开始: what was worked out with the advisor in the personal space
 * becomes a research in a project, the conversation carried along as its
 * background so nothing has to be said twice.
 */
export function StartInProject({
  open,
  messages,
  members,
  projects,
  onClose,
  go,
}: {
  open: boolean;
  messages: TeamMessage[];
  members: TeamMember[];
  projects: NavigationWorkspace[];
  onClose(): void;
  go(hash: string): void;
}) {
  const { t } = useI18n();
  const human = members.find((m) => m.role === "human");
  const lastAsked = [...messages]
    .reverse()
    .find((m) => m.author_id === human?.id && m.text.trim());
  const [question, setQuestion] = useState("");
  const [project, setProject] = useState(projects[0]?.id ?? NEW);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setQuestion(lastAsked?.text.trim().slice(0, 2000) ?? "");
    setProject(projects[0]?.id ?? NEW);
    setName("");
    setError("");
    // Only when it opens: what was typed stays while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const models = await readModels();
      const model = models.active_id || models.models[0]?.id || "";
      const workspace =
        project ||
        (await createWorkspace(name.trim() || question.slice(0, 40))).id;
      const research = await startProject({
        message: question.trim(),
        background: transcript(
          messages,
          members,
          t("team.member.human"),
          (name, text) => t("research.replay.said", { name, text }),
        ),
        model_config_id: model,
        workspace_id: workspace,
      });
      refreshResearchNavigation();
      onClose();
      go(`research/${research.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      title={t("team.startInProject")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!question.trim() || (!project && !name.trim())}
            onClick={start}
          >
            {t("team.startInProject.start")}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gap: "var(--ui-space-12)" }}>
        <label style={{ display: "grid", gap: "var(--ui-space-6)" }}>
          <span>{t("team.startInProject.project")}</span>
          <select
            value={project}
            onChange={(event) => setProject(event.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value={NEW}>{t("team.startInProject.new")}</option>
          </select>
        </label>
        {!project && (
          <TextField
            label={t("team.startInProject.name")}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
        <TextArea
          label={t("team.startInProject.question")}
          rows={4}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        {error && <p role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}

/** The conversation so far, as background for the research's colleagues. */
function transcript(
  messages: TeamMessage[],
  members: TeamMember[],
  you: string,
  said: (name: string, text: string) => string,
) {
  const lines = messages
    .filter((m) => m.text.trim() && !m.data.joined)
    .map((m) => {
      const member = members.find((x) => x.id === m.author_id);
      const who = member?.role === "human" ? you : member?.name || "";
      return said(who, m.text.trim());
    });
  let text = "";
  // The latest part matters most; older turns go first when it is too long.
  for (const line of [...lines].reverse()) {
    if (text.length + line.length > 18000) break;
    text = `${line}\n\n${text}`;
  }
  return text.trim();
}
