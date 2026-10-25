import pytest


@pytest.fixture(autouse=True)
def full_team(request, monkeypatch):
    """Most team tests predate the roster: their projects start with every built-in.

    Tests of who a new project starts with use the `roster` marker.
    """
    if request.node.get_closest_marker("roster"):
        return
    from backend import team_roster

    monkeypatch.setattr(team_roster, "DEFAULT", tuple(team_roster.builtin_roles()))
