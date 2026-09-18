"""毎晩の呼び名追いつき（`channel_alias_nightly.yml`）の**繋ぎと既定**を見る。

    python3 python/channel_alias_nightly_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**
（`docs/island-standards.md` §15）。

ネットにも Firestore にも出ない。読むのは `.github/workflows/` の字だけ。

## なぜ要るか

`python/admin/channel_alias.py` の**中身**は
`python/admin/channel_alias_selftest.py` が見ている（足す／ぶつかる／
取れない／書かない）。あれは「回れば正しく足せるか」の見張り。

**ここが見るのは「そもそも回るか」。** 回らないほうは、こういう形で壊れる。

| 壊れかた | どう見えるか |
| --- | --- |
| 繋ぎ先の `name:` があちらで変わった | **黙って切れる。赤くならない。走らなくなるだけ** |
| 毎晩ぶんの既定が下見になった | 毎晩みどりで終わる。**でも1件も直らない**（#144 の「空回しの緑」） |
| `workflow_dispatch` の `dry_run` が効かない | 手で「見るだけ」のつもりで押した回が、本番に書く |
| 足したあとのぶつかり検査が消えた・隠れた | **毎晩みどり。でも配信には別人の絵が出る**（#147） |

**4つとも赤くならない。** だから字で突き合わせる。

## 見るもの（足は12本）

  1. `つなぎ` … `workflow_run` の繋ぎ先が1本以上ある
  2. `名前`   … 繋ぎ先の字が、**実在するファイルの `name:` と一字一句同じ**
  3. `保険`   … cron が1本以上ある（繋ぎが切れたときの保険）
  4. `既定`   … 繋ぎ／cron で来た回は**下見にならない**（実際に shell を回して見る）
  5. `手押し` … `workflow_dispatch` の `dry_run` が効く（true→下見 / false→書く）
  6. `入力`   … `dry_run` が boolean・既定 true で定義されている
  7. `env`    … `inputs.dry_run` を読むのは**決めかたの step の1か所だけ**
                （実行 step が入力を直に見ていると、繋ぎで来た回の空文字に賭けることになる）
  8. `実行`   … 下見の枝は `{}`、そうでない枝は `{"apply": true}` を渡している
  9. `検査`   … `name_clash.py` を回す step が在る（**足したあと、誰かが見ている**）
 10. `順番`   … その step が `channel_alias` を回す step の**後ろ**にある
                （前に置くと「足したせいでぶつかったか」が見えない）
 11. `隠し`   … `continue-on-error` が無く、**偽の `python` に 1 と 2 を
                返させても step が落ちる**（ぶつかっても緑で終わる形。
                #132 は step に、#144 は回しかたに付いていた）
 12. `下見`   … **下見の回でも回る**（`if:` が無く、`CHALIAS_DRY` を中で見ていない）

9〜12 が見ているのは「足したあとに誰も見ていない」穴（#542 を繋いだ理由）。
ぶつかりの**数え方**そのものは `python/admin/name_clash_selftest.py` の受け持ちで、
ここは**回るか / 隠れていないか / 順番 / 下見でも回るか**の4つだけ見る。

4 と 5 は**字を眺めるのではなく、その step の `run:` をそのまま bash で回して**
`$GITHUB_ENV` に何が書かれるかを読む。条件の書き間違い（`=` と `!=` の取り違え、
空文字の扱い）は、眺めていても出ない。

## 対照（本物の判定を1つも出す前に、毎回）

**足を1本ずつ抜いて、そのたび落ちること**まで見る
（`docs/island-standards.md` §15「対照は、足の数だけ用意する」）。
その前に**壊していない写しが通ること**を先に見る（`island-misses.md` #99）。

とくに `名前` の対照は2通り当てる。

  - こちらの繋ぎ先の字を1文字変える
  - **あちらのファイルの `name:` を書き換えた写しの置き場**で見る
    ← 本番で起きるのはこちら。「あちらの名前が変わったら赤くなる」を実測する

`下見` の対照も2通り当てる。**隠れる場所が2つある**から（#144）。

  - step に `if:` を付けて、下見の回だけ飛ばす
  - step の中で `$CHALIAS_DRY` を見て `exit 0` する
    ← `rebake.yml` の `REBAKE_DRY` が実際にこの形で、**赤くならずに**
      「見張りは鳴っていたのに緑」を作った

対照が1つでも外れたら、本物の判定を1つも出さずに **2** で落ちる。
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
YML = WFDIR / "channel_alias_nightly.yml"

# 「押しかた」を決めている step の名前と、そこが立てる env の名前。
# **字で持つ。** ここがワークフロー側と食い違ったら、下の `step_run()` が
# 見つけられずに 2 で落ちる（黙って 0件 にしない）
DECIDE_STEP = "今回の押しかたを決める"
RUN_STEP = "チャンネル名を呼び名に足す"
FLAG = "CHALIAS_DRY"

# 足したあとのぶつかり検査。**step の名前ではなく、回している中身で探す。**
# 名前は読みやすさのために変わりうるが、`name_clash.py` を回しているかは変わらない
CLASH_PY = "name_clash.py"

# 対照で足を抜くときの差し込み口（`id:` の行そのもの）
CLASH_ID = "        id: clash\n"

# 足の名前。本物の判定と対照で同じ並びを使う（片方に足し忘れない）
LEGS = ("つなぎ", "名前", "保険", "既定", "手押し", "入力", "実行",
        "env", "検査", "順番", "隠し", "下見")

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
    """`pred` が当たる step の**並び順**を返す。無ければ None。

    順番を見るので、名前ではなく位置が要る。job が複数あっても
    `steps_of` が並べた順のままで数える（このワークフローは job 1本）。
    """
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
    """step の `run:` をそのまま bash で回して、`$GITHUB_ENV` の旗を読む。

    戻り値は（旗の値 / 読めなければ None、ついでの出力）。
    """
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


def bash_code(script: str, py_exit: int) -> int:
    """step の `run:` を、**偽の `python`** を掴ませて回し、終了コードを返す。

    ぶつかり検査が赤くなるかは、字を眺めても出ない。`|| true` でも
    `; exit 0` でも `set +e` でも同じように**隠れる**ので、
    **実際にその終了コードを返させて、step が落ちるか**を見る。
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
            env={"PATH": f"{box}:/usr/bin:/bin", FLAG: "1"},
        )
        return r.returncode


def names_in(wfdir: Path) -> dict[str, str]:
    """置き場にあるワークフローの `name:` → ファイル名。**字のまま持つ。**

    YAML として読むのではなく**行の頭の `name:` を拾う**。ここは
    「あちらの `name:` を書き換えたら切れる」を見る場所なので、
    見るものも向こうの1行そのものにする。
    """
    out: dict[str, str] = {}
    for p in sorted(list(wfdir.glob("*.yml")) + list(wfdir.glob("*.yaml"))):
        for line in p.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^name:\s*(.+?)\s*$", line)
            if m:
                out[m.group(1).strip("'\"")] = p.name
                break
    return out


# ---------------------------------------------------------------- 判定


def check(text: str, wfdir: Path) -> list[str]:
    """落ちた足の名前を返す。空なら通った。

    **例外で落ちない。** 写しを壊すと YAML として読めなくなることがあるので、
    そこも「落ちた足」として数える（対照がそこで死ぬと、判定の穴に見える）。
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

    # 3. 保険
    sched = on.get("schedule") or []
    crons = [s.get("cron") for s in sched
             if isinstance(s, dict) and s.get("cron")]
    if not crons:
        ng("保険", "cron が1本もありません（繋ぎが切れたら止まったままになります）")

    # 6. 入力
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

    # 7. env だけを見ているか。**コメント行は数えない**——ここは
    #    「なぜ env に写すか」を注意書きとして書いてある場所でもあるので、
    #    字をそのまま数えると、説明を書き足した日に落ちる
    body = "\n".join(ln for ln in text.splitlines()
                     if not ln.lstrip().startswith("#"))
    hits = body.count("inputs.dry_run")
    if hits != 1:
        ng("env", f"`inputs.dry_run` が {hits} か所あります"
                  "（決めかたの step 1か所だけにしてください）")

    # 4・5. 決めかたを、実際に回す
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
                   f"（0＝書く。でないと毎晩、空回しの緑になります）"
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

    # 8. 実行の枝
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
               "（毎晩ぶんが下見のまま回ります）")
        if FLAG not in runsh:
            ng("実行", f"{FLAG} を見ていません（決めかたの step が効きません）")

    # 9〜12. 足したあとのぶつかり検査
    sts = steps_of(doc)
    i_run = step_at(doc, lambda s: s.get("name") == RUN_STEP)
    i_clash = step_at(doc, lambda s: CLASH_PY in (s.get("run") or ""))
    if i_clash is None:
        ng("検査",
           f"{CLASH_PY} を回す step がありません"
           "（呼び名は足すのに、**足したあとを誰も見ていません**）")
    else:
        st = sts[i_clash]
        body = st.get("run") or ""

        # 10. 順番。**足す前に回しても、足したせいでぶつかったかは見えない**
        if i_run is None:
            ng("順番",
               f"step「{RUN_STEP}」が見つからないので、前後を数えられません")
        elif i_clash < i_run:
            ng("順番",
               f"ぶつかり検査が「{RUN_STEP}」より前（{i_clash} < {i_run}）に"
               "あります。**足したせいでぶつかったか**が見えません")

        # 11. 隠し。#132 は step に、#144 は回しかたに付いていた
        if st.get("continue-on-error"):
            ng("隠し",
               "continue-on-error が付いています"
               "（ぶつかっても run は緑で終わります。誰も見ていません）")
        # **字を眺めない。偽の `python` を掴ませて、実際に落ちるか回す。**
        # 1（見つかった）も 2（数えられていない）も赤でないといけない
        for code, why in ((1, "ぶつかりが見つかった"),
                          (2, "数えられていない")):
            got = bash_code(body, code)
            if got == 0:
                ng("隠し",
                   f"`python` が {code}（{why}）を返しても step が緑で"
                   "終わります。誰も見ていない時間なので、気づく道がありません")

        # 12. 下見。**上が1バイトも書かない回でも、いま図鑑がぶつかって
        #     いるかは知りたい。** 隠れる場所は2つある
        cond = st.get("if")
        if cond is not None:
            ng("下見",
               f"ぶつかり検査に `if:` が付いています（{str(cond)[:60]!r}）。"
               "下見の回で飛ぶと、押した人にも見えません")
        if FLAG in body:
            ng("下見",
               f"ぶつかり検査の中で {FLAG} を見ています"
               "（回しかたに `exit 0` を仕込む形。#144 の空回しの緑）")

    return bad


# ---------------------------------------------------------------- 対照


def mutate(text: str, kind: str) -> str:
    """足を1本抜いた写しを作る。"""
    if kind == "既定":
        # 毎晩ぶんの既定を下見にする（#144 の形）
        tail = '" >> "$GITHUB_ENV"\n            echo "毎晩ぶん'
        return text.replace(f"{FLAG}=0{tail}", f"{FLAG}=1{tail}", 1)
    if kind == "手押し":
        return text.replace('[ "$IN_DRY" = "false" ]',
                            '[ "$IN_DRY" != "false" ]', 1)
    if kind == "名前":
        # **繋ぎの行だけ**を1文字変える（頭の説明に出てくる同じ字は触らない）
        return re.sub(r'(\n    workflows: \[.*?)Donations(.*?\]\n)',
                      r"\1Donation\2", text, count=1)
    if kind == "つなぎ":
        return re.sub(r"\n  workflow_run:\n(?:    .*\n)+", "\n", text, count=1)
    if kind == "保険":
        return re.sub(r"\n  schedule:\n(?:    .*\n)+", "\n", text, count=1)
    if kind == "入力":
        return text.replace("      dry_run:\n", "      dryrun:\n", 1)
    if kind == "env":
        return text.replace("$CHALIAS_DRY", "${{ inputs.dry_run }}", 1)
    if kind == "実行":
        return text.replace("""ARGS='{"apply": true}'""", "ARGS='{}'", 1)
    if kind == "検査":
        # 検査そのものを取り上げる（step の殻は残す。**回るものだけ消える**）
        return re.sub(r"ARGS='\{\"attribute\".*?' python name_clash\.py",
                      'echo "ぶつかり検査は省きました"', text, count=1)
    if kind == "順番":
        # 足す step の**前**へ動かす（足したせいでぶつかったかが見えなくなる）
        m = re.search(r"\n      - name: 配信に映る側で.*?name_clash\.py\n",
                      text, re.S)
        if not m:
            die("ぶつかり検査の step が見つからないので、順番を入れ替えられません")
        blk = m.group(0)
        moved = text.replace(blk, "\n", 1)
        head = "\n      - name: チャンネル名を呼び名に足す\n"
        return moved.replace(head, blk + head[1:], 1)
    if kind == "隠し":
        return text.replace(
            CLASH_ID, CLASH_ID + "        continue-on-error: true\n", 1)
    if kind == "下見":
        return text.replace(
            CLASH_ID, CLASH_ID + "        if: env.CHALIAS_DRY != '1'\n", 1)
    if kind == "下見(中で exit)":
        # #144 の形。**回しかたに `exit 0` を仕込む**（step は在るし、緑で終わる）
        return text.replace(
            "          set -euo pipefail\n          ARGS='{\"attribute\"",
            "          set -euo pipefail\n"
            '          if [ "$CHALIAS_DRY" = "1" ]; then exit 0; fi\n'
            "          ARGS='{\"attribute\"", 1)
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

    # #99: 壊していない写しが通ることを先に見る。写しを作る途中で壊れていても
    # 終了コードは同じなので、ここを見ないと対照にならない
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

    # **下見の対照も2通り。** `if:` で飛ばす形と、**中で `exit 0` する形**。
    # 後者は step が在るし、ログも出るし、run も緑で終わる（#144 そのもの）
    bad = check(mutate(text, "下見(中で exit)"), WFDIR)
    hit = any(b.startswith("下見:") for b in bad)
    print(f"  {'OK  ' if hit else 'NG  '} [対照] ぶつかり検査の**中で** "
          f"{FLAG} を見て `exit 0` すると、足「下見」が落ちる"
          f"（落ちた足 {len(bad)}）")
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
