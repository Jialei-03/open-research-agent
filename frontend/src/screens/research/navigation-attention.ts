import type { ResearchNavigation } from "./navigation-api";
import { researchStatus } from "./navigation-status";
import { teamHash, type TeamMessage } from "./team-api";

export type AttentionMessage = TeamMessage & { workspace_id: string };

/** Unread activity alone is not a request for a decision. */
export function needsYou(
  data: ResearchNavigation,
  messages: AttentionMessage[],
) {
  const active = data.workspaces.filter((workspace) => !workspace.archived);
  const workspaceIds = new Set(active.map((workspace) => workspace.id));
  return [
    ...messages
      .filter(
        (message) =>
          workspaceIds.has(message.workspace_id) &&
          message.data.waiting &&
          // A research waiting on you is counted once, by the research itself;
          // a waiting notice with nothing to read is not a decision to make.
          !message.thread_id?.startsWith("research:") &&
          !!message.text.trim(),
      )
      .map((message) => ({
        id: `message:${message.workspace_id}:${message.id}`,
        workspaceId: message.workspace_id,
        title: message.text,
        at: message.created_at,
        hash: teamHash(
          message.workspace_id,
          message.channel_id,
          message.thread_id || message.id,
        ),
      })),
    ...active
      .flatMap((workspace) => workspace.researches)
      .filter(
        (research) =>
          !research.archived_at &&
          researchStatus(research) === "research.status.waiting",
      )
      .map((research) => ({
        id: `research:${research.id}`,
        workspaceId: research.workspace_id,
        title: research.title || research.question,
        at: research.updated_at || "",
        hash: `research/${research.id}`,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}
