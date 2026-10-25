import { Plus, X } from "lucide-react";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppActions } from "../../app/AppSidebar";
import { useI18n } from "../../i18n/I18nProvider";
import { Button, IconButton, toast } from "../../ui";
import { readModels, type ModelRow } from "../setup/model-api";
import { useModelRevision } from "../setup/useModelRevision";
import { refreshResearchNavigation } from "./navigation-api";
import type { SlashCommand } from "../../lib/slash";
import {
  readWorkflows,
  workflowName,
  type Workflow,
} from "../workflows/workflows-api";
import { useResearchNavigation } from "./ResearchNavigation";
import { getTeam, sendTeamMessage, teamHash } from "./team-api";
import { resumeProject, startProject } from "./research-api";
import { Composer } from "./talk/Composer";
import { NewRecent } from "./NewRecent";
import { ModelPicker } from "./talk/Pickers";
import { WorkspacePicker } from "./WorkspaceDialogs";
import { uploadToWorkspace, mention } from "./files/files-api";
import styles from "./Workspace.module.css";

function stored(key: string) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

export function NewResearch({
  workspaceId,
  collectionId,
  go,
}: {
  workspaceId?: string;
  collectionId?: string;
  go(hash: string): void;
}) {
  const { t } = useI18n();
  const { owner = "" } = useContext(AppActions);
  const { data, ready, loading, error, reload } = useResearchNavigation();
  const [workspace, setWorkspace] = useState(
    workspaceId || stored(`research-workspace:${owner}`),
  );
  const [collection, setCollection] = useState(collectionId || "");
  const pendingWorkspace = useRef("");
  // The personal space is not a project: research is started in a project.
  const current = data.workspaces.find(
    (item) =>
      item.id === workspace && !item.archived && item.kind !== "personal",
  );
  const unavailable =
    ready &&
    !!workspaceId &&
    pendingWorkspace.current !== workspaceId &&
    !data.workspaces.some((item) => item.id === workspaceId && !item.archived);
  useEffect(() => {
    setWorkspace(workspaceId || stored(`research-workspace:${owner}`));
    setCollection(collectionId || "");
  }, [workspaceId, collectionId, owner]);
  const chooseContext = (nextWorkspace: string, nextCollection: string) => {
    pendingWorkspace.current = nextWorkspace;
    setWorkspace(nextWorkspace);
    setCollection(nextCollection);
    const params = new URLSearchParams();
    if (nextWorkspace) params.set("workspace", nextWorkspace);
    if (nextCollection) params.set("collection", nextCollection);
    go(`new${params.size ? `?${params}` : ""}`);
  };
  useEffect(() => {
    // Wait for real navigation data before changing the remembered folder.
    if (!ready || loading || error) return;
    // A missing explicit target must be selected again, never silently switch machines.
    if (unavailable) {
      setWorkspace("");
      return;
    }
    if (
      data.workspaces.some((item) => item.id === workspace && !item.archived)
    ) {
      pendingWorkspace.current = "";
    } else if (
      !pendingWorkspace.current ||
      workspace !== pendingWorkspace.current
    ) {
      const next = data.workspaces.find((item) => !item.archived)?.id || "";
      setWorkspace(next);
      if (!next) {
        try {
          localStorage.removeItem(`research-workspace:${owner}`);
        } catch {
          /* Optional preference. */
        }
      }
    }
  }, [workspace, data.workspaces, ready, loading, error, owner, unavailable]);
  useEffect(() => {
    if (current) {
      try {
        localStorage.setItem(`research-workspace:${owner}`, current.id);
      } catch {
        /* Optional preference. */
      }
    }
  }, [current, owner]);
  return (
    <main className={styles.newPage} data-testid="new-research">
      <div className={styles.newHeading}>
        <h1>{t("workspace.startQuestion")}</h1>
      </div>
      <div className={styles.startArea}>
        {unavailable && <p role="alert">{t("workspace.notFound")}</p>}
        <FirstMessage
          key={owner}
          draftKey={`research-draft:${owner}:new`}
          legacyDraftKey={`research-draft:${owner}:new:${workspace}:${collection}`}
          workspaceId={current?.id || ""}
          collectionId={collection || null}
          defaultModelId={current?.model_config_id || ""}
          personalId={
            data.workspaces.find((item) => item.kind === "personal")?.id || ""
          }
          go={go}
          context={
            <>
              <WorkspacePicker
                value={workspace}
                onChange={(next) => chooseContext(next, collection)}
              />
            </>
          }
        />
        {error && (
          <p className={styles.error} role="alert">
            {error}{" "}
            <Button size="sm" variant="ghost" onClick={reload}>
              {t("common.retry")}
            </Button>
          </p>
        )}
      </div>
      <NewRecent go={go} />
    </main>
  );
}

function FirstMessage({
  draftKey,
  legacyDraftKey,
  workspaceId,
  collectionId,
  go,
  context,
  defaultModelId,
  personalId,
}: {
  defaultModelId: string;
  /** With no project chosen, the words go to the advisor in the personal space, as to a colleague. */
  personalId: string;
  context: ReactNode;
  draftKey: string;
  legacyDraftKey: string;
  workspaceId: string;
  collectionId: string | null;
  go(hash: string): void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(
    () => stored(draftKey) || stored(legacyDraftKey),
  );
  const migratedDraft = useRef(stored(draftKey) ? "" : legacyDraftKey);
  const [workflowId, setWorkflowId] = useState("research");
  // "/" offers the workflows: a task named after one is done that way.
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  useEffect(() => {
    let stale = false;
    readWorkflows(workspaceId || undefined).then(
      (value) => !stale && setWorkflows(value),
      () => undefined,
    );
    return () => {
      stale = true;
    };
  }, [workspaceId]);
  const commands: SlashCommand[] = workflows.map((item) => ({
    name: workflowName(item, t),
    description: (item.steps ?? []).map((step) => step.name).join(" → "),
    group: "workflow",
    takesArgument: true,
    run: (task) => send(task, item.id),
  }));
  useEffect(() => {
    if (!workspaceId) return;
    let stale = false;
    getTeam(workspaceId).then(
      (team) => {
        if (!stale) setWorkflowId(team.workflow?.id || "research");
      },
      () => undefined,
    );
    return () => {
      stale = true;
    };
  }, [workspaceId]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [modelId, setModelId] = useState(() => stored(`${draftKey}:model`));
  const [modelKnown, setModelKnown] = useState(false);
  const explicitModel = useRef(!!stored(`${draftKey}:model`));
  useEffect(() => {
    if (
      !explicitModel.current &&
      models.some((model) => model.id === defaultModelId)
    )
      setModelId(defaultModelId);
  }, [defaultModelId, models]);
  const [files, setFiles] = useState<File[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const modelRevision = useModelRevision();
  useEffect(() => {
    let cancelled = false;
    readModels().then(
      (value) => {
        if (!cancelled) {
          setModels(value.models);
          setModelKnown(true);
          setModelId((previous) =>
            value.models.some((model) => model.id === previous)
              ? previous
              : value.active_id || value.models[0]?.id || "",
          );
        }
      },
      (reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [modelRevision]);
  useEffect(() => {
    try {
      if (text) localStorage.setItem(draftKey, text);
      else localStorage.removeItem(draftKey);
      if (text && migratedDraft.current) {
        localStorage.removeItem(migratedDraft.current);
        migratedDraft.current = "";
      }
    } catch {
      /* The draft remains editable when storage is unavailable. */
    }
  }, [draftKey, text]);
  useEffect(() => {
    if (!modelId) return;
    try {
      localStorage.setItem(`${draftKey}:model`, modelId);
    } catch {
      /* Optional preference. */
    }
  }, [draftKey, modelId]);
  /** A message, or the task after a "/workflow" command, which names the way it is done. */
  const send = async (words = text, chosen?: string) => {
    if ((!workspaceId && !personalId) || !modelId || !words.trim() || busy)
      return;
    setBusy(true);
    setError("");
    let createdId = "";
    const target = workspaceId;
    try {
      // A workflow is work in a project.
      if (chosen && !target) throw new Error(t("workflows.needsProject"));
      if (!target) {
        // Not a research yet: a word to the advisor, who proposes a project when one is needed.
        if (files.length) throw new Error(t("workspace.choose"));
        const team = await getTeam(personalId);
        const dm = team.channels.find((c) => c.key === "dm:advisor");
        if (!dm) throw new Error(t("workspace.notFound"));
        await sendTeamMessage(personalId, dm.id, {
          text: words.trim(),
          mode: "queue",
          client_id: crypto.randomUUID(),
        });
        try {
          localStorage.removeItem(draftKey);
          localStorage.removeItem(legacyDraftKey);
        } catch {
          /* Optional cache. */
        }
        go(teamHash(personalId, dm.id));
        return;
      }
      const research = await startProject({
        message:
          words.trim() +
          (files.length
            ? "\n" + files.map((file) => mention(file.name)).join(" ")
            : ""),
        workflow_id: chosen || workflowId,
        workspace_id: target,
        collection_id: collectionId,
        model_config_id: modelId,
        ...(files.length ? { defer_start: true } : {}),
      });
      createdId = research.id;
      for (const file of files) {
        await uploadToWorkspace(research.id, "", file);
        setFiles((old) => old.filter((item) => item !== file));
      }
      if (files.length) await resumeProject(research.id);
      try {
        localStorage.removeItem(draftKey);
        localStorage.removeItem(legacyDraftKey);
      } catch {
        /* Optional cache. */
      }
      refreshResearchNavigation();
      go(`research/${research.id}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (createdId) {
        toast.show({ message, tone: "error" });
        refreshResearchNavigation();
        go(`research/${createdId}`);
      } else setError(message);
      setBusy(false);
    }
  };
  return (
    <div className={styles.firstMessage}>
      <input
        type="file"
        multiple
        hidden
        ref={picker}
        onChange={(event) => {
          setFiles((old) => [...old, ...Array.from(event.target.files || [])]);
          event.target.value = "";
        }}
      />
      {!!files.length && (
        <div className={styles.attachments}>
          {files.map((file, index) => (
            <span key={index}>
              {file.name}
              <IconButton
                icon={X}
                label={t("common.remove")}
                size="sm"
                onClick={() =>
                  setFiles((old) => old.filter((_, i) => i !== index))
                }
              />
            </span>
          ))}
        </div>
      )}
      <Composer
        value={text}
        onChange={setText}
        onSend={() => void send()}
        commands={commands}
        label={t("workspace.firstMessage")}
        placeholder=""
        sendLabel={t("research.home.send")}
        busy={busy}
        disabled={busy}
        sendDisabled={(!workspaceId && !personalId) || !modelId}
        needsModel={modelKnown && models.length === 0}
        leading={
          <>
            <IconButton
              icon={Plus}
              className={styles.plus}
              label={t("research.attach")}
              size="sm"
              onClick={() => picker.current?.click()}
            />
            {context}
          </>
        }
        tools={
          <ModelPicker
            models={models}
            value={modelId}
            onChange={(id) => {
              explicitModel.current = true;
              setModelId(id);
            }}
            label={t("research.home.model")}
          />
        }
        autoFocus
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
