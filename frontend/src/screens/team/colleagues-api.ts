import { api, send } from "../../api";
import type { MessageKey, Translator } from "../../i18n/i18n";

/** One colleague on the researcher's roster, and the projects they are in. */
export interface Colleague {
  key: string;
  role: string | null;
  name: string;
  library_id: string | null;
  projects: {
    workspace_id: string;
    workspace_name: string;
    personal: boolean;
    member_id: string;
    status: "working" | "queued" | "idle";
  }[];
  working: boolean;
}

export type MemoryTarget = "memory" | "user";
export interface ColleagueMemory {
  entries: Record<MemoryTarget, string[]>;
  limits: Record<MemoryTarget, number>;
}

export const listColleagues = () => api<Colleague[]>("/research/colleagues");
export const readColleagueMemory = (key: string) =>
  api<ColleagueMemory>(
    `/research/colleagues/${encodeURIComponent(key)}/memory`,
  );
export const saveColleagueMemory = (
  key: string,
  target: MemoryTarget,
  entries: string[],
) =>
  send(
    `/research/colleagues/${encodeURIComponent(key)}/memory`,
    { target, entries },
    "PUT",
  ) as Promise<ColleagueMemory>;
export const joinColleague = (workspaceId: string, key: string) =>
  send(`/research/workspaces/${workspaceId}/team/members/join`, {
    key,
  }) as Promise<{ id: string }>;

/** The roster key of a project member: its built-in role or its library entry. */
export const colleagueKey = (member: {
  role: string;
  builtin?: boolean;
  library_id?: string | null;
  id: string;
}) =>
  member.builtin
    ? member.role
    : member.library_id
      ? `lib:${member.library_id}`
      : `member:${member.id}`;

/** A built-in colleague's name in the interface language; a hired one's own name. */
export const colleagueName = (c: Colleague, t: Translator["t"]) =>
  c.role ? t(`team.member.${c.role}` as MessageKey) : c.name;
