import { useEffect, useSyncExternalStore } from "react";
import { getTeam, TEAM_EVENT, type Team } from "./team-api";

/**
 * Every open project's team, fetched once for the whole window: the project
 * rail's badges, the sidebar and "waiting on you" read the same copy instead
 * of each polling the server.
 */
let teams = new Map<string, Team>();
let ids: string[] = [];
let timer = 0;
const listeners = new Set<() => void>();

async function load() {
  const results = await Promise.allSettled(ids.map((id) => getTeam(id)));
  const next = new Map<string, Team>();
  results.forEach((result, index) => {
    if (result.status === "fulfilled") next.set(ids[index], result.value);
    else {
      const old = teams.get(ids[index]);
      if (old) next.set(ids[index], old);
    }
  });
  teams = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    timer = window.setInterval(load, 5000);
    window.addEventListener(TEAM_EVENT, load);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      window.removeEventListener(TEAM_EVENT, load);
    }
  };
}

export function useWorkspaceTeams(workspaceIds: string[]) {
  const key = workspaceIds.join(",");
  useEffect(() => {
    if (key === ids.join(",")) return;
    ids = key ? key.split(",") : [];
    void load();
  }, [key]);
  return useSyncExternalStore(
    subscribe,
    () => teams,
    () => teams,
  );
}
