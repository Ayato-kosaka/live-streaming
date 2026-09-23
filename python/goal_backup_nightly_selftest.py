"""毎晩の写し（`goal_backup_nightly.yml`）の**繋ぎと既定**を見る。

    python3 python/goal_backup_nightly_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**
（`docs/island-standards.md` §15）。

ネットにも Firestore にも出ない。読むのは `.github/workflows/` の字だけ。

## なぜ要るか

`python/admin/goal_backup.py` の**中身**は
`python/admin/goal_backup_selftest.py` が見ている（合わなければ書かない・
数分おいて1回だけ・書かずに緑・3晩続けて赤・書けたら連続を戻す）。
あれは「回れば正しく写せるか」の見張り。

**ここが見るのは「そもそも回るか」。** 回らないほうは、こういう形で壊れる。

| 壊れかた | どう見えるか |
| --- | --- |
| 繋ぎ先の `name:` があちらで変わった | **黙って切れる。赤くならない。走らなくなるだけ** |
| 毎晩ぶんの既定が下見になった | run は毎晩緑なのに、控えは1日も新しくならない（#144 の裏返し） |
| `workflow_dispatch` の `dry_run` が効かない | 手で「見るだけ」のつもりで押した回が、控えに書く |
| 繋ぎ先が2本に増えた | 1晩に2回走って、合わない晩の待ち（6分）を2回払う |
| cron を既存とぶつけた | 混む時間に積み上がって、遅れがさらに延びる |
| 回す前の見張りが消えた・後ろへ動いた | 決めが変わったまま、その晩の控えに触る |
| `continue-on-error` が付いた | **写せていないのに run は緑**。誰も見ていない時間なので気づく道が無い |

**7つとも赤くならない。** だから字で突き合わせる。

## 見るもの（足は12本）

  1. `つなぎ` … `workflow_run` の繋ぎ先が1本以上ある
  2. `名前`   … 繋ぎ先の字が、**実在するファイルの `name:` と一字一句同じ**
  3. `本数`   … 繋ぎ先が**ちょうど1本**
  4. `保険`   … cron が1本以上ある（繋ぎが切れたときの保険）
  5. `時間帯` … その cron が、**ほかのワークフローの cron と重なっていない**
  6. `既定`   … 繋ぎ／cron で来た回は**下見にならない**（実際に shell を回して見る）
  7. `手押し` … `workflow_dispatch` の `dry_run` が効く（true→下見 / false→書く）
  8. `入力`   … `dry_run` が boolean・既定 true で定義されている
  9. `env`    … `inputs.dry_run` を読むのは**決めかたの step の1か所だけ**
 10. `実行`   … 下見の枝は `{}`、そうでない枝は `{"apply": true}` を渡している
 11. `見張り` … `goal_backup_selftest.py` を回す step が、**控えに触る step より前**にある
 12. `隠し`   … `continue-on-error` が無く、**偽の `python` に 1 を返させても
                step が落ちる**（`|| true` でも `set +e` でも同じように隠れるので、
                字を眺めず実際に回す。#132 は step に、#144 は回しかたに付いていた）

6 と 7 は**字を眺めるのではなく、その step の `run:` をそのまま bash で回して**
`$GITHUB_ENV` に何が書かれるかを読む。条件の書き間違い（`=` と `!=` の取り違え、
空文字の扱い）は、眺めていても出ない。

## 対照（本物の判定を1つも出す前に、毎回）

**足を1本ずつ抜いて、そのたび落ちること**まで見る
（`docs/island-standards.md` §15「対照は、足の数だけ用意する」）。
その前に**壊していない写しが通ること**を先に見る（`island-misses.md` #99）。

`名前` の対照は2通り当てる。

  - こちらの繋ぎ先の字を1文字変える
  - **あちらのファイルの `name:` を書き換えた写しの置き場**で見る
    ← 本番で起きるのはこちら
"""

from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
WFDIR = REPO / ".github" / "workflows"
YML = WFDIR / "goal_backup_nightly.yml"

# 「押しかた」を決めている step の名前と、そこが立てる env の名前。
# **字で持つ。** ここがワークフロー側と食い違ったら、下の `step_run()` が
# 見つけられずに落ちる（黙って 0件 にしない）
DECIDE_STEP = "今回の押しかたを決める"
RUN_STEP = "控えを写す"
FLAG = "GOAL_DRY"

# 回す前の見張り。**step の名前ではなく、回している中身で探す。**
# 名前は読みやすさのために変わりうるが、何を回しているかは変わらない
WATCH_PY = "goal_backup_selftest.py"

# 対照で足を抜くときの差し込み口（`id:` の行そのもの）
RUN_ID = "        id: backup\n"

# 見張りの step まるごと（`見張り` の対照で後ろへ動かす）
WATCH_BLOCK = (
    "      - name: 写しかたが変わっていないか\n"
    "        run: python3 python/admin/goal_backup_selftest.py\n"
)

LEGS = ("つなぎ", "名前", "本数", "保険", "時間帯", "既定", "手押し", "入力",
        "env", "実行", "見張り", "隠し")

FAILS: list[str] = []


def say(ok: bool, line: str) -> None:
    print(("  OK   " if ok else "  NG   ") + line)
    if not ok:
        FAILS.append(line)


def die(why: str) -> None:
    """**数えるものが無い。** 判定を1つも出さずに 2。"""
    print(f"✕ 数えるものがありません: {why}")
    raise SystemExit(2)


# ---------------------------------------------------------------- 読む


def load(text: str) -> dict:
    doc = yaml.safe_load(text)
    if not isinstance(doc, dict):
        raise ValueError("ワークフローが辞書として読めません")
    return doc


def on_of(doc: dict):
    """`on:` を取る。**PyYAML は `on` を真偽値 True の鍵にする**（YAML 1.1）。"""
    if "on" in doc:
        return doc["on"]
    return doc.get(True)


def steps_of(doc: dict) -> list[dict]:
    out = []
    for job in (doc.get("jobs") or {}).values():
        for st in (job or {}).get("steps") or []:
            if isinstance(st, dict):
                out.append(st)
    return out


def step_at(doc: dict, pred) -> int | None:
    """`pred` が当たる step の**並び順**を返す。無ければ None。"""
    for i, st in enumerate(steps_of(doc)):
        if pred(st):
            return i
    return None


def step_run(doc: dict, name: str) -> str | None:
    for st in steps_of(doc):
        if st.get("name") == name:
            run = st.get("run")
            return run if isinstance(run, str) else None
    return None


def bash(script: str, event: str, in_dry: str) -> tuple[str | None, str]:
    """step の `run:` をそのまま bash で回して、`$GITHUB_ENV` の旗を読む。"""
    with tempfile.TemporaryDirectory() as box:
        sh = Path(box) / "step.sh"
        env_file = Path(box) / "env"
        sh.write_text(script, encoding="utf-8")
        env_file.write_text("", encoding="utf-8")
        r = subprocess.run(
            ["bash", str(sh)],
            capture_output=True, text=True, timeout=30,
            env={
                "PATH": "/usr/bin:/bin",
                "EVENT": event,
                "IN_DRY": in_dry,
                "GITHUB_ENV": str(env_file),
            },
        )
        got = None
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith(f"{FLAG}="):
                got = line.split("=", 1)[1].strip()
        return got, (r.stdout + r.stderr).strip()


def bash_code(script: str, py_exit: int, flag: str = "0") -> int:
    """step の `run:` を、**偽の `python`** を掴ませて回し、終了コードを返す。

    赤くなるかは字を眺めても出ない。`|| true` でも `; exit 0` でも `set +e` でも
    同じように**隠れる**ので、**実際にその終了コードを返させて、step が落ちるか**
    を見る。
    """
    with tempfile.TemporaryDirectory() as box:
        stub = Path(box) / "python"
        stub.write_text(f"#!/bin/sh\nexit {py_exit}\n", encoding="utf-8")
        stub.chmod(0o755)
        sh = Path(box) / "step.sh"
        sh.write_text(script, encoding="utf-8")
        r = subprocess.run(
            ["bash", str(sh)],
            capture_output=True, text=True, timeout=30,
            env={"PATH": f"{box}:/usr/bin:/bin", FLAG: flag},
        )
        return r.returncode


def names_in(wfdir: Path) -> dict[str, str]:
    """置き場にあるワークフローの `name:` → ファイル名。**字のまま持つ。**"""
    out: dict[str, str] = {}
    for p in sorted(list(wfdir.glob("*.yml")) + list(wfdir.glob("*.yaml"))):
        for line in p.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^name:\s*(.+?)\s*$", line)
            if m:
                out[m.group(1).strip("'\"")] = p.name
                break
    return out


def crons_in(wfdir: Path, skip: Path) -> dict[str, str]:
    """置き場のほかのワークフローが押さえている cron → ファイル名。

    **字ではなく、分と時だけを見る。** 曜日の違うもの（週1）とも重ねない——
    その曜日だけ2本が同じ分に立ち上がるのは、いちばん見つけにくい形。

    Args:
        wfdir: ワークフローの置き場
        skip: 自分（数えない）

    Returns:
        "分 時" → ファイル名
    """
    out: dict[str, str] = {}
    for p in sorted(list(wfdir.glob("*.yml")) + list(wfdir.glob("*.yaml"))):
        if p.name == skip.name:
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            m = re.search(r'^\s*-\s*cron:\s*["\']([^"\']+)["\']', line)
            if m:
                bits = m.group(1).split()
                if len(bits) >= 2:
                    out.setdefault(f"{bits[0]} {bits[1]}", p.name)
    return out


# ---------------------------------------------------------------- 判定


def check(text: str, wfdir: Path) -> list[str]:
    """落ちた足の名前を返す。空なら通った。

    **例外で落ちない。** 写しを壊すと YAML として読めなくなることがあるので、
    そこも「落ちた足」として数える。
    """
    bad: list[str] = []

    def ng(leg: str, why: str) -> None:
        bad.append(f"{leg}: {why}")

    try:
        doc = load(text)
    except Exception as e:  # noqa: BLE001
        return [f"読めない: {e}"]

    on = on_of(doc)
    if not isinstance(on, dict):
        return ["読めない: on: が辞書ではありません"]

    # 1. つなぎ
    wr = on.get("workflow_run") or {}
    hooks = wr.get("workflows") if isinstance(wr, dict) else None
    hooks = [h for h in (hooks or []) if isinstance(h, str)]
    if not hooks:
        ng("つなぎ", "workflow_run の繋ぎ先が1本もありません")

    # 2. 名前（**字の突き合わせ**。あちらが改名したら、ここで赤くなる）
    have = names_in(wfdir)
    for h in hooks:
        if h not in have:
            head = h.split()[0].lower()
            near = [n for n in have if n.lower().startswith(head)]
            ng("名前",
               f"繋ぎ先 {h!r} と同じ `name:` のファイルがありません"
               f"（似た名前: {near or 'なし'}）")

    # 3. 本数
    if len(hooks) > 1:
        ng("本数",
           f"繋ぎ先が {len(hooks)} 本あります（{hooks}）。"
           "1晩に2回走ると、合わない晩の待ちを2回払います")

    # 4・5. 保険と、その時間帯
    sched = on.get("schedule") or []
    crons = [s.get("cron") for s in sched
             if isinstance(s, dict) and s.get("cron")]
    if not crons:
        ng("保険", "cron が1本もありません（繋ぎが切れたら止まったままになります）")
    else:
        taken = crons_in(wfdir, YML)
        for c in crons:
            bits = str(c).split()
            if len(bits) < 2:
                ng("時間帯", f"cron が読めません（{c!r}）")
                continue
            slot = f"{bits[0]} {bits[1]}"
            if slot in taken:
                ng("時間帯",
                   f"cron {c!r} が {taken[slot]} と同じ時刻です。"
                   "混む時間に積み上げると、遅れがさらに延びます")

    # 8. 入力
    disp = on.get("workflow_dispatch")
    inputs = (disp or {}).get("inputs") if isinstance(disp, dict) else None
    dry = (inputs or {}).get("dry_run") if isinstance(inputs, dict) else None
    if not isinstance(dry, dict):
        ng("入力", "workflow_dispatch に dry_run の入力がありません")
    else:
        if dry.get("type") != "boolean":
            ng("入力", f"dry_run の型が boolean ではありません（{dry.get('type')!r}）")
        if dry.get("default") is not True:
            ng("入力", f"dry_run の既定が true ではありません（{dry.get('default')!r}）")

    # 9. env だけを見ているか。**コメント行は数えない**——ここは
    #    「なぜ env に写すか」を注意書きとして書いてある場所でもあるので、
    #    字をそのまま数えると、説明を書き足した日に落ちる
    body_text = "\n".join(ln for ln in text.splitlines()
                          if not ln.lstrip().startswith("#"))
    hits = body_text.count("inputs.dry_run")
    if hits != 1:
        ng("env", f"`inputs.dry_run` が {hits} か所あります"
                  "（決めかたの step 1か所だけにしてください）")

    # 6・7. 決めかたを、実際に回す
    script = step_run(doc, DECIDE_STEP)
    if not script:
        ng("既定", f"step「{DECIDE_STEP}」が見つかりません")
    else:
        # 繋ぎ／cron で来た回は、押す人がいない。入力は空文字で来る
        for ev in ("schedule", "workflow_run"):
            got, out = bash(script, ev, "")
            if got != "0":
                ng("既定",
                   f"{ev} で {FLAG}={got!r}"
                   f"（0＝写す。でないと毎晩、控えが1日も新しくなりません）"
                   f" / {out[:120]}")
        for in_dry, want, why in (
            ("true", "1", "手で『見るだけ』を選んだ回"),
            ("false", "0", "手で『書く』を選んだ回"),
            ("", "1", "入力を渡さずに押した回（空文字で来る）"),
        ):
            got, out = bash(script, "workflow_dispatch", in_dry)
            if got != want:
                ng("手押し",
                   f"dry_run={in_dry!r}（{why}）で {FLAG}={got!r}"
                   f"、欲しいのは {want!r} / {out[:120]}")

    # 10・12. 控えに触る step
    sts = steps_of(doc)
    i_run = step_at(doc, lambda s: s.get("name") == RUN_STEP)
    runsh = step_run(doc, RUN_STEP)
    if not runsh:
        ng("実行", f"step「{RUN_STEP}」が見つかりません")
    else:
        dry_part, _, wet_part = runsh.partition("else")
        if '"apply": true' in dry_part:
            ng("実行", "下見の枝に apply が入っています")
        if '"apply": true' not in wet_part:
            ng("実行",
               "書く枝に `{\"apply\": true}` がありません"
               "（毎晩ぶんが下見のまま回り、控えは1日も新しくなりません）")
        if FLAG not in runsh:
            ng("実行", f"{FLAG} を見ていません（決めかたの step が効きません）")

        # 12. 隠し。**字を眺めない。偽の `python` を掴ませて、実際に落ちるか回す。**
        #     下見の枝（1）と書く枝（0）の両方で見る——片方だけに `|| true` を
        #     足した形が素通りする。
        #     **ここで見るのは 1 だけでよい**（`goal_backup.py` は 2 を返さない。
        #     合わなかった晩は 0 で、赤くなるのは3晩続いたときと壊れたときの 1）
        st = sts[i_run] if i_run is not None else {}
        if st.get("continue-on-error"):
            ng("隠し",
               "continue-on-error が付いています"
               "（写せていなくても run は緑で終わります。誰も見ていません）")
        for flag, lane in (("1", "下見の枝"), ("0", "書く枝")):
            if bash_code(runsh, 1, flag) == 0:
                ng("隠し",
                   f"{lane}で `python` が 1 を返しても step が緑で終わります。"
                   "誰も見ていない時間なので、気づく道がありません")

    # 11. 回す前の見張り（在ることと、控えに触る前にあること）
    i_watch = step_at(doc, lambda s: WATCH_PY in (s.get("run") or ""))
    if i_watch is None:
        ng("見張り",
           f"{WATCH_PY} を回す step がありません"
           "（決めが変わったまま、その晩の控えに触ります）")
    elif i_run is None:
        ng("見張り", f"step「{RUN_STEP}」が見つからないので、前後を数えられません")
    elif i_watch > i_run:
        ng("見張り",
           f"見張りが「{RUN_STEP}」より後ろ（{i_watch} > {i_run}）にあります。"
           "**触ってから見ても、触る前に止められません**")

    return bad


# ---------------------------------------------------------------- 対照


def mutate(text: str, kind: str) -> str:
    """足を1本抜いた写しを作る。"""
    if kind == "既定":
        # 毎晩ぶんの既定を下見にする（#144 の裏返し）
        tail = '" >> "$GITHUB_ENV"\n            echo "毎晩ぶん'
        return text.replace(f"{FLAG}=0{tail}", f"{FLAG}=1{tail}", 1)
    if kind == "手押し":
        return text.replace('[ "$IN_DRY" = "false" ]',
                            '[ "$IN_DRY" != "false" ]', 1)
    if kind == "名前":
        # **繋ぎの行だけ**を1文字変える（頭の説明に出てくる同じ字は触らない）
        return re.sub(r'(\n    workflows: \[.*?)Donations(.*?\]\n)',
                      r"\1Donation\2", text, count=1)
    if kind == "本数":
        return re.sub(r'\n    workflows: \["Fetch Doneru Donations"\]\n',
                      '\n    workflows: ["Fetch Doneru Donations", '
                      '"Fetch YouTube Chat Data"]\n', text, count=1)
    if kind == "つなぎ":
        return re.sub(r"\n  workflow_run:\n(?:    .*\n)+", "\n", text, count=1)
    if kind == "保険":
        return re.sub(r"\n  schedule:\n(?:    - .*\n)+", "\n", text, count=1)
    if kind == "時間帯":
        # 既に埋まっている時刻（`rebake.yml` の 01:00）へ動かす
        return re.sub(r'\n    - cron: "[^"]+"\n', '\n    - cron: "0 1 * * *"\n',
                      text, count=1)
    if kind == "入力":
        return text.replace("      dry_run:\n", "      dryrun:\n", 1)
    if kind == "env":
        return text.replace(f"${FLAG}", "${{ inputs.dry_run }}", 1)
    if kind == "実行":
        return text.replace("""ARGS='{"apply": true}'""", "ARGS='{}'", 1)
    if kind == "見張り":
        # 見張りそのものを取り上げる（step の殻は残す。**回るものだけ消える**）
        return text.replace(
            "        run: python3 python/admin/goal_backup_selftest.py\n",
            '        run: echo "回す前の見張りは省きました"\n', 1)
    if kind == "見張り(順番)":
        # 控えに触る step の**後ろ**へ動かす（触る前に止められなくなる）
        if WATCH_BLOCK not in text:
            die("見張りの step が見つからないので、順番を入れ替えられません")
        moved = text.replace(WATCH_BLOCK, "", 1)
        tail = "      - name: 落ちたときに、何が起きたのかを残す\n"
        if tail not in moved:
            die("要約の step が見つからないので、順番を入れ替えられません")
        return moved.replace(tail, WATCH_BLOCK + "\n" + tail, 1)
    if kind == "隠し":
        return text.replace(
            RUN_ID, RUN_ID + "        continue-on-error: true\n", 1)
    if kind == "隠し(|| true)":
        # #144 の形。step は在るし、ログも出るし、run も緑で終わる
        return text.replace("ARGS='{}' python goal_backup.py",
                            "ARGS='{}' python goal_backup.py || true", 1)
    raise ValueError(kind)


def renamed_dir(box: Path) -> Path:
    """**あちらのファイルの `name:` を書き換えた**置き場の写しを作る。

    本番で起きるのはこちら。こちらのワークフローは1バイトも変えていないのに、
    繋ぎ先が改名されただけで黙って切れる——それを赤くできるかを見る。
    """
    out = box / "workflows"
    shutil.copytree(WFDIR, out)
    target = out / "fetch_doneru_donations.yml"
    if not target.exists():
        die("fetch_doneru_donations.yml が置き場にありません")
    lines = target.read_text(encoding="utf-8").splitlines(keepends=True)
    for i, line in enumerate(lines):
        if line.startswith("name:"):
            lines[i] = "name: Fetch Doneru Donations (あちらで改名された)\n"
            break
    else:
        die("fetch_doneru_donations.yml に `name:` の行がありません")
    target.write_text("".join(lines), encoding="utf-8")
    return out


def drill(text: str) -> bool:
    """対照。**ぜんぶ当たったら True。**"""
    ok = True

    # #99: 壊していない写しが通ることを先に見る
    clean = check(text, WFDIR)
    print(f"  {'OK  ' if not clean else 'NG  '} [対照0] 壊していない写しは通る"
          f"（落ちた足 {len(clean)}）")
    if clean:
        for b in clean:
            print(f"         {b}")
        ok = False

    for leg in LEGS:
        bad = check(mutate(text, leg), WFDIR)
        hit = any(b.startswith(leg + ":") for b in bad)
        print(f"  {'OK  ' if hit else 'NG  '} [対照] 足「{leg}」を抜くと、"
              f"その足が落ちる（落ちた足 {len(bad)}: {[b.split(':')[0] for b in bad]}）")
        if not hit:
            ok = False

    # **見張りの対照も2通り。** 取り上げる／触ったあとへ動かす
    for kind in ("見張り(順番)", "隠し(|| true)"):
        leg = kind.split("(")[0]
        bad = check(mutate(text, kind), WFDIR)
        hit = any(b.startswith(leg + ":") for b in bad)
        print(f"  {'OK  ' if hit else 'NG  '} [対照] 「{kind}」で足「{leg}」が"
              f"落ちる（落ちた足 {len(bad)}）")
        if not hit:
            ok = False

    # **名前の対照は2通り。** こちらの字ではなく、あちらの `name:` を変える
    with tempfile.TemporaryDirectory() as box:
        bad = check(text, renamed_dir(Path(box)))
        hit = any(b.startswith("名前:") for b in bad)
        print(f"  {'OK  ' if hit else 'NG  '} [対照] **繋ぎ先のファイルが改名された**"
              f"写しの置き場で、足「名前」が落ちる（落ちた足 {len(bad)}）")
        if not hit:
            ok = False

    return ok


# ---------------------------------------------------------------- 本体


def main() -> None:
    if not YML.exists():
        die(f"{YML.relative_to(REPO)} がありません")
    text = YML.read_text(encoding="utf-8")
    if not text.strip():
        die(f"{YML.relative_to(REPO)} が空です")

    print(f"見張り: {YML.relative_to(REPO)}")
    print(f"置き場のワークフロー: {len(names_in(WFDIR))}本\n")

    print("対照（**本物の判定を1つも出す前に**、足を1本ずつ抜く）")
    if not drill(text):
        print("\n✕ 対照が外れました。**本物の判定を1つも出していません**")
        raise SystemExit(2)

    print(f"\n本物（足 {len(LEGS)}本）")
    bad = check(text, WFDIR)
    for leg in LEGS:
        hits = [b for b in bad if b.startswith(leg + ":")]
        why = hits[0].split(": ", 1)[1] if hits else "通った"
        say(not hits, f"{leg}: {why}")
    for b in bad:
        if not any(b.startswith(leg + ":") for leg in LEGS):
            say(False, b)

    print()
    if FAILS:
        print(f"✕ {len(FAILS)} 本落ちた")
        raise SystemExit(1)
    print(f"○ 足 {len(LEGS)}本、ぜんぶ通った")


if __name__ == "__main__":
    main()
