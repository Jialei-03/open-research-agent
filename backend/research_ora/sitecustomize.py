"""Loaded by every experiment's Python (this folder is on its PYTHONPATH).

An experiment may log with SwanLab directly:

    import swanlab
    swanlab.init(project="mnist", config={"lr": 1e-3})
    swanlab.log({"train_loss": loss, "test_acc": acc}, step=epoch)

What it logs is also written where the research system reads it while the job
runs (the same files and lines as the `ora` module), so its numbers show live
and can be cited. Without an API key SwanLab runs offline, its files in the
job's own folder; the system uploads them afterwards if a tracker is set.
Nothing here may stop an experiment: every failure is ignored. Python 3.6+.
"""

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_DIR = os.environ.get("ORA_RUN_DIR", "")


def _chain():
    # A sitecustomize further down the path (the distribution's own) still runs.
    try:
        import importlib.machinery
        import importlib.util

        path = [p for p in sys.path if os.path.abspath(p or ".") != _HERE]
        spec = importlib.machinery.PathFinder.find_spec("sitecustomize", path)
        if spec and spec.loader and spec.origin:
            spec.loader.exec_module(importlib.util.module_from_spec(spec))
    except Exception:
        pass


def _scalars(values):
    out = {}
    try:
        items = dict(values).items()
    except Exception:
        return out
    for key, value in items:
        if hasattr(value, "item"):
            try:
                value = value.item()  # numpy and torch scalars
            except Exception:
                continue
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            out[str(key)] = value
    return out


def _note(module, run):
    """Where this run's SwanLab files are, and its page if it is online."""
    import json

    info = {"mode": str(getattr(run, "mode", "") or os.environ.get("SWANLAB_MODE", ""))}
    for name in ("url", "dir", "id"):
        try:
            value = getattr(run, name)
        except Exception:
            continue
        if value:
            info[name] = str(value)
    try:
        with open(os.path.join(_DIR, "swanlab.json"), "w") as f:
            json.dump(info, f)
    except Exception:
        pass
    try:
        config = getattr(module, "config", None)
        values = {str(k): config[k] for k in list(config.keys())} if config else {}
        if values:
            import ora

            ora.config(values)
    except Exception:
        pass


def _patch(module):
    import ora

    def wraps(owner, name, around):
        original = getattr(owner, name, None)
        if original is None or getattr(original, "_ora", False):
            return
        wrapped = around(original)
        wrapped._ora = True
        setattr(owner, name, wrapped)

    def log(original):
        def call(*args, **kwargs):
            result = original(*args, **kwargs)
            try:
                rest = list(args[1:] if args and not isinstance(args[0], dict) else args)
                data = kwargs.get("data", rest[0] if rest else {})
                step = kwargs.get("step", rest[1] if len(rest) > 1 else None)
                values = _scalars(data)
                if values:
                    ora.log(values, step=step if isinstance(step, int) else None)
            except Exception:
                pass
            return result

        return call

    def init(original):
        def call(*args, **kwargs):
            run = original(*args, **kwargs)
            _note(module, run)
            return run

        return call

    run_class = getattr(module, "Run", None)
    if run_class is not None and hasattr(run_class, "log"):
        wraps(run_class, "log", log)
    else:
        wraps(module, "log", log)  # older SwanLab: a module function
    wraps(module, "init", init)


class _Finder(object):
    """Patches SwanLab once, as it is first imported."""

    def find_spec(self, name, path=None, target=None):
        if name != "swanlab":
            return None
        try:
            sys.meta_path.remove(self)
        except ValueError:
            pass
        try:
            import importlib.util

            spec = importlib.util.find_spec(name)
        except Exception:
            return None
        if spec is None or spec.loader is None or not hasattr(spec.loader, "exec_module"):
            return spec
        run = spec.loader.exec_module

        def exec_module(module):
            run(module)
            try:
                _patch(module)
            except Exception:
                pass

        spec.loader.exec_module = exec_module
        return spec


_chain()
if _DIR:
    if not os.environ.get("SWANLAB_API_KEY"):
        os.environ.setdefault("SWANLAB_MODE", "offline")
    os.environ.setdefault("SWANLAB_LOG_DIR", os.path.join(_DIR, "swanlog"))
    sys.meta_path.insert(0, _Finder())
