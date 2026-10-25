"""When a research calls the researcher in; the rest of the time it goes on alone.

Each research keeps its own choice in `budget["call_me"]`:

- "hypothesis": a hypothesis is settled (supported, refuted or abandoned). It is
  put in front of the researcher to read; the work does not wait for it.
- "spend": the research has spent markedly more since the researcher last said
  to go on (every SPEND_TOKENS tokens, or SPEND_SECONDS of experiments). The
  work waits for a yes; a no ends it there.
- "conclusion": the answer waits for the researcher to accept it. Without it the
  advisor's conclusion stands.

All three are on unless the researcher turns them off. Evaluation runs
(`auto_decide`) never call anyone.
"""

from . import research_map
from .research_map import CLOSED

POINTS = ("hypothesis", "spend", "conclusion")
SPEND_TOKENS = 1_000_000
SPEND_SECONDS = 4 * 3600


def points(project):
    budget = project.budget or {}
    if budget.get("auto_decide"):
        return set()
    chosen = budget.get("call_me")
    if not isinstance(chosen, list):
        return set(POINTS)
    return {p for p in chosen if p in POINTS}


def choose(project, chosen):
    chosen = [p for p in POINTS if p in set(chosen or [])]
    budget = dict(project.budget or {})
    budget["call_me"] = chosen
    if "spend" in chosen and "spend" not in points(project):
        # Counting starts from now, not from what was spent while it was off.
        budget["call_me_from"] = _now(project)
    project.budget = budget
    return chosen


def _now(project):
    spent = project.spent or {}
    return {
        "tokens": int(spent.get("tokens") or 0),
        "job_seconds": float(spent.get("job_seconds") or 0),
    }


def hypothesis_settled(d, project, node, before, after, sprint_id=None):
    """A hypothesis reached a verdict: the researcher hears of it, the work goes on."""
    if (
        node.parent_id is None
        or after not in CLOSED
        or before in CLOSED
        or "hypothesis" not in points(project)
        or d.info.get("ora_no_checkin")
    ):
        return
    research_map.event(
        d,
        project,
        node,
        "system",
        "decision_requested",
        {
            "kind": "checkin",
            "proposal": "acknowledge",
            "node_id": node.id,
            "status": after,
            "reason": node.title[:300],
        },
        sprint_id,
    )


def spend_due(project):
    if "spend" not in points(project):
        return False
    since = (project.budget or {}).get("call_me_from")
    now = _now(project)
    if not isinstance(since, dict):
        # Counted from the first look: a research from before this asks no earlier.
        project.budget = {**(project.budget or {}), "call_me_from": now}
        return False
    return now["tokens"] - int(since.get("tokens") or 0) >= SPEND_TOKENS or (
        now["job_seconds"] - float(since.get("job_seconds") or 0) >= SPEND_SECONDS
    )


def request_spend(d, project):
    """Spending grew markedly: the work waits for the researcher's yes."""
    from .research_stages import open_request

    if open_request(d, project, "spend") is not None:
        project.status = "waiting"
        return
    now = _now(project)
    research_map.event(
        d,
        project,
        None,
        "system",
        "decision_requested",
        {
            "kind": "spend",
            "proposal": "continue",
            "tokens": now["tokens"],
            "job_seconds": now["job_seconds"],
            "reason": (
                f"到目前一共花了 {now['tokens']:,} token、实验 "
                f"{round(now['job_seconds'] / 3600, 1)} 小时。同意就继续；"
                "不同意就到此为止，进入复盘。"
            ),
        },
    )
    project.status = "waiting"


def decide_spend(d, project, approve):
    from .research_stages import end_on_budget

    if approve:
        project.budget = {**(project.budget or {}), "call_me_from": _now(project)}
    else:
        end_on_budget(d, project, "human")
