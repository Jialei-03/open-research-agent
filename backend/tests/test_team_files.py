"""The right panel's files: listing, a researcher's save as its own checkpoint, and history by author."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend import research_repo, team_files


@pytest.fixture
def root(tmp_path):
    folder = tmp_path / "work"
    (folder / "shared").mkdir(parents=True)
    (folder / "shared" / "plan.md").write_text("# Plan\n", encoding="utf-8")
    (folder / "data.bin").write_bytes(b"\x00\x01\x02")
    research_repo.git(folder, "init", "-q")
    research_repo.git(folder, "add", "-A")
    research_repo.git(folder, "commit", "-q", "-m", "Team: run-1")
    return folder


def test_lists_folders_first_without_git(root):
    listing = team_files.list_folder(root, "")
    assert [e["name"] for e in listing["entries"]] == ["shared", "data.bin"]
    assert listing["entries"][0]["type"] == "dir"
    assert team_files.list_folder(root, "shared")["entries"][0]["path"] == "shared/plan.md"
    with pytest.raises(HTTPException):
        team_files.list_folder(root, "../")


def test_researcher_save_is_its_own_checkpoint_and_shows_in_history(root):
    (root / "shared" / "other.md").write_text("member draft\n", encoding="utf-8")
    team_files.save_file(root, "shared/plan.md", "# Plan\n\n- H1\n")
    assert (root / "shared" / "plan.md").read_text(encoding="utf-8").endswith("- H1\n")
    # Only the saved file is committed: a member's unfinished work stays theirs.
    status = research_repo.git(root, "status", "--porcelain").stdout
    assert "other.md" in status and "plan.md" not in status
    run = SimpleNamespace(runtime={"team": {"member_id": "m1", "message_id": "msg", "channel_id": "c"}})
    member = SimpleNamespace(id="m1", name="writer")
    d = SimpleNamespace(get=lambda model, key: {"run-1": run, "m1": member}.get(key))
    rows = team_files.history(d, root, "shared/plan.md")
    assert [r["author"] for r in rows] == ["researcher", "member"]
    assert rows[0]["added"] == 2 and rows[1]["name"] == "writer"
    assert rows[1]["message_id"] == "msg"


def test_only_text_files_are_saved(root):
    with pytest.raises(HTTPException) as error:
        team_files.save_file(root, "data.bin", "x")
    assert error.value.status_code == 400
