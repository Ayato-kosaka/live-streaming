"""控えの写し（`goal_backup_nightly.yml`）が**毎晩に繋がっていないこと**と、
**押しかたが効くこと**を見る。

    python3 python/goal_backup_nightly_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**
（`docs/island-standards.md` §15）。

ネットにも Firestore にも出ない。読むのは `.github/workflows/` の字だけ。

## 向きが逆になった（2026-09-23。#305）

**2026-09-22 まで、ここは「繋ぎが生きているか」を見ていた。**
`workflow_run` の字と実在するファイルの `name:` を突き合わせ、cron が1本
在ることと、毎晩ぶんの既定が下見に化けていないことを見ていた（足12本）。

**その繋ぎを外した**（`goal_backup_nightly.yml` の頭の「毎晩ぶんは畳んだ」）。
`GET /fund` が額を `islandGoal` から1円も読まなくなったので、毎晩写しても
新しくなるものが無い。そして `goal_migrate.py` の止め金（GAS と本番が1円まで
合うこと）が、**GAS が凍った時点で必ず外れる**——繋いだままにすると
**毎晩赤くなり、読まれない赤の中に本物の赤が埋もれる。**

**外したあとも前の足をそのまま置いておくと「空回しの緑」になる**
（`docs/island-misses.md` #144）。繋ぎが無いのに「繋ぎが生きているか」を見ても、
見るものが1つも無いだけで緑が出る。だから**向きを裏返した**——
いま見るのは **「繋ぎが戻っていないか」。書き戻したら赤くなる。**

## なぜ要るか

`python/admin/goal_backup.py` の**中身**は
`python/admin/goal_backup_selftest.py` が見ている（合わなければ書かない・
数分おいて1回だけ・書かずに緑・3回続けて赤・書けたら連続を戻す）。
あれは「回れば正しく写せるか」の見張り。

**ここが見るのは「どう回るか」。** そちらは、こういう形で壊れる。

| 壊れかた | どう見えるか |
| --- | --- |
| **`workflow_run` が書き戻された** | GAS がもう伸びないので **3回で赤。そのあとずっと赤い** |
| **cron が書き戻された** | 同じ。しかも押した人がいないので誰も見ない |
| `workflow_dispatch` の `dry_run` が効かない | 手で「見るだけ」のつもりで押した回が、控えに書く |
| 入力を渡さずに押した回が「書く」に倒れる | 同じ。API から押すと空文字で来る |
| 回す前の見張りが消えた・後ろへ動いた | 決めが変わったまま、その回の控えに触る |
| `continue-on-error` が付いた | **写せていないのに run は緑**。押した人がログを開くとはかぎらない |

**6つとも赤くならない。** だから字で突き合わせる。

## 見るもの（足は8本）

  1. `毎晩なし` … `workflow_run` の繋ぎが**無い**
  2. `保険なし` … cron が**無い**
  3. `手押し`   … `dry_run` が効く（true→下見 / false→書く / **空文字→下見**）。
                  **実際に shell を回して見る**
  4. `入力`     … `workflow_dispatch` に `dry_run` が boolean・既定 true で在る
  5. `env`      … `inputs.dry_run` を読むのは**決めかたの step の1か所だけ**
  6. `実行`     … 下見の枝は `{}`、そうでない枝は `{"apply": true}` を渡している
  7. `見張り`   … `goal_backup_selftest.py` を回す step が、**控えに触る step より前**
  8. `隠し`     … `continue-on-error` が無く、**偽の `python` に 1 を返させても
                  step が落ちる**（`|| true` でも `set +e` でも同じように隠れるので、
                  字を眺めず実際に回す。#132 は step に、#144 は回しかたに付いていた）

3 は**字を眺めるのではなく、その step の `run:` をそのまま bash で回して**
`$GITHUB_ENV` に何が書かれるかを読む。条件の書き間違い（`=` と `!=` の取り違え、
空文字の扱い）は、眺めていても出ない。

## 対照（本物の判定を1つも出す前に、毎回）

**足を1本ずつ抜いて、そのたび落ちること**まで見る
（`docs/island-standards.md` §15「対照は、足の数だけ用意する」）。
その前に**壊していない写しが通ること**を先に見る（`island-misses.md` #99）。

`毎晩なし` と `保険なし` の対照は、**外したものを書き戻す。**
本番で起きるのはそれ（「毎晩に戻したほうが安心では」と足される）。
**2本まとめて書き戻す回も見る**——1本ずつしか当てないと、
「どちらか在れば通る」形に畳んだ判定が素通りする。
"""

from __future__ import annotations

import re
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

# **`on:` の中へ差し込む口。** 書き戻す対照はここに足す
DISPATCH_LINE = "  workflow_dispatch:\n"

LEGS = ("毎晩なし", "保険なし", "手押し", "入力", "env", "実行", "見張り", "隠し")

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


def bash(script: str, in_dry: str) -> tuple[str | None, str]:
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
    """置き場にあるワークフローの `name:` → ファイル名。**分母として数えるだけ。**"""
    out: dict[str, str] = {}
    for p in sorted(list(wfdir.glob("*.yml")) + list(wfdir.glob("*.yaml"))):
        for line in p.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^name:\s*(.+?)\s*$", line)
            if m:
                out[m.group(1).strip("'\"")] = p.name
                break
    return out


# ---------------------------------------------------------------- 判定


def check(text: str) -> list[str]:
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

    # 1. 毎晩なし。**繋ぎが戻っていないか**
    wr = on.get("workflow_run")
    if wr:
        hooks = wr.get("workflows") if isinstance(wr, dict) else wr
        ng("毎晩なし",
           f"workflow_run が戻っています（{hooks}）。"
           "GAS はもう伸びないので、3回で赤になったあとずっと赤くなります"
           "（`goal_backup_nightly.yml` の「毎晩ぶんは畳んだ」）")

    # 2. 保険なし。cron も同じ
    sched = on.get("schedule")
    if sched:
        crons = [s.get("cron") for s in sched
                 if isinstance(s, dict) and s.get("cron")]
        ng("保険なし",
           f"cron が戻っています（{crons}）。押した人がいないので、"
           "ずっと赤いことに誰も気づけません")

    # 4. 入力
    disp = on.get("workflow_dispatch")
    if "workflow_dispatch" not in on:
        ng("入力", "workflow_dispatch がありません（押す道が1つも無くなります）")
    inputs = (disp or {}).get("inputs") if isinstance(disp, dict) else None
    dry = (inputs or {}).get("dry_run") if isinstance(inputs, dict) else None
    if not isinstance(dry, dict):
        ng("入力", "workflow_dispatch に dry_run の入力がありません")
    else:
        if dry.get("type") != "boolean":
            ng("入力", f"dry_run の型が boolean ではありません（{dry.get('type')!r}）")
        if dry.get("default") is not True:
            ng("入力", f"dry_run の既定が true ではありません（{dry.get('default')!r}）")

    # 5. env だけを見ているか。**コメント行は数えない**——ここは
    #    「なぜ env に写すか」を注意書きとして書いてある場所でもあるので、
    #    字をそのまま数えると、説明を書き足した日に落ちる
    body_text = "\n".join(ln for ln in text.splitlines()
                          if not ln.lstrip().startswith("#"))
    hits = body_text.count("inputs.dry_run")
    if hits != 1:
        ng("env", f"`inputs.dry_run` が {hits} か所あります"
                  "（決めかたの step 1か所だけにしてください）")

    # 3. 決めかたを、実際に回す
    script = step_run(doc, DECIDE_STEP)
    if not script:
        ng("手押し", f"step「{DECIDE_STEP}」が見つかりません")
    else:
        for in_dry, want, why in (
            ("true", "1", "手で『見るだけ』を選んだ回"),
            ("false", "0", "手で『書く』を選んだ回"),
            ("", "1", "入力を渡さずに押した回（空文字で来る）"),
        ):
            got, out = bash(script, in_dry)
            if got != want:
                ng("手押し",
                   f"dry_run={in_dry!r}（{why}）で {FLAG}={got!r}"
                   f"、欲しいのは {want!r} / {out[:120]}")

    # 6・8. 控えに触る step
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
               "（押しても控えが1バイトも新しくなりません）")
        if FLAG not in runsh:
            ng("実行", f"{FLAG} を見ていません（決めかたの step が効きません）")

        # 8. 隠し。**字を眺めない。偽の `python` を掴ませて、実際に落ちるか回す。**
        #     下見の枝（1）と書く枝（0）の両方で見る——片方だけに `|| true` を
        #     足した形が素通りする。
        #     **ここで見るのは 1 だけでよい**（`goal_backup.py` は 2 を返さない。
        #     合わなかった回は 0 で、赤くなるのは3回続いたときと壊れたときの 1）
        st = sts[i_run] if i_run is not None else {}
        if st.get("continue-on-error"):
            ng("隠し",
               "continue-on-error が付いています"
               "（写せていなくても run は緑で終わります）")
        for flag, lane in (("1", "下見の枝"), ("0", "書く枝")):
            if bash_code(runsh, 1, flag) == 0:
                ng("隠し",
                   f"{lane}で `python` が 1 を返しても step が緑で終わります。"
                   "押した人がログを開くとはかぎりません")

    # 7. 回す前の見張り（在ることと、控えに触る前にあること）
    i_watch = step_at(doc, lambda s: WATCH_PY in (s.get("run") or ""))
    if i_watch is None:
        ng("見張り",
           f"{WATCH_PY} を回す step がありません"
           "（決めが変わったまま、その回の控えに触ります）")
    elif i_run is None:
        ng("見張り", f"step「{RUN_STEP}」が見つからないので、前後を数えられません")
    elif i_watch > i_run:
        ng("見張り",
           f"見張りが「{RUN_STEP}」より後ろ（{i_watch} > {i_run}）にあります。"
           "**触ってから見ても、触る前に止められません**")

    return bad


# ---------------------------------------------------------------- 対照


def put_on(text: str, block: str) -> str:
    """`on:` の中へ差し込む（書き戻す対照）。"""
    if DISPATCH_LINE not in text:
        die("on: の中に workflow_dispatch の行が無いので、書き戻せません")
    return text.replace(DISPATCH_LINE, block + DISPATCH_LINE, 1)


def mutate(text: str, kind: str) -> str:
    """足を1本抜いた写しを作る。"""
    if kind == "毎晩なし":
        # **外したものを書き戻す。** 本番で起きるのはこれ
        return put_on(text, '  workflow_run:\n'
                            '    workflows: ["Fetch Doneru Donations"]\n'
                            '    types: [completed]\n')
    if kind == "保険なし":
        return put_on(text, '  schedule:\n    - cron: "30 3 * * *"\n')
    if kind == "手押し":
        return text.replace('[ "$IN_DRY" = "false" ]',
                            '[ "$IN_DRY" != "false" ]', 1)
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


def drill(text: str) -> bool:
    """対照。**ぜんぶ当たったら True。**"""
    ok = True

    # #99: 壊していない写しが通ることを先に見る
    clean = check(text)
    print(f"  {'OK  ' if not clean else 'NG  '} [対照0] 壊していない写しは通る"
          f"（落ちた足 {len(clean)}）")
    if clean:
        for b in clean:
            print(f"         {b}")
        ok = False

    for leg in LEGS:
        bad = check(mutate(text, leg))
        hit = any(b.startswith(leg + ":") for b in bad)
        print(f"  {'OK  ' if hit else 'NG  '} [対照] 足「{leg}」を抜くと、"
              f"その足が落ちる（落ちた足 {len(bad)}: {[b.split(':')[0] for b in bad]}）")
        if not hit:
            ok = False

    # **見張りと隠しの対照は2通り。** 取り上げる／触ったあとへ動かす、
    # `continue-on-error`／`|| true`
    for kind in ("見張り(順番)", "隠し(|| true)"):
        leg = kind.split("(")[0]
        bad = check(mutate(text, kind))
        hit = any(b.startswith(leg + ":") for b in bad)
        print(f"  {'OK  ' if hit else 'NG  '} [対照] 「{kind}」で足「{leg}」が"
              f"落ちる（落ちた足 {len(bad)}）")
        if not hit:
            ok = False

    # **繋ぎと cron を両方まとめて書き戻しても、2本とも落ちる。**
    # 1本ずつしか当てないと、「どちらか在れば通る」形に畳んだ判定が素通りする
    both = check(mutate(mutate(text, "毎晩なし"), "保険なし"))
    hit = (any(b.startswith("毎晩なし:") for b in both)
           and any(b.startswith("保険なし:") for b in both))
    print(f"  {'OK  ' if hit else 'NG  '} [対照] 繋ぎと cron を**両方**書き戻すと、"
          f"2本とも落ちる（落ちた足 {len(both)}）")
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
    bad = check(text)
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
