import pytest


@pytest.fixture(autouse=True)
def full_team(request, monkeypatch):
    """Most team tests predate the roster: their projects start with every built-in.

    Tests of who a new project starts with use the `roster` marker.
    """
    if request.node.get_closest_marker("roster"):
        return
    from backend import research_team, team_roster

    monkeypatch.setattr(team_roster, "DEFAULT", tuple(team_roster.builtin_roles()))
    # ...and with the four groups projects used to start with.
    monkeypatch.setattr(
        research_team,
        "CHANNELS",
        {"review": "综述", "experiments": "实验", "writing": "写作", "general": "闲聊"},
    )
