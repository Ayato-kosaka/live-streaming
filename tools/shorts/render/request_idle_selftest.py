"""**依頼を下ろしただけの push で、書き出しのワークフローが赤くならないか**を見る見張り。

`shorts_render.yml` は `paths: shorts/render/*.json` で起きる。paths の絞りは**消したファイルでも起きる**ので、
master に入れる前の片づけ（`git rm shorts/render`）の push でも prepare が走り、前は
「この push に依頼が無い」で落ちて、PR の頭に赤い prepare が残った（#1135）。

当てるもの:
1. 依頼を消しただけ → `cmd_prepare` が 0 で終わり、`GITHUB_OUTPUT` に `idle=true` を書く（GCS には触らない）
2. 依頼の置き場に触れていない → 今までどおり `Bad`（取り違えの push は落とす）
3. 依頼が在る → `read_request` まで進む（片づけと取り違えない）
4. ワークフローが `idle` を出力に持ち、render と report がそれで止まる

    python3 tools/shorts/render/request_idle_selftest.py
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import remote  # noqa: E402

WF = HERE.parents[2] / ".github" / "workflows" / "shorts_render.yml"
fails: list[str] = []


def check(name: str, ok: bool) -> None:
    print(("○ " if ok else "✕ ") + name)
    if not ok:
        fails.append(name)


def with_push(td: Path, changed: list[str], present: list[str]):
    """compare_files と ROOT と push の event を差し替える。"""
    root = td / "root"
    for f in present:
        (root / f).parent.mkdir(parents=True, exist_ok=True)
        (root / f).write_text("{}", encoding="utf-8")
    root.mkdir(exist_ok=True)
    ev = td / "event.json"
    ev.write_text(json.dumps({"before": "a" * 40, "after": "b" * 40}), encoding="utf-8")
    os.environ["GITHUB_EVENT_PATH"] = str(ev)
    out = td / "out.txt"
    out.write_text("", encoding="utf-8")
    os.environ["GITHUB_OUTPUT"] = str(out)
    remote.ROOT = root
    remote.compare_files = lambda before, head: list(changed)
    return out


def main() -> int:
    def no_storage():
        raise AssertionError("片づけの push で GCS に触った")

    remote.storage = no_storage

    with tempfile.TemporaryDirectory() as t:
        out = with_push(Path(t), ["shorts/render/old-p1-v3.json", "shorts/.work/render/old/x.enc"], [])
        try:
            rc = remote.cmd_prepare()
            err = ""
        except Exception as e:  # noqa: BLE001
            rc, err = None, f"{type(e).__name__}: {e}"
        check(f"依頼を消しただけの push は 0 で終わる（{rc if err == '' else err}）", rc == 0)
        check("そのとき GITHUB_OUTPUT に idle=true を書く", "idle=true" in out.read_text(encoding="utf-8"))

    with tempfile.TemporaryDirectory() as t:
        with_push(Path(t), ["shorts/videos/x/p1/plan.md"], [])
        try:
            remote.the_request()
            got = "通った"
        except remote.Bad as e:
            got = f"Bad（{e}）"
        except Exception as e:  # noqa: BLE001
            got = type(e).__name__
        check(f"依頼の置き場に触れていない push は Bad で落とす（{got}）", got.startswith("Bad"))

    with tempfile.TemporaryDirectory() as t:
        with_push(Path(t), ["shorts/render/new-p1-v1.json", "shorts/render/old-p1-v3.json"],
                  ["shorts/render/new-p1-v1.json"])
        seen = []
        remote.read_request = lambda req, origin: seen.append(origin) or {"name": "x"}
        try:
            remote.the_request()
        except Exception as e:  # noqa: BLE001
            seen.append(f"{type(e).__name__}: {e}")
        check(f"依頼が在れば read_request まで進む（{seen}）", seen == ["shorts/render/new-p1-v1.json"])

    y = WF.read_text(encoding="utf-8")
    check("prepare が idle を出力に持つ", "idle: ${{ steps.prep.outputs.idle }}" in y)
    render = y.split("\n  render:\n", 1)[-1].split("\n  report:\n", 1)[0]
    check("render が idle で止まる", "needs.prepare.outputs.idle != 'true'" in render.split("strategy:", 1)[0])
    report = y.split("\n  report:\n", 1)[-1].split("runs-on:", 1)[0]
    check("report が idle で止まる", "needs.prepare.outputs.idle != 'true'" in report)

    print(f"\n{'✕ ' + str(len(fails)) + '件' if fails else '○ 全部通った'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
