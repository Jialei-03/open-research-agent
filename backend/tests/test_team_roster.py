"""Colleagues are the researcher's; a project starts with the advisor and others join when called on."""

import pytest
from sqlalchemy import select

from backend.models import TeamChannel, TeamDelivery, TeamMember, TeamMessage
from backend.tests.test_acceptance import env as cloud_env  # noqa: F401
from backend.tests.test_research_routes import env  # noqa: F401
from backend.tests.test_research_team import send, world  # noqa: F401

pytestmark = pytest.mark.roster


def present(app, wid):
    with app.state.maker() as d:
        return {
            m.role
            for m in d.scalars(
                select(TeamMember).where(
                    TeamMember.workspace_id == wid, TeamMember.deleted.is_(False)
                )
            )
        }


def test_a_new_project_has_the_researcher_and_the_advisor(world):
    app, a, _, _, _, _, wid, base, overview = world
    assert present(app, wid) == {"human", "advisor"}
    dms = [c for c in overview["channels"] if c["member_id"]]
    assert [c["key"] for c in dms] == ["dm:advisor"]
    roster = a.get("/api/v1/research/colleagues").json()
    assert {c["key"] for c in roster} >= {
        "advisor",
        "executor",
        "librarian",
        "reviewer",
        "writer",
        "distiller",
    }
    advisor = next(c for c in roster if c["key"] == "advisor")
    assert [p["workspace_id"] for p in advisor["projects"]] == [wid]
    assert next(c for c in roster if c["key"] == "writer")["projects"] == []


def test_naming_a_colleague_brings_them_in_and_wakes_them(world):
    app, a, _, _, _, _, wid, base, _ = world
    send(world, "@写手 把结论整理成一段话")
    assert "writer" in present(app, wid)
    with app.state.maker() as d:
        writer = d.scalar(
            select(TeamMember).where(
                TeamMember.workspace_id == wid, TeamMember.role == "writer"
            )
        )
        assert d.scalar(
            select(TeamDelivery).where(TeamDelivery.member_id == writer.id)
        )
        assert d.scalar(
            select(TeamChannel).where(TeamChannel.member_id == writer.id)
        )
        joined = d.scalar(
            select(TeamMessage).where(TeamMessage.author_id == writer.id)
        )
        assert joined.data == {"joined": True}


def test_colleagues_join_and_leave_but_the_advisor_stays(world):
    app, a, _, _, _, _, wid, base, _ = world
    joined = a.post(base + "/members/join", json={"key": "reviewer"})
    assert joined.status_code == 200, joined.text
    assert "reviewer" in present(app, wid)
    assert a.delete(base + f"/members/{joined.json()['id']}").status_code == 200
    assert "reviewer" not in present(app, wid)
    # Joining again reuses the same member, history and all.
    again = a.post(base + "/members/join", json={"key": "reviewer"})
    assert again.json()["id"] == joined.json()["id"]
    advisor = next(
        m["id"]
        for m in a.get(base).json()["members"]
        if m["role"] == "advisor"
    )
    assert a.delete(base + f"/members/{advisor}").status_code == 422
    assert a.post(base + "/members/join", json={"key": "nobody"}).status_code == 422


def test_the_research_workflow_validates_and_calls_absent_colleagues_in(world):
    from backend import team_rules, team_workflows
    from backend.models import ResearchWorkspace

    app, _, _, _, _, _, wid, _, _ = world
    with app.state.maker() as d:
        workspace = d.get(ResearchWorkspace, wid)
        flow = team_workflows.adopt(d, workspace)
        members, channels = team_workflows.references(d, workspace)
        executor = next(m for m in members if m["role"] == "executor")
        assert executor["absent"]
        # The built-in research flow names the executor and distiller; it still validates.
        team_rules.validate_workflow(flow, members=members, channels=channels)
        general = d.scalar(
            select(TeamChannel).where(
                TeamChannel.workspace_id == wid, TeamChannel.key == "general"
            )
        )
        message = TeamMessage(
            workspace_id=wid,
            channel_id=general.id,
            author_id=next(m["id"] for m in members if m["role"] == "owner"),
            text="go",
            kind="text",
            mentions=[],
            data={},
        )
        d.add(message)
        d.flush()
        team_workflows.apply(
            d,
            workspace,
            message,
            flow,
            [{"action": "wake", "member": executor["id"], "rule": "test"}],
        )
        d.commit()
    assert "executor" in present(app, wid)
    with app.state.maker() as d:
        assert d.scalar(
            select(TeamDelivery).where(TeamDelivery.member_id == executor["id"])
        )


def test_one_colleague_one_definition_across_projects(world):
    from backend.team_members import MemberConfig

    app, a, _, _, _, model, wid, base, _ = world
    other = a.post("/api/v1/research/workspaces", json={"name": "Second"}).json()["id"]
    second = f"/api/v1/research/workspaces/{other}/team"
    a.get(second)
    first_writer = a.post(base + "/members/join", json={"key": "writer"}).json()["id"]
    current = a.get(base + f"/members/{first_writer}").json()
    config = MemberConfig(
        **{
            k: current[k]
            for k in MemberConfig.model_fields
            if k in current
        }
    ).model_dump()
    config["role_description"] = "# Writer\\nShort paragraphs, numbers first."
    edited = a.patch(
        base + f"/members/{first_writer}",
        json={"config": config, "revision": current["revision"]},
    )
    assert edited.status_code == 200, edited.text
    # Joining another project brings the definition along...
    second_writer = a.post(second + "/members/join", json={"key": "writer"}).json()["id"]
    assert "numbers first" in a.get(second + f"/members/{second_writer}").json()[
        "role_description"
    ]
    # ...and a later edit in either project reaches the other.
    current = a.get(second + f"/members/{second_writer}").json()
    config["role_description"] = "# Writer\\nOne page at most."
    assert (
        a.patch(
            second + f"/members/{second_writer}",
            json={"config": config, "revision": current["revision"]},
        ).status_code
        == 200
    )
    assert "One page" in a.get(base + f"/members/{first_writer}").json()[
        "role_description"
    ]


def test_a_colleague_keeps_one_memory_across_projects(world):
    from backend import team_members
    from backend.team_memory import change

    app, a, _, settings, owner, _, wid, base, _ = world
    with app.state.maker() as d:
        change(settings, owner, "advisor", "add", "user", "Wants numbers before prose.")
        change(settings, owner, "advisor", "add", "memory", "Check seeds before ranking.")
        change(
            settings, owner, "advisor", "replace", "memory", "Check seeds and the grid edge.",
            old_text="seeds",
        )
        advisor = d.scalar(
            select(TeamMember).where(
                TeamMember.workspace_id == wid, TeamMember.role == "advisor"
            )
        )
        prompt = team_members.description(advisor)
        assert "Wants numbers before prose." in prompt
        assert "grid edge" in prompt and "before ranking" not in prompt
    other = a.post("/api/v1/research/workspaces", json={"name": "Other"}).json()["id"]
    a.get(f"/api/v1/research/workspaces/{other}/team")
    with app.state.maker() as d:
        elsewhere = d.scalar(
            select(TeamMember).where(
                TeamMember.workspace_id == other, TeamMember.role == "advisor"
            )
        )
        assert "Wants numbers before prose." in team_members.description(elsewhere)
    shown = a.get("/api/v1/research/colleagues/advisor/memory").json()
    assert shown["entries"]["user"] == ["Wants numbers before prose."]
    saved = a.put(
        "/api/v1/research/colleagues/advisor/memory",
        json={"target": "user", "entries": []},
    )
    assert saved.status_code == 200 and saved.json()["entries"]["user"] == []
    too_long = a.put(
        "/api/v1/research/colleagues/advisor/memory",
        json={"target": "user", "entries": ["x" * 2000]},
    )
    assert too_long.status_code == 422
    assert a.get("/api/v1/research/colleagues/nobody/memory").status_code == 404


def test_members_edit_their_memory_with_the_tool(world):
    from backend import research_team_tools
    from backend.team_memory import read

    app, _, _, settings, owner, _, wid, _, overview = world
    advisor = next(m["id"] for m in overview["members"] if m["role"] == "advisor")
    general = next(c["id"] for c in overview["channels"] if c["key"] == "general")
    info = {"workspace_id": wid, "member_id": advisor, "channel_id": general}
    call = research_team_tools._call
    result = call(app, owner, info, "team_memory", {
        "action": "add", "target": "memory", "content": "Plots go in shared/figures.",
    })
    assert result["entries"] == ["Plots go in shared/figures."]
    with pytest.raises(ValueError):
        call(app, owner, info, "team_memory", {
            "action": "remove", "target": "memory", "old_text": "missing",
        })
    assert read(settings, owner, "advisor")["memory"] == ["Plots go in shared/figures."]
    names = {t["name"] for t in research_team_tools.TEAM_TOOLS}
    assert "team_memory" in names


def test_the_personal_space_has_everyone_from_the_start(world):
    app, a, *_ = world
    navigation = a.get("/api/v1/research/navigation").json()
    spaces = [w for w in navigation["workspaces"] if w["kind"] == "personal"]
    assert len(spaces) == 1 and spaces[0]["location"]["kind"] == "managed"
    assert present(app, spaces[0]["id"]) == {
        "human",
        "advisor",
        "executor",
        "librarian",
        "reviewer",
        "writer",
        "distiller",
    }
    from backend.agent_files import workspace_instructions
    from backend.models import ResearchWorkspace

    with app.state.maker() as d:
        note = workspace_instructions(d.get(ResearchWorkspace, spaces[0]["id"]))
        assert "not a project" in note and "do not browse" in note
    # Opening it again does not make another.
    again = a.get("/api/v1/research/navigation").json()
    assert sum(w["kind"] == "personal" for w in again["workspaces"]) == 1


def test_how_many_colleagues_work_at_once_is_the_researchers_choice(tmp_path):
    from types import SimpleNamespace

    from backend import research_settings

    settings = SimpleNamespace(storage=str(tmp_path / "files"))
    assert research_settings.agents_at_once(settings) == 4
    research_settings.update(settings, {"agents_at_once": 9})
    assert research_settings.agents_at_once(settings) == 9
    research_settings.update(settings, {"agents_at_once": 99})
    assert research_settings.agents_at_once(settings) == 16


def test_watching_a_colleague_finds_their_current_work_anywhere(world):
    app, a, _, _, _, _, wid, base, _ = world
    send(world, "@写手 把结论整理成一段话")
    with app.state.maker() as d:
        writer = d.scalar(
            select(TeamMember).where(
                TeamMember.workspace_id == wid, TeamMember.role == "writer"
            )
        ).id
    current = a.get(base + f"/members/{writer}/run").json()
    assert current["author_id"] == writer and current["run"]["status"] in {
        "queued",
        "running",
    }
    advisor = next(m["id"] for m in a.get(base).json()["members"] if m["role"] == "advisor")
    assert a.get(base + f"/members/{advisor}/run").json() is None


def test_a_colleagues_thinking_strength_goes_with_their_runs(world):
    from backend.models import AgentRun
    from backend.team_members import MemberConfig

    app, a, _, _, _, _, wid, base, _ = world
    writer = a.post(base + "/members/join", json={"key": "writer"}).json()["id"]
    current = a.get(base + f"/members/{writer}").json()
    config = MemberConfig(
        **{k: current[k] for k in MemberConfig.model_fields if k in current}
    ).model_dump()
    assert config["reasoning_effort"] == "default"
    config["reasoning_effort"] = "high"
    saved = a.patch(
        base + f"/members/{writer}",
        json={"config": config, "revision": current["revision"]},
    )
    assert saved.status_code == 200, saved.text
    assert "effort: high" in a.get(base + f"/members/{writer}").json()["source"]
    send(world, "@写手 写一段摘要")
    with app.state.maker() as d:
        run = d.scalars(select(AgentRun).order_by(AgentRun.created_at.desc())).first()
        assert run.runtime["model_options"] == {"reasoning_effort": "high"}


def test_a_colleagues_conversations_list_where_they_work(world):
    app, a, _, _, _, _, wid, base, overview = world
    send(world, "@写手 把结论整理成一段话")
    with app.state.maker() as d:
        writer = d.scalar(
            select(TeamMember).where(
                TeamMember.workspace_id == wid, TeamMember.role == "writer"
            )
        ).id
    rows = a.get(base + f"/members/{writer}/conversations").json()
    general = next(c["id"] for c in overview["channels"] if c["key"] == "general")
    assert rows[0]["channel_id"] == general and rows[0]["thread_id"] is None
    assert rows[0]["title"].startswith("#") and rows[0]["status"] in {
        "queued",
        "running",
        "completed",
    }
