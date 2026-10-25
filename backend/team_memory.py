"""A colleague's own memory, kept across projects and sessions (after Hermes).

Two small files per colleague: MEMORY.md, what they learned about the work
(conventions, pitfalls, how things are done), and USER.md, what they know about
the researcher (preferences, how they like results). Entries are separated by
a line holding only "§". Each new session starts with a snapshot of both;
the member edits them with the team_memory tool and the researcher can read and
edit them on the colleague's page. Project content stays in the project.
"""

from .agent_files import atomic_write, library_root, safe_path

LIMITS = {"memory": 2200, "user": 1375}
FILES = {"memory": "MEMORY.md", "user": "USER.md"}
SEPARATOR = "\n§\n"


def folder(settings, owner, key):
    return safe_path(
        library_root(settings, owner), "memory/" + key.replace(":", "-")
    )


def read(settings, owner, key):
    out = {}
    for target, name in FILES.items():
        path = folder(settings, owner, key) / name
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            text = ""
        out[target] = [e.strip() for e in text.split(SEPARATOR) if e.strip()]
    return out


def write(settings, owner, key, target, entries):
    entries = [e.strip() for e in entries if e.strip()]
    text = SEPARATOR.join(entries)
    if len(text) > LIMITS[target]:
        raise ValueError(
            f"记忆超出 {LIMITS[target]} 字上限，请先合并或删去旧条目 / "
            f"Memory over {LIMITS[target]} characters: merge or remove entries first"
        )
    atomic_write(folder(settings, owner, key) / FILES[target], text + "\n" if text else "")
    return entries


def change(settings, owner, key, action, target, content="", old_text=""):
    """The team_memory tool: add, replace or remove one entry; old_text is a unique part of it."""
    if target not in FILES:
        raise ValueError("target 须为 memory 或 user / target must be memory or user")
    entries = read(settings, owner, key)[target]
    if action == "add":
        if not content.strip():
            raise ValueError("内容为空 / Empty content")
        entries.append(content)
    elif action in {"replace", "remove"}:
        hits = [i for i, e in enumerate(entries) if old_text and old_text in e]
        if len(hits) != 1:
            raise ValueError(
                "old_text 须唯一匹配一条记忆 / old_text must match exactly one entry"
            )
        if action == "replace":
            if not content.strip():
                raise ValueError("内容为空 / Empty content")
            entries[hits[0]] = content
        else:
            entries.pop(hits[0])
    else:
        raise ValueError("action 须为 add、replace 或 remove / Unknown action")
    entries = write(settings, owner, key, target, entries)
    used = len(SEPARATOR.join(entries))
    return {"target": target, "entries": entries, "used": used, "limit": LIMITS[target]}


def snapshot(settings, owner, key):
    """The memory block a new session starts with."""
    memory = read(settings, owner, key)
    parts = [
        "## Your memory\n"
        "You keep two small notebooks across projects and sessions with the "
        "team_memory tool: `memory` for what you learn about doing the work "
        "(conventions, pitfalls, what worked), `user` for what you learn about "
        "the researcher (preferences, how they want results). Save only what will "
        "matter again; keep entries short; replace stale ones. Project content "
        "(data, results, paper details) stays in the project, not here. When the "
        "researcher states a preference, corrects you, or praises how you did "
        "something, record it before you reply."
    ]
    for target, title in (("memory", "Your notes"), ("user", "About the researcher")):
        if memory[target]:
            parts.append(f"### {title}\n" + "\n".join(f"- {e}" for e in memory[target]))
    return "\n\n".join(parts)
