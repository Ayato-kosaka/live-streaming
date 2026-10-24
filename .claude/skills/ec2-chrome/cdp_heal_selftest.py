"""**EC2 の cdp.py が古い版で上書きされても、正の版に戻ることの見張り。本物の EC2 には1度も触らない。**

    python3 .claude/skills/ec2-chrome/cdp_heal_selftest.py
    BREAK=heal_nonum python3 .claude/skills/ec2-chrome/cdp_heal_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字や差し替える字が見つからない**
（`docs/island-standards.md` §15）。要るのは Python・sh・bash だけ。

## なぜ要るか（2026-10-24）

札（`ec2_queue.py`）の要は、EC2 の `/home/ubuntu/cdp/cdp.py` の `up`・`tab`・`pages` が、札を持っていなければ
自分で取ること。ところが札を入れた日の 10:10 UTC、そこが札を取らない古い版に戻っていた。古い枝のセッションが、
使うたびに手元の版を置き直す道具（`ec2_exec.sh`・`post.py send`）で書き戻した。「最後に置いた人の版が効く」形では、
古い枝が1回置くだけで札の守りが黙って外れる。いまは EC2 の `cdp-heal`（`cdp_heal.sh`）が、番号が正の版より小さい
（無い）ものを書かれた瞬間に戻し、手元の置く道具は EC2 のほうが新しければ置かない（`cdp.py` の頭「版の番号」）。

## 偽物

- **偽の EC2 の置き場**: `cdp_heal.sh` の本物の字の、頭の置き場の変数（`LIVE`・`CANON`・`LOG`・`UNITS`・`CRON`・`SELF`・
  持ち主・`SETTLE`）だけを使い捨ての置き場に差し替えて回す。差し替えたあとに、頭の外に EC2 の置き場の字
  （`/home/ubuntu`・`/usr/local`・`/var/log`・`/etc/`）が残っていれば 2 で落ちる（本物の置き場を触らないように）。
  `systemctl` は偽物（呼ばれた引数を控える）。systemd が書かれた瞬間に起こすところは、本物の EC2 で確かめる
- **手元の置く道具**: `ec2_queue_selftest.py` の偽の EC2（`FakeEC2`。`aws` の代わりに、送られた sh を置き場だけ
  差し替えて手元で回す）の上で、`ec2.put`・`ec2.py put`・`ec2_exec.sh`・`post.py send` を本物の字のまま回す
- **札**: 本物の `ec2_queue.py` を使い捨ての置き場で（`ec2_queue_selftest.py` の `cdp_hold` と同じ）
- 時計は使わない（戻すのは時刻に依らない。書きかけを読み直す間の `SETTLE` だけ 0 にする）

| 足 | 確かめること（依頼の合格の条件の番号） |
| --- | --- |
| `heal_old` | 1. 番号なし（札の前の版）・小さい番号・消えた、のどれも正の版に戻り、ログに1行（何番を何番に）。番号なしは正の版にもならない |
| `heal_keeps` | 2. 同じ番号（中身が違っても）・大きい番号は戻さない。戻したあとの版も触らない。ログにも書かない。正の版が無ければ何もしない |
| `place_no_downgrade` | 3. 手元の置く道具（`ec2.put`・`ec2.py put`・`ec2_exec.sh`・`post.py send`）は、EC2 のほうが新しければ置かない。古い・同じ・無いなら置く |
| `healed_takes_ticket` | 4. 戻す前の版は札を取らず、戻したあとの `cdp.py` で札を持たずに `up("fish", …)`（古い呼びかた）を呼ぶと、そのプロセスの pid で札を取る |
| `install` | `cdp-heal install` が .path（`PathChanged=` 生きている置き場）・.service・5分ごとの cron を入れる。`ec2.py guard` は正の版の置き場へ置き、正の版も生きている版も下げない |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が、本物の字を1か所だけ書き換えた写しを作り、それで足を回す。**外した守りの足だけが落ちる**ことを
確かめる。外す字が本物に見つからなければ 2 で落ちる。

## どこから走るか

回し役（`python/selftest_runner.py`）の `MJS_ROOTS` に `.claude/skills/ec2-chrome` が入っていて、Selftests から回る。
"""

from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import traceback
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent
BREAK = os.environ.get("BREAK", "")
NAMES = ("cdp_heal.sh", "cdp.py", "ec2.py", "ec2_exec.sh", "ec2_queue.py", "idle_stop.sh")
REAL = {n: HERE for n in NAMES}
PY = sys.executable
LIVE = "/home/ubuntu/cdp/cdp.py"
CANON = "/usr/local/lib/ec2-chrome/cdp.py"

# 札の前の版の形（番号なし。up は札を取らない）。古い枝の道具が書き戻すもの
OLD = '"""札の前の cdp.py の形"""\ndef up(name, url="about:blank", reseed=False):\n    return 9300\n'
# 番号は小さいが付いている、札を取らない版（番号なしの読みかたを壊す対照に、足 4 を巻き込まないため）
LOW = 'CDP_VERSION = 1\n\n\ndef up(name, url="about:blank", reseed=False):\n    return 9301\n'

# 外す守り: 名前 → (ファイル, 本物の字, 書き換えた字, 落ちるはずの足, 何を外すか)
CUTS: dict[str, tuple[str, str, str, set[str], str]] = {
    "heal_nonum": ("cdp_heal.sh", '  echo "${v:-0}"\n', '  echo "${v:-999999}"\n', {"heal_old"},
                   "番号の行が無い版を「いちばん新しい」と読む（札の前の版を戻さない）"),
    "heal_noop": ("cdp_heal.sh", '  if ! mv -f "$tmp" "$LIVE"; then', '  if ! rm -f "$tmp"; then',
                  {"heal_old", "heal_keeps", "healed_takes_ticket"}, "古いと分かっても、正の版を置かない（戻したと書くだけ）"),
    "heal_equal": ("cdp_heal.sh", 'older() { [ "$1" -lt "$2" ]; }', 'older() { [ "$1" -le "$2" ]; }', {"heal_keeps"},
                   "同じ番号も戻す（新しい枝が同じ番号で置いたものを潰す）"),
    "heal_bigger": ("cdp_heal.sh", 'older() { [ "$1" -lt "$2" ]; }', 'older() { [ "$1" -ne "$2" ]; }', {"heal_keeps"},
                    "大きい番号も正の版に戻す（新しい枝の新しい版を潰す）"),
    # guard も place で写すが、続く check が正の版（下げていない）へ戻すので、guard の足は落ちない
    "place_downgrade": ("cdp_heal.sh", '  if [ "$vn" -lt "$top" ]; then\n', "  if false; then\n",
                        {"place_no_downgrade"}, "手元の版が EC2 の版より小さくても置く"),
    "put_direct": ("ec2.py", "    live = os.path.normpath(remote) == CDP_LIVE\n", "    live = False\n",
                   {"place_no_downgrade"}, "ec2.put が cdp.py を比べずに直に書く（前の形）"),
    "exec_old_sync": ("ec2_exec.sh",
                      '  log "cdp.py sync: $(timeout 300 python3 "$EC2PY" put "$CDP_SRC" /home/ubuntu/cdp/cdp.py 2>&1 | tail -1)',
                      '  jq -n --arg b "$(base64 -w0 "$CDP_SRC")" \'{commands: ["mkdir -p /home/ubuntu/cdp && echo \\($b) | base64 -d'
                      ' > /home/ubuntu/cdp/cdp.py"]}\' > "$PARAMS_FILE"\n'
                      '  timeout 30 $AWSP ssm send-command --instance-ids "$INSTANCE_ID" --document-name AWS-RunShellScript'
                      ' --parameters "file://$PARAMS_FILE" --query Command.CommandId --output text >/dev/null\n'
                      '  log "cdp.py sync: $(echo direct',
                      {"place_no_downgrade"}, "ec2_exec.sh が base64 -d > cdp.py と直に書く（前の形）"),
    "cdp_no_hold": ("cdp.py", "    hold(name)\n    port, udd = _port(name), _udd(name)\n",
                    "    port, udd = _port(name), _udd(name)\n", {"healed_takes_ticket"},
                    "正の版の up() が札を取らない（戻しても札の守りが効かない）"),
    "path_wrong": ("cdp_heal.sh", "PathChanged=$LIVE\n", "PathChanged=${LIVE%/*}\n", {"install"},
                   "書かれた瞬間の見張りが、cdp.py ではなく置き場のディレクトリを見る"),
    "cron_none": ("cdp_heal.sh", '"*/5 * * * * root $SELF check cron >/dev/null 2>&1"', '"# no cron"', {"install"},
                  "5分ごとの保険を入れない"),
    "canon_downgrade": ("cdp_heal.sh", '  if [ "$vn" -lt "$vc" ]; then rm -f "$cand"; echo "CANON-KEPT', '  if false; then rm -f "$cand"; echo "CANON-KEPT',
                        {"install"}, "古い枝の guard が正の版を下げる"),
    "guard_live_direct": ("ec2.py", '    put(os.path.join(HERE, "cdp.py"), CDP_CANON + ".new")\n',
                          '    put(os.path.join(HERE, "cdp.py"), CDP_LIVE)\n', {"install"},
                          "guard が cdp.py を正の版の置き場ではなく、生きている置き場へ直に置く（前の形）"),
}

# 足ごとに、読む本物のファイル。子（守りを1つ外した写し）では、外したファイルを読まない足を回さない
DEPS: dict[str, set[str]] = {
    "heal_old": {"cdp_heal.sh", "cdp.py"},
    "heal_keeps": {"cdp_heal.sh", "cdp.py"},
    "place_no_downgrade": {"cdp_heal.sh", "cdp.py", "ec2.py", "ec2_exec.sh", "ec2_queue.py", "idle_stop.sh"},
    "healed_takes_ticket": {"cdp_heal.sh", "cdp.py", "ec2_queue.py"},
    "install": {"cdp_heal.sh", "cdp.py", "ec2.py"},
}


def _script(p: Path, text: str) -> Path:
    p.write_text(text, encoding="utf-8")
    p.chmod(p.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return p


def _load(name: str, path: Path):
    sys.modules.pop(name, None)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else "-"


def bump(text: str, n: int) -> str:
    """cdp.py の字の番号だけを n に変えた写し（同じ中身の、別の番号の版）"""
    out, k = re.subn(r"^CDP_VERSION = \d+$", f"CDP_VERSION = {n}", text, count=1, flags=re.M)
    if k != 1:
        print("✕ cdp.py に `CDP_VERSION = <数>` の行が無い（cdp_heal.sh の ver() が読む形）")
        sys.exit(2)
    return out


class Bench:
    def __init__(self, files: dict[str, Path], tmp: Path) -> None:
        self.files, self.tmp, self.n = files, tmp, 0
        self.cdp = (files["cdp.py"] / "cdp.py").read_text(encoding="utf-8")
        self._eqs = None

    def fresh(self) -> Path:
        self.n += 1
        d = self.tmp / f"case{self.n}"
        d.mkdir()
        return d

    def fake_ec2(self):
        """偽の EC2（ec2_queue_selftest.py の FakeEC2）。写しの置き場（files）の ec2.py・ec2_queue.py を使う"""
        if self._eqs is None:
            m = _load(f"ec2_queue_selftest_for_heal_{id(self)}", HERE / "ec2_queue_selftest.py")
            (self.tmp / "eqs").mkdir()
            self._eqs = (m, m.Bench(self.files, self.tmp / "eqs"))
        m, eb = self._eqs
        f = m.FakeEC2(eb)
        f.live = f.home / "cdp" / "cdp.py"
        f.live.parent.mkdir(parents=True, exist_ok=True)
        f.canon.mkdir(exist_ok=True)
        return f


# ---- 偽の EC2 の置き場で cdp-heal を回す ------------------------------------------

class Rig:
    """cdp_heal.sh の本物の字の、頭の置き場の変数だけを使い捨ての置き場に差し替えて回す"""

    def __init__(self, b: Bench):
        self.b = b
        self.d = b.fresh()
        self.home = self.d / "uhome"     # 「/home/ubuntu」の字を含めない（下の、本物の置き場が残っていないかの確かめ）
        self.live = self.home / "cdp" / "cdp.py"
        self.live.parent.mkdir(parents=True)
        self.canon = self.d / "lib" / "ec2-chrome" / "cdp.py"
        self.log = self.d / "cdp-heal.log"
        self.units = self.d / "units"
        (self.d / "cron.d").mkdir()
        self.cron = self.d / "cron.d" / "cdp-heal"
        (self.d / "sbin").mkdir()
        self.selfp = self.d / "sbin" / "cdp-heal"
        self.bin = self.d / "bin"
        self.bin.mkdir()
        self.sysctl_log = self.d / "systemctl.log"
        _script(self.bin / "systemctl", f'#!/bin/sh\necho "$*" >> "{self.sysctl_log}"\n'
                                        '[ "$1" = is-active ] && echo active\nexit 0\n')
        me = f"{os.getuid()}:{os.getgid()}"
        subs = [("LIVE=/home/ubuntu/cdp/cdp.py\n", f"LIVE={self.live}\n"),
                ("CANON=/usr/local/lib/ec2-chrome/cdp.py\n", f"CANON={self.canon}\n"),
                ("LOG=/var/log/cdp-heal.log\n", f"LOG={self.log}\n"),
                ("UNITS=/etc/systemd/system\n", f"UNITS={self.units}\n"),
                ("CRON=/etc/cron.d/cdp-heal\n", f"CRON={self.cron}\n"),
                ("SELF=/usr/local/sbin/cdp-heal\n", f"SELF={self.selfp}\n"),
                ("OWNER=ubuntu:ubuntu\n", f"OWNER={me}\n"),
                ("ROOT_OWNER=root:root\n", f"ROOT_OWNER={me}\n"),
                ("SETTLE=1\n", "SETTLE=0\n")]
        text = (b.files["cdp_heal.sh"] / "cdp_heal.sh").read_text(encoding="utf-8")
        for old, new in subs:
            if text.count(old) != 1:
                print(f"✕ cdp_heal.sh の差し替える字 {old!r} が {text.count(old)} か所（1か所のはず）。字を直したら、ここも直す")
                sys.exit(2)
            text = text.replace(old, new)
        # 頭の外に EC2 の置き場が直に書いてあれば、本物の置き場を触る。回さずに落ちる
        for ln in text.splitlines():
            code = ln.split("#", 1)[0] if ln.lstrip().startswith("#") else ln
            if any(p in code for p in ("/home/ubuntu", "/usr/local", "/var/log", "/etc/")):
                print(f"✕ cdp_heal.sh の頭の変数の外に、EC2 の置き場が直に書いてある（自己テストが本物を触る）: {ln.strip()[:120]}")
                sys.exit(2)
        _script(self.selfp, text)
        self.text = text

    def heal(self, *args) -> tuple[int, str]:
        env = dict(os.environ, PATH=f"{self.bin}{os.pathsep}{os.environ.get('PATH', '')}")
        r = subprocess.run(["sh", str(self.selfp), *args], env=env, capture_output=True, text=True, timeout=30, check=False)
        return r.returncode, (r.stdout + r.stderr).strip()

    def put_canon(self, text: str):
        self.canon.parent.mkdir(parents=True, exist_ok=True)
        self.canon.write_text(text, encoding="utf-8")

    def lines(self) -> list[str]:
        return self.log.read_text(encoding="utf-8").splitlines() if self.log.exists() else []


# ---- 足 1・2 ---------------------------------------------------------------------

def leg_heal_old(b: Bench):
    out = []
    want = hashlib.sha256(b.cdp.encode()).hexdigest()
    for what, start, why, ver_s in (("番号なし（札の前の版）", OLD, "path", "版 0（番号なし）"),
                                    ("小さい番号（1）", LOW, "cron", "版 1（"),
                                    ("消えた", None, "path", "（ファイルが無い）")):
        r = Rig(b)
        r.put_canon(b.cdp)
        if start is not None:
            r.live.write_text(start, encoding="utf-8")
        rc, said = r.heal("check", why)
        got = r.lines()
        out += [(f"{what}: 正の版に戻る（{said[:40]}・sha256 {sha(r.live)[:12]} = {want[:12]}）",
                 rc == 0 and said.startswith("HEALED") and sha(r.live) == want),
                (f"{what}: ログに1行、何番を何番に戻したか（{got[-1][:110] if got else 'なし'}）",
                 len(got) == 1 and f" {why}: " in got[0] and ver_s in got[0] and "正の版 2（" in got[0])]
    # 番号の無い版は正の版にもならない（戻す先が札を取る版である、を番号で約束しているので）
    r = Rig(b)
    r.put_canon(b.cdp)
    cand = r.canon.parent / "cdp.py.new"
    cand.write_text(OLD, encoding="utf-8")
    rc, said = r.heal("canon", str(cand))
    out.append((f"番号なしは正の版にしない（{said[:50]}・正の版は {sha(r.canon)[:12]}）", rc != 0 and sha(r.canon) == want))
    return out


def leg_heal_keeps(b: Bench):
    out = []
    for what, text in (("同じ番号で中身が違う", b.cdp + "\n# 新しい枝で足した行（番号は上げていない）\n"),
                       ("大きい番号（3）", bump(b.cdp, 3))):
        r = Rig(b)
        r.put_canon(b.cdp)
        r.live.write_text(text, encoding="utf-8")
        before = sha(r.live)
        rc, said = r.heal("check", "path")
        out.append((f"{what}: 戻さない（{said[:30]}・sha256 そのまま {sha(r.live) == before}・ログ {len(r.lines())}行）",
                    rc == 0 and said.startswith("OK") and sha(r.live) == before and not r.lines()))
    # 戻したあとの版は同じ番号なので、次の確かめ（cron・自分の mv で起きる .path）では何も書かない
    r = Rig(b)
    r.put_canon(b.cdp)
    r.live.write_text(LOW, encoding="utf-8")
    r.heal("check", "path")
    n1 = len(r.lines())
    rc2, said2 = r.heal("check", "cron")
    out.append((f"戻したあとの確かめでは何もしない（{said2[:30]}・ログ {n1} → {len(r.lines())}行）",
                rc2 == 0 and said2.startswith("OK") and n1 == 1 and len(r.lines()) == 1))
    # 正の版が無い（guard の前の EC2）なら触らない
    r = Rig(b)
    r.live.write_text(OLD, encoding="utf-8")
    rc, said = r.heal("check", "cron")
    out.append((f"正の版が無ければ触らない（{said[:30]}）", rc == 0 and said.startswith("NOCANON") and r.live.read_text() == OLD))
    return out


# ---- 足 3: 手元の置く道具 ---------------------------------------------------------

@contextlib.contextmanager
def quiet():
    keys = ("EC2_QUEUE_TICKET", "EC2_QUEUE_WHO", "EC2_QUEUE_PURPOSE")
    saved = {k: os.environ.get(k) for k in keys}
    for k in keys:
        os.environ.pop(k, None)
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            yield buf
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


def fake_env(f) -> dict:
    env = dict(os.environ, PATH=f"{f.bin}{os.pathsep}{os.environ.get('PATH', '')}", EC2_CHROME_INSTANCE_ID=f.INSTANCE,
               EC2_PY_TIME_SCALE="0.01", AWS_CONFIG_FILE="/nonexistent/aws-config",
               AWS_SHARED_CREDENTIALS_FILE="/nonexistent/aws-credentials")
    for k in ("EC2_QUEUE_TICKET", "EC2_QUEUE_WHO", "EC2_QUEUE_PURPOSE", "AWS_PROFILE"):
        env.pop(k, None)
    return env


def leg_place_no_downgrade(b: Bench):
    out = []
    local = b.files["cdp.py"] / "cdp.py"
    want = sha(local)
    v3 = bump(b.cdp, 3)

    # ec2.put（post.py・tools/youtube_taps.py・suzuri の login_ec2.sh が通る所）
    for what, live, canon, placed in (("EC2 が大きい番号（3）", v3, None, False),
                                      ("正の版が大きい番号（3）・生きている版は 1", LOW, v3, False),
                                      ("EC2 が小さい番号（1）", LOW, None, True),
                                      ("EC2 が同じ番号で中身が違う", b.cdp + "\n# 古い同じ番号\n", None, True),
                                      ("EC2 に無い", None, None, True)):
        f = b.fake_ec2()
        if live is not None:
            f.live.write_text(live, encoding="utf-8")
        if canon is not None:
            (f.canon / "cdp.py").write_text(canon, encoding="utf-8")
        before = sha(f.live)
        m = f.module()
        with quiet() as buf:
            try:
                ok = m.put(str(local), LIVE)
            except SystemExit as e:
                ok = f"落ちた: {e}"
        said = [ln for ln in buf.getvalue().splitlines() if ln.startswith("put")][-1:]
        if placed:
            out.append((f"ec2.put・{what}: 置く（{said}）", ok is True and sha(f.live) == want))
        else:
            out.append((f"ec2.put・{what}: 置かない（{said}）",
                        ok is False and sha(f.live) == before and "置かなかった" in buf.getvalue()))
    # 置く途中の一時ファイルを残さない
    left = [p.name for p in f.live.parent.iterdir() if p.name != "cdp.py"]
    out.append((f"置いたあと、一時ファイルを残さない（{left}）", not left))

    # ec2.py put（コマンドとして。suzuri/login_ec2.sh・tools/youtube_taps.py）
    f = b.fake_ec2()
    f.live.write_text(v3, encoding="utf-8")
    r = subprocess.run([PY, str(b.files["ec2.py"] / "ec2.py"), "put", str(local), LIVE], env=fake_env(f),
                       capture_output=True, text=True, timeout=120, check=False)
    out.append((f"ec2.py put（コマンド）・EC2 が大きい番号: 置かない（rc {r.returncode}・{r.stdout.strip()[-60:]}）",
                r.returncode == 0 and sha(f.live) == sha_text(v3) and "置かなかった" in r.stdout))

    # ec2_exec.sh（Doneru の cookie 取り。実行の前に cdp.py を置き直す）
    for what, live, placed in (("EC2 が大きい番号（3）", v3, False), ("EC2 が小さい番号（1）", LOW, True)):
        f = b.fake_ec2()
        f.live.write_text(live, encoding="utf-8")
        before = sha(f.live)
        remote = f.d / "remote.sh"
        remote.write_text("echo hello-from-ec2\n")
        log = f.d / "exec.log"
        env = fake_env(f)
        env.update(EC2_CHROME_LOG=str(log), EC2_CHROME_PARAMS=str(f.d / "params.json"), EC2_EXEC_RETRY_S="0",
                   EC2_QUEUE_LANE="doneru")
        if shutil.which("aws", path=env["PATH"]) != str(f.bin / "aws"):
            return out + [("偽の aws が PATH の頭に無い（本物の aws に届くので回さない）", False)]
        subprocess.run(["bash", str(b.files["ec2_exec.sh"] / "ec2_exec.sh"), str(remote), "60"], env=env,
                       capture_output=True, text=True, timeout=180, check=False)
        text = log.read_text() if log.exists() else ""
        sync = [ln for ln in text.splitlines() if "cdp.py sync" in ln][-1:]
        ran = "hello-from-ec2" in text
        if placed:
            out.append((f"ec2_exec.sh・{what}: 置き直す（{[s[-70:] for s in sync]}）", ran and sha(f.live) == want))
        else:
            out.append((f"ec2_exec.sh・{what}: 置かない（{[s[-70:] for s in sync]}）", ran and sha(f.live) == before))

    # post.py send（ショートの投稿の前に道具を置き直す）。動画を送る send.py は呼ばない
    f = b.fake_ec2()
    f.live.write_text(v3, encoding="utf-8")
    m = f.module()
    d = f.d / "post"
    d.mkdir()
    (d / "A.mp4").write_bytes(b"not a video")
    (d / "post_A.json").write_text(json.dumps({"tiktok": {"caption": "題\n本文"}}), encoding="utf-8")
    saved = sys.modules.get("ec2")
    sys.modules["ec2"] = m
    try:
        with quiet() as buf:
            post = _load(f"post_under_test_{b.n}", ROOT / "tools" / "shorts" / "post" / "post.py")
            post.subprocess = types.SimpleNamespace(run=lambda *a, **k: types.SimpleNamespace(returncode=0))
            post.tempfile = types.SimpleNamespace(mkdtemp=lambda: str(d))
            try:
                rc = post.cmd_send(types.SimpleNamespace(dir=str(d), option="A", video="vid"))
            except SystemExit as e:
                rc = f"落ちた: {e}"
    finally:
        if saved is None:
            sys.modules.pop("ec2", None)
        else:
            sys.modules["ec2"] = saved
    others = sorted(p.name for p in f.live.parent.iterdir() if p.name != "cdp.py")
    out.append((f"post.py send・EC2 が大きい番号: cdp.py は置かず、ほかの道具は置く（rc {rc}・{others}）",
                rc == 0 and sha(f.live) == sha_text(v3) and "yt_post.py" in others and "置かなかった" in buf.getvalue()))
    return out


def sha_text(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


# ---- 足 4: 戻したあとの cdp.py が札を取る --------------------------------------------

DRIVER = r'''
import importlib.util, json, os, subprocess, sys
cfg = json.loads(sys.argv[1])
spec = importlib.util.spec_from_file_location("cdp", cfg["cdp"])
cdp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cdp)
cdp.QUEUE = cfg["queue"]
cdp.QUEUE_POLL_S = 0.1
cdp._alive = lambda port: True          # Chrome はもう起きている、として up() の札の段だけを通す
print("VERSION", getattr(cdp, "CDP_VERSION", 0), flush=True)
print("PID", os.getpid(), flush=True)
print("PORT", cdp.up("fish", "about:blank"), flush=True)     # 古い枝の呼びかた（位置引数）のまま
r = subprocess.run([cfg["queue"], "--json", "list"], capture_output=True, text=True)
print(r.stdout.strip().splitlines()[-1], flush=True)
'''


def leg_healed_takes_ticket(b: Bench):
    r = Rig(b)
    r.put_canon(b.cdp)
    qdir = r.d / "q"
    qdir.mkdir()
    qt = _script(r.d / "ec2-queue", f'#!/bin/sh\nexec "{PY}" "{b.files["ec2_queue.py"] / "ec2_queue.py"}" "$@"\n')
    drv = r.d / "driver.py"
    drv.write_text(DRIVER, encoding="utf-8")
    env = dict(os.environ, EC2_QUEUE_DIR=str(qdir), EC2_QUEUE_WAIT="5")
    for k in ("EC2_QUEUE_PROC", "EC2_QUEUE_NOW", "EC2_QUEUE_SHIFT", "EC2_QUEUE_TICKET", "EC2_QUEUE_WHO", "EC2_QUEUE_PURPOSE"):
        env.pop(k, None)

    def drive():
        p = subprocess.run([PY, str(drv), json.dumps({"cdp": str(r.live), "queue": str(qt)})], env=env,
                           capture_output=True, text=True, timeout=60, check=False)
        lines = p.stdout.strip().splitlines()
        lst = json.loads(lines[-1][5:]) if lines and lines[-1].startswith("EC2Q ") else {}
        fish = ((lst.get("lanes") or {}).get("fish") or [])
        return p, lines, fish

    r.live.write_text(LOW, encoding="utf-8")
    p0, l0, fish0 = drive()
    rc, said = r.heal("check", "path")
    p1, l1, fish1 = drive()
    h = fish1[0] if fish1 else {}

    def shown(ls):
        return [x for x in ls if x.startswith(("VERSION", "PORT"))]
    return [(f"戻す前の版（番号 1・札を取らない）は札を取らない（{shown(l0)}・列 fish {len(fish0)}枚）",
             p0.returncode == 0 and "PORT 9301" in l0 and not fish0),
            (f"戻した（{said[:30]}）", said.startswith("HEALED")),
            (f"戻したあとの cdp.py で、札を持たずに up('fish', 'about:blank') を呼ぶと札を取る（{shown(l1)}・"
             f"列 fish の持ち主 {h.get('kind')} pid {h.get('pid')}）",
             p1.returncode == 0 and "VERSION 2" in l1 and any(x.startswith("PORT ") for x in l1)
             and h.get("kind") == "pid" and f"PID {h.get('pid')}" in l1 and len(fish1) == 1)]


# ---- 書かれた瞬間の見張りと、guard ------------------------------------------------

def leg_install(b: Bench):
    out = []
    r = Rig(b)
    rc, said = r.heal("install")
    path = (r.units / "cdp-heal.path").read_text() if (r.units / "cdp-heal.path").exists() else ""
    svc = (r.units / "cdp-heal.service").read_text() if (r.units / "cdp-heal.service").exists() else ""
    cron = r.cron.read_text() if r.cron.exists() else ""
    calls = r.sysctl_log.read_text().splitlines() if r.sysctl_log.exists() else []
    out += [(f".path は生きている置き場が書かれたら起こす（{[ln for ln in path.splitlines() if 'Path' in ln]}）",
             rc == 0 and f"PathChanged={r.live}\n" in path and "Unit=cdp-heal.service" in path),
            (f".service は戻す（{[ln for ln in svc.splitlines() if 'Exec' in ln]}）", f"ExecStart={r.selfp} check path" in svc),
            (f"5分ごとの保険の cron（{cron.strip().splitlines()[-1:] if cron.strip() else 'なし'}）",
             f"*/5 * * * * root {r.selfp} check cron" in cron),
            (f"systemd に読ませて起こす（{calls}）",
             calls[:1] == ["daemon-reload"] and "enable cdp-heal.path" in calls and "restart cdp-heal.path" in calls)]

    # guard: 送る先と、EC2 の上で回す順（正の版を置く → 生きている置き場へ比べて写す → 見張りを入れる → 確かめる）
    m = _load(f"ec2_for_guard_{b.n}", b.files["ec2.py"] / "ec2.py")
    sent: list = []
    m.put = lambda local, remote: sent.append(("put", os.path.basename(local), remote)) or True
    m.run = lambda script, timeout=600, quiet=False, raw=False: (sent.append(("run", script)) or ("Success", ""))
    with quiet():
        m.guard()
    puts = [s for s in sent if s[0] == "put"]
    script = next((s[1] for s in sent if s[0] == "run"), "")
    out.append((f"guard は cdp.py を正の版の置き場へ置き、見張りの cdp-heal も置く（{[p[1:] for p in puts if 'cdp' in p[1]]}）",
                ("put", "cdp.py", CANON + ".new") in puts and not any(p[1] == "cdp.py" and p[2] != CANON + ".new" for p in puts)
                and ("put", "cdp_heal.sh", "/usr/local/sbin/cdp-heal.new") in puts))
    seg = re.search(r"mkdir -p /home/ubuntu/cdp && .*?check guard", script)
    if not seg:
        return out + [("guard の sh に「正の版を置く → 写す → 見張りを入れる → 確かめる」の並びが無い", False)]

    def guard_on(rig: Rig, canon_text, live_text):
        """guard の sh のその段を、偽の置き場で回す（cdp.py の候補は手元の版）"""
        rig.canon.parent.mkdir(parents=True, exist_ok=True)
        if canon_text is not None:
            rig.canon.write_text(canon_text, encoding="utf-8")
        if live_text is not None:
            rig.live.write_text(live_text, encoding="utf-8")
        shutil.copy(b.files["cdp.py"] / "cdp.py", rig.canon.parent / "cdp.py.new")
        sh = seg.group(0)
        for old, new in (("/usr/local/sbin/cdp-heal", f"sh {rig.selfp}"), ("/usr/local/lib/ec2-chrome", str(rig.canon.parent)),
                         ("/home/ubuntu", str(rig.home))):
            sh = sh.replace(old, new)
        env = dict(os.environ, PATH=f"{rig.bin}{os.pathsep}{os.environ.get('PATH', '')}")
        p = subprocess.run(["sh", "-c", sh], env=env, capture_output=True, text=True, timeout=60, check=False)
        return p.returncode, (p.stdout + p.stderr).strip()

    want = sha(b.files["cdp.py"] / "cdp.py")
    g = Rig(b)
    rc1, said1 = guard_on(g, None, LOW)
    out.append((f"guard の段: 正の版を置き、古い生きている版（番号 1）を手元の版にする（rc {rc1}・{said1.splitlines()[:2]}）",
                rc1 == 0 and sha(g.canon) == want and sha(g.live) == want and (g.units / "cdp-heal.path").exists()))
    v3 = bump(b.cdp, 3)
    g = Rig(b)
    rc2, said2 = guard_on(g, v3, v3)
    out.append((f"guard の段: 古い枝の guard（手元 2・EC2 3）は正の版も生きている版も下げない（rc {rc2}・"
                f"{[s for s in said2.splitlines() if 'KEPT' in s][:2]}）",
                rc2 == 0 and sha(g.canon) == sha_text(v3) and sha(g.live) == sha_text(v3)))
    return out


LEGS = {
    "heal_old": leg_heal_old,
    "heal_keeps": leg_heal_keeps,
    "place_no_downgrade": leg_place_no_downgrade,
    "healed_takes_ticket": leg_healed_takes_ticket,
    "install": leg_install,
}


def run_legs(files: dict[str, Path], tmp: Path, quiet_: bool, cut_file: str | None = None) -> tuple[list[str], int]:
    b = Bench(files, tmp)
    failed: list[str] = []
    checked = 0
    for name, fn in LEGS.items():
        if cut_file and cut_file not in DEPS[name]:
            if not quiet_:
                print(f"[{name}]（{cut_file} を読まないので、この写しでは回さない）")
            continue
        t0 = time.time()
        try:
            res = fn(b)
        except SystemExit:
            raise
        except BaseException:  # noqa: BLE001
            res = [(f"足が落ちた: {traceback.format_exc().strip().splitlines()[-1]}", False)]
        checked += len(res)
        if any(not ok for _, ok in res):
            failed.append(name)
        if not quiet_:
            print(f"[{name}]（{time.time() - t0:.1f}秒）")
            for what, ok in res:
                print(f"  {'○' if ok else '✕'} {what}")
    return failed, checked


def cut_copy(name: str, dst: Path) -> dict[str, Path]:
    """本物を1つの置き場に写して、守りを1つだけ外す。外す字が無ければ 2 で落ちる"""
    for n in NAMES:
        shutil.copy(REAL[n] / n, dst / n)
    fname, old, new, _, _ = CUTS[name]
    text = (dst / fname).read_text(encoding="utf-8")
    if text.count(old) != 1:
        print(f"✕ BREAK={name}: 外す字が {fname} に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
        sys.exit(2)
    (dst / fname).write_text(text.replace(old, new), encoding="utf-8")
    return {n: dst for n in NAMES}


def child(name: str) -> int:
    if name not in CUTS:
        print(f"✕ BREAK={name} という守りは無い（{' / '.join(CUTS)}）")
        return 2
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as td:
        src, tmp = Path(td) / "src", Path(td) / "work"
        src.mkdir()
        tmp.mkdir()
        files = cut_copy(name, src)
        failed, checked = run_legs(files, tmp, quiet_=False, cut_file=CUTS[name][0])
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    if checked == 0:
        return 2
    return 1 if failed else 0


def drill() -> list[str]:
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    from concurrent.futures import ThreadPoolExecutor

    def one(name):
        t0 = time.time()
        r = subprocess.run([PY, str(Path(__file__).resolve())], capture_output=True, text=True,
                           env=dict(os.environ, BREAK=name), timeout=280, check=False)
        r.secs = time.time() - t0
        return r

    with ThreadPoolExecutor(int(os.environ.get("CDP_HEAL_DRILL_JOBS") or max(2, os.cpu_count() or 2))) as ex:
        runs = dict(zip(CUTS, ex.map(one, CUTS)))
    bad = []
    for name, (fname, _, _, want, why) in CUTS.items():
        r = runs[name]
        line = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line[-1][len("LEGS_FAILED "):])) if line else None
        hit = got == want and r.returncode == 1
        print(f"  {'○' if hit else '✕'} BREAK={name}（{fname}: {why}）→ 落ちた足 "
              f"{sorted(got) if got is not None else '（読めない: ' + (r.stdout + r.stderr).strip()[-300:] + '）'}"
              f"（欲しいのは {sorted(want)}・{r.secs:.0f}秒）")
        if not hit:
            bad.append(name)
    # 足ごとに、その足だけを落とす対照が1つはあること（§15。ほかの足と抱き合わせの対照しか無い足は、何を見ているか分からない）
    alone = {next(iter(w)) for _, _, _, w, _ in CUTS.values() if len(w) == 1}
    for leg in LEGS:
        if leg not in alone:
            print(f"  ✕ 足 {leg} だけを落とす対照が無い")
            bad.append(f"alone:{leg}")
    return bad


def main() -> int:
    if BREAK:
        return child(BREAK)
    t0 = time.time()
    with tempfile.TemporaryDirectory() as td:
        failed, checked = run_legs(REAL, Path(td), quiet_=False)
    print()
    bad = drill()
    print()
    if checked == 0:
        print("✕ 1つも数えなかった。**「通りました」とは言わない**")
        return 2
    if failed or bad:
        if failed:
            print(f"✕ 落ちた足: {' / '.join(failed)}")
        if bad:
            print(f"✕ 対照が外れた: {' / '.join(bad)}（外しても、その足だけが落ちる形になっていない）")
        return 1
    print(f"○ {len(LEGS)}本の足（{checked}件）が通り、守り {len(CUTS)}個を1つずつ外すと、その足だけが落ちた"
          f"（{time.time() - t0:.0f}秒）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
