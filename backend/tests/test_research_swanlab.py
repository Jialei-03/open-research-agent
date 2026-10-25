"""Experiments that log with SwanLab directly show their numbers live, as `ora` does."""

import json
import time

import pytest

from backend import research_map as rm
from backend import research_sandbox as rs
from backend import research_tracker as rt
from backend.config import Settings, database
from backend.models import Base, ResearchJob, ResearchProject, ResearchSprint, User
from backend.tests.test_agents import configure
from backend.tests.test_research_routes import BASE, create
from backend.tests.test_acceptance import env as cloud_env  # noqa: F401
from backend.tests.test_research_routes import env  # noqa: F401

# A stand-in for the SwanLab SDK with the same surface (init, Run.log, config):
# the hook is checked without installing it or reaching its service.
FAKE = '''
import os
config = {}
class Run:
    mode = os.environ.get("SWANLAB_MODE", "online")
    url = "https://swanlab.cn/@r/p/runs/abc" if mode == "online" else None
    id = "abc"
    def log(self, data, step=None):
        print("swanlab got", sorted(data))
_run = Run()
def init(project=None, config=None, **kwargs):
    globals()["config"].update(config or {})
    return _run
def log(data, step=None):
    return _run.log(data, step=step)
def finish():
    pass
'''

SCRIPT = """
import swanlab
run = swanlab.init(project="p", config={"lr": 0.01, "epochs": 3})
for epoch in range(3):
    swanlab.log({"loss": 1.0 / (epoch + 1), "acc": 0.5 + epoch / 10, "note": "x"}, step=epoch)
run.log({"final": 0.9})
print("offline" if run.mode == "offline" else run.url)
"""


@pytest.fixture
def world(tmp_path):
    settings = Settings(
        database_url="sqlite:///" + str(tmp_path / "s.db"),
        storage=str(tmp_path / "files"),
        testing=True,
    )
    engine, maker = database(settings)
    Base.metadata.create_all(engine)
    with maker() as d:
        user = User(username="r", password="x")
        d.add(user)
        d.flush()
        p = rm.create_project(d, user.id, "Q", "", "m")
        p.stage, p.compute_id = "experiments", "host"
        d.commit()
        pid = p.id
    yield settings, maker, pid
    engine.dispose()


def _run(settings, maker, pid, monkeypatch):
    monkeypatch.delenv("SWANLAB_API_KEY", raising=False)
    monkeypatch.delenv("SWANLAB_MODE", raising=False)
    with maker() as d:
        p = d.get(ResearchProject, pid)
        node = rm.root(d, p)
        sprint = ResearchSprint(project_id=p.id, number=1, run_id="r")
        d.add(sprint)
        d.flush()
        work = rs.workdir(settings, p.id)
        (work / "swanlab").mkdir()
        (work / "swanlab" / "__init__.py").write_text(FAKE)
        (work / "t.py").write_text(SCRIPT)
        job = rs.start_job(settings, d, p, node, sprint, "python3 t.py", 60)
        end = time.time() + 15
        while time.time() < end and job.status == "running":
            rs._sweep_one(settings, d, job)
            time.sleep(0.2)
        d.commit()
        return job.id


def test_what_swanlab_logs_is_read_live_and_offline_by_default(world, monkeypatch):
    settings, maker, pid = world
    job_id = _run(settings, maker, pid, monkeypatch)
    with maker() as d:
        job = d.get(ResearchJob, job_id)
        assert job.status == "succeeded"
        # Numbers only (the note is not one), with their steps, as `ora` writes them.
        assert [
            (r["step"], r.get("loss"), r.get("final"))
            for r in rs.series(settings, job)
        ] == [(0, 1.0, None), (1, 0.5, None), (2, 1 / 3, None), (None, None, 0.9)]
        assert job.config == {"lr": 0.01, "epochs": 3}
        assert job.points == 4 and job.metrics["acc"] == pytest.approx(0.7)
        lines = [line["text"] for line in rs.read_log(settings, job, 0, 50)["lines"]]
        assert "ORA_METRIC step=0 loss=1 acc=0.5" in lines
        # The SDK still got everything it was given.
        assert "swanlab got ['acc', 'loss', 'note']" in lines
        # No key: SwanLab stays offline, its files in the job's own folder.
        assert lines[-1] == "offline"
        note = json.loads(
            (rs.rundir(settings, pid, job_id) / "swanlab.json").read_text()
        )
        assert note["mode"] == "offline" and "url" not in note


def test_a_run_already_on_swanlab_is_not_mirrored_again(world, monkeypatch):
    settings, maker, pid = world
    calls = []
    monkeypatch.setattr(rt.subprocess, "run", lambda *a, **k: calls.append(a))
    with maker() as d:
        job = ResearchJob(
            project_id=pid, node_id="n", sprint_id="s", command="x",
            status="succeeded", compute_id="host",
        )
        d.add(job)
        d.flush()
        # The experiment logged in with its own key: SwanLab noted its page.
        (rs.rundir(settings, pid, job.id) / "swanlab.json").write_text(
            json.dumps({"mode": "online", "url": "https://swanlab.cn/@r/p/runs/abc"})
        )
        rt.sync_one(settings, d, job)
        assert job.tracker_url == "https://swanlab.cn/@r/p/runs/abc"
        assert calls == []


def test_the_researcher_stops_one_experiment(env, monkeypatch):  # noqa: F811
    app, a, _b, settings = env
    _, model = configure(app, a, settings)
    pid = create(a, model).json()["id"]
    stopped = []
    monkeypatch.setattr(rs, "stop_job", lambda s, d, job: stopped.append(job.id))
    with app.state.maker() as d:
        job = ResearchJob(
            project_id=pid,
            node_id="n",
            sprint_id="s",
            command="python train.py",
            status="running",
            compute_id="host",
        )
        d.add(job)
        d.commit()
        job_id = job.id
    assert a.post(f"{BASE}/{pid}/jobs/{job_id}/stop").status_code == 200
    assert stopped == [job_id]
    assert a.post(f"{BASE}/{pid}/jobs/missing/stop").status_code == 404
