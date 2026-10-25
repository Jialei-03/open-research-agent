"""Hiring from one sentence: the model's reply becomes a checked agent file."""

import pytest

from backend import team_hire
from backend.agent_files import DefinitionError


def test_fenced_draft_is_parsed_like_an_imported_file():
    drafted = team_hire.shape(
        "Here it is:\n```markdown\n---\nname: 统计员\ndescription: 检查统计\n"
        "tools: [files, shell]\ncolor: green\n---\n\n# 统计员\n\n做检验。\n```"
    )
    assert drafted["config"]["name"] == "统计员"
    assert drafted["config"]["tools"] == ["files", "shell"]
    assert drafted["source"].startswith("---\nname: 统计员")


def test_a_reply_without_a_file_or_with_a_bad_name_is_refused():
    with pytest.raises(ValueError):
        team_hire.shape("I cannot help with that.")
    with pytest.raises(DefinitionError):
        team_hire.shape("---\nname: a/b\n---\nbody\n")
