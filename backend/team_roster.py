"""Colleagues belong to the researcher, not to a project.

Each built-in role and each library entry is one colleague. A project holds
the colleagues the researcher brought in (a TeamMember row each, with its own
session). The others are "absent": the workflow can still name them, and they
join the project the first time a rule or a mention calls on them.
"""

from sqlalchemy import select

from .models import AgentSession, MemberLibrary, TeamChannel, TeamMember, TeamMessage, now

# Who a new project starts with, besides the researcher.
DEFAULT = ("advisor",)


def builtin_roles():
    from .research_team import ROLES

    return [role for role in ROLES if role != "human"]


def key_of(member):
    """The colleague a project member is: its built-in role or library entry."""
    if member.role in builtin_roles():
        return member.role
    if member.library_id:
        return f"lib:{member.library_id}"
    return f"member:{member.id}"


def member_id(workspace, key):
    from .research_team import stable

    return stable(workspace, key)


def colleagues(d, owner):
    """Everyone on the researcher's roster: built-ins first, then library entries."""
    from .agent_files import read_library
    from .research_team import ROLES

    rows = [
        {"key": role, "role": role, "name": ROLES[role][0], "library_id": None}
        for role in builtin_roles()
    ]
    for library in d.scalars(
        select(MemberLibrary).where(MemberLibrary.owner == owner)
    ):
        try:
            name = read_library(library)[1]["name"]
        except Exception:
            continue
        rows.append(
            {
                "key": f"lib:{library.id}",
                "role": None,
                "name": name,
                "library_id": library.id,
            }
        )
    return rows


def absent(d, workspace, present):
    """Roster colleagues not in this project, as workflow members that can be called on."""
    here = {key_of(m) for m in present if not m.deleted}
    taken = {m.role for m in present}
    out = []
    for colleague in colleagues(d, workspace.owner):
        if colleague["key"] in here:
            continue
        role = colleague["role"]
        if role is None:
            # A library colleague has no role of its own until it joins.
            continue
        out.append(
            {
                "id": member_id(workspace, role)
                if role not in taken
                else next(m.id for m in present if m.role == role),
                "name": colleague["name"],
                "kind": "agent",
                "role": role,
                "enabled": True,
                "paused": False,
                "subscriptions": [],
                "absent": True,
                "key": colleague["key"],
            }
        )
    return out


def join(d, workspace, key, *, announce=True):
    """Bring a colleague into the project; returns the project's member row."""
    from .agent_files import ensure_member
    from .research_team import ROLES, stable

    if key.startswith("lib:"):
        from . import team_members

        library_id = key[4:]
        existing = d.scalar(
            select(TeamMember).where(
                TeamMember.workspace_id == workspace.id,
                TeamMember.library_id == library_id,
            )
        )
        if existing is not None:
            member = existing
            if not member.deleted and member.enabled:
                return member
            member.deleted = False
            team_members.edit(
                d, workspace, member, team_members.MemberEdit(enabled=True)
            )
        else:
            member = team_members.create(
                d,
                workspace,
                team_members.MemberCreate(library_id=library_id),
            )
    else:
        if key not in builtin_roles():
            raise ValueError("没有这位同事 / Unknown colleague")
        member = d.scalar(
            select(TeamMember).where(
                TeamMember.workspace_id == workspace.id, TeamMember.role == key
            )
        )
        if member is not None and not member.deleted:
            return member
        if member is None:
            name = ROLES[key][0]
            session = AgentSession(
                owner=workspace.owner,
                workspace_id=workspace.id,
                kind="team_member",
                title=name,
            )
            d.add(session)
            d.flush()
            member = TeamMember(
                id=stable(workspace, key),
                workspace_id=workspace.id,
                role=key,
                name=name,
                session_id=session.id,
            )
            d.add(member)
            d.flush()
        member.deleted = False
        dm = stable(workspace, f"dm:{key}")
        if d.get(TeamChannel, dm) is None:
            d.add(
                TeamChannel(
                    id=dm,
                    workspace_id=workspace.id,
                    key=f"dm:{key}",
                    name=member.name,
                    member_id=member.id,
                )
            )
        d.flush()
        ensure_member(member)
        follow(d, workspace, member)
    if announce:
        general = d.get(TeamChannel, stable(workspace, "general"))
        if general is not None:
            d.add(
                TeamMessage(
                    workspace_id=workspace.id,
                    channel_id=general.id,
                    author_id=member.id,
                    text="加入了项目 / joined the project",
                    kind="text",
                    mentions=[],
                    data={"joined": True},
                    created_at=now(),
                )
            )
    d.flush()
    return member


def leave(d, workspace, member):
    if member.role in {"human", "advisor"}:
        raise ValueError("研究者和导师留在项目里 / The researcher and advisor stay")
    member.deleted = True
    d.flush()


def call_on(d, workspace, ids):
    """Bring in any absent colleague an action or mention names."""
    present = list(
        d.scalars(select(TeamMember).where(TeamMember.workspace_id == workspace.id))
    )
    missing = {m["id"]: m["key"] for m in absent(d, workspace, present)}
    joined = []
    for identifier in dict.fromkeys(ids):
        if identifier in missing:
            joined.append(join(d, workspace, missing[identifier]))
    return joined


def roster_out(d, owner):
    """The roster page: each colleague, the projects they are in and what they do now."""
    from .models import ResearchWorkspace

    workspaces = {
        w.id: w
        for w in d.scalars(
            select(ResearchWorkspace).where(
                ResearchWorkspace.owner == owner, ResearchWorkspace.archived.is_(False)
            )
        )
    }
    rows = (
        list(
            d.scalars(
                select(TeamMember).where(
                    TeamMember.workspace_id.in_(list(workspaces)),
                    TeamMember.deleted.is_(False),
                )
            )
        )
        if workspaces
        else []
    )
    from .research_team import active_run

    def status(member):
        if active_run(d, member, {"running"}):
            return "working"
        return "queued" if active_run(d, member) else "idle"

    states = {m.id: status(m) for m in rows}
    out = []
    for colleague in colleagues(d, owner):
        mine = [m for m in rows if key_of(m) == colleague["key"]]
        out.append(
            {
                **colleague,
                "projects": [
                    {
                        "workspace_id": m.workspace_id,
                        "workspace_name": workspaces[m.workspace_id].name,
                        "personal": workspaces[m.workspace_id].kind == "personal",
                        "member_id": m.id,
                        "status": states[m.id],
                    }
                    for m in mine
                ],
                "working": any(states[m.id] != "idle" for m in mine),
            }
        )
    return out


def spread(d, workspace, member):
    """Copy a colleague's definition to the same colleague in the owner's other projects.

    Subscriptions and on/off stay per project; so does an uploaded avatar file.
    """
    from . import agent_files as files
    from .models import ResearchWorkspace

    source, values = files.read_member(member)
    key = key_of(member)
    if member.library_id:
        library = d.get(MemberLibrary, member.library_id)
        if library is not None:
            library_values = {**values, "channels": [], "enabled": True}
            files.save_library(library, files.render(library_values, source))
            base = files.read_library(library)[0]
            files.atomic_write(
                files.state_path(files.settings_of(member), member.id, "base.md"), base
            )
    others = d.scalars(
        select(TeamMember)
        .join(ResearchWorkspace, ResearchWorkspace.id == TeamMember.workspace_id)
        .where(
            ResearchWorkspace.owner == workspace.owner,
            TeamMember.workspace_id != workspace.id,
            TeamMember.deleted.is_(False),
        )
    )
    for other in others:
        if key_of(other) != key:
            continue
        _, mine = files.read_member(other)
        merged = {
            **values,
            "channels": mine.get("channels", []),
            "enabled": mine.get("enabled", True),
        }
        if values.get("avatar", "").startswith("pixel:") or not values.get("avatar"):
            pass
        else:
            merged["avatar"] = mine.get("avatar", "")
        files.save_member(
            other, files.render(merged, source, other.role), workspace.owner
        )
        if other.library_id and member.library_id:
            files.atomic_write(
                files.state_path(files.settings_of(other), other.id, "base.md"),
                files.read_library(d.get(MemberLibrary, other.library_id))[0],
            )
        for channel in d.scalars(
            select(TeamChannel).where(TeamChannel.member_id == other.id)
        ):
            channel.name = other.name


def follow(d, workspace, member):
    """A colleague joining a project brings the definition they have elsewhere."""
    from . import agent_files as files
    from .models import ResearchWorkspace

    key = key_of(member)
    sibling = next(
        (
            other
            for other in d.scalars(
                select(TeamMember)
                .join(
                    ResearchWorkspace, ResearchWorkspace.id == TeamMember.workspace_id
                )
                .where(
                    ResearchWorkspace.owner == workspace.owner,
                    TeamMember.workspace_id != workspace.id,
                    TeamMember.deleted.is_(False),
                )
                .order_by(ResearchWorkspace.updated_at.desc())
            )
            if key_of(other) == key
        ),
        None,
    )
    if sibling is None:
        return
    source, values = files.read_member(sibling)
    _, mine = files.read_member(member)
    merged = {
        **values,
        "channels": mine.get("channels", []),
        "enabled": True,
        "avatar": values.get("avatar", "")
        if str(values.get("avatar", "")).startswith("pixel:")
        else mine.get("avatar", ""),
    }
    files.save_member(member, files.render(merged, source, member.role), workspace.owner)


PERSONAL = "个人空间"


def personal(d, owner):
    """Every researcher has one space outside projects where all colleagues are, from the start."""
    from .models import ResearchWorkspace
    from .research_team import ensure
    from .research_workspaces import create

    workspace = d.scalars(
        select(ResearchWorkspace).where(
            ResearchWorkspace.owner == owner, ResearchWorkspace.kind == "personal"
        )
    ).first()
    if workspace is not None:
        return workspace
    workspace = create(d, owner, PERSONAL, kind="personal")
    ensure(d, workspace)
    for role in builtin_roles():
        join(d, workspace, role, announce=False)
    d.flush()
    return workspace
