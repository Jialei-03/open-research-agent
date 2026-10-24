"""The project folder as the team's right panel shows it: folders, a text
file saved by the researcher, and who changed a file (each change is a git
checkpoint: a member's run, or the researcher's own save)."""

import os

from fastapi import HTTPException

from . import research_repo
from .models import AgentRun, TeamMember
from .research_files import LIST_ENTRIES, TEXT_BYTES, _entry, kind_of, relative, resolve

RESEARCHER = "Researcher: "


def list_folder(root, path):
    folder = resolve(root, path)
    if not folder.is_dir():
        raise HTTPException(400, "不是文件夹 / Not a folder")
    entries = []
    with os.scandir(folder) as found:
        for item in found:
            if item.name == ".git":
                continue
            row = _entry(root, folder / item.name, set(), [])
            if row:
                entries.append(row)
            if len(entries) >= LIST_ENTRIES:
                break
    entries.sort(key=lambda e: (e["type"] != "dir", e["name"].lower()))
    return {
        "path": "" if folder == root.resolve() else relative(root, folder),
        "entries": entries,
        "truncated": len(entries) >= LIST_ENTRIES,
    }


def save_file(root, path, content):
    """Writes a text file the researcher edited, and records it as their change."""
    if len(content.encode("utf-8")) > TEXT_BYTES:
        raise HTTPException(413, "文件太大 / File too large")
    target = resolve(root, path)
    if not target.is_file():
        raise HTTPException(400, "不是文件 / Not a file")
    with target.open("rb") as handle:
        head = handle.read(8192)
    if kind_of(target, head) not in {"text", "markdown", "csv"}:
        raise HTTPException(400, "只能编辑文本文件 / Only text files can be edited")
    rel = relative(root, target)
    temporary = target.with_name(f".{target.name}.ora-save")
    temporary.write_text(content, encoding="utf-8")
    os.replace(temporary, target)
    if (root / ".git").exists():
        research_repo.git(root, "add", "--", rel)
        if research_repo.git(root, "diff", "--cached", "--quiet", "--", rel, check=False).returncode:
            research_repo.git(root, "commit", "-q", "-m", RESEARCHER + rel, "--", rel)
    return {"path": rel, "modified": target.stat().st_mtime}


def history(d, root, path, limit=20):
    """Who changed a file, newest first: a member (from their run) or the researcher."""
    target = resolve(root, path)
    rel = relative(root, target)
    if not (root / ".git").exists():
        return []
    log = research_repo.git(
        root, "log", f"-n{limit}", "--format=%H%x1f%cI%x1f%s", "--numstat", "--", rel,
        check=False,
    ).stdout
    rows, current = [], None
    for line in log.splitlines():
        if "\x1f" in line:
            commit, at, subject = line.split("\x1f", 2)
            current = {"commit": commit, "at": at, "added": 0, "removed": 0}
            if subject.startswith("Team: "):
                run = d.get(AgentRun, subject[len("Team: "):].strip())
                team = (run.runtime or {}).get("team", {}) if run else {}
                member = d.get(TeamMember, team.get("member_id")) if team.get("member_id") else None
                current |= {
                    "author": "member",
                    "member_id": member.id if member else None,
                    "name": member.name if member else "",
                    "message_id": team.get("message_id"),
                    "channel_id": team.get("channel_id"),
                }
            elif subject.startswith(RESEARCHER):
                current |= {"author": "researcher"}
            else:
                current |= {"author": "other", "subject": subject[:120]}
            rows.append(current)
        elif current and line.strip():
            added, removed, _ = (line.split("\t") + ["", ""])[:3]
            current["added"] += int(added) if added.isdigit() else 0
            current["removed"] += int(removed) if removed.isdigit() else 0
    return rows
