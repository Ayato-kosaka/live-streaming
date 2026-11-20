"""`python/guide_run.py` の見張り（GitHub には出ない。偽の GitHub を渡す）。

    python3 python/guide_run_selftest.py

終了コード 0=通った / 1=ずれた。

当てる場面:

1. 落ちた所の1行: ログの終わりから意味のある行（終了コードの行・空行・色の符号を飛ばす。表を壊す `|` は置き換える）
2. 印: 0 は緑・1 は赤・2 は黄（**2 を合格と読まない**）・skip は ─。頭の行に赤と黄の数
3. 重い見張り: 赤い job は落ちた step を1行ずつ、土台の step（依存・書き出し）は出さない。job が無ければ ─
4. コメントは1つ: 印のあるコメントがあれば書き換え、無ければ足す。ほかの人のコメントは触らない
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import guide_run as gr  # noqa: E402


class Fake:
    def __init__(self, comments: list[dict]):
        self.cs, self.calls = comments, []

    def comments(self, pr: int) -> list[dict]:
        return self.cs

    def req(self, method: str, path: str, body=None):
        self.calls.append((method, path))


def main() -> int:
    ng = 0
    log = "道具を回す\n\x1b[31m✕ 札の印が4種: いまも\x1b[0m | 必見\n\n── guidebook.mjs 終了コード 1\n"
    got = gr.last_line(log)
    if got == "✕ 札の印が4種: いまも ／ 必見":
        print("[1] ○ 落ちた所の1行（終了コードの行・空行・色を飛ばし、| を置き換える）")
    else:
        print(f"[1] ✕ 落ちた所 {got!r}")
        ng += 1

    with tempfile.TemporaryDirectory() as d:
        rows, lg = Path(d) / "rows.tsv", Path(d) / "x.log"
        lg.write_text(log, encoding="utf-8")
        gr.add_row(rows, "形の見張り", "1", lg)
        gr.add_row(rows, "写真", "0", lg)
        gr.add_row(rows, "検索の作り", "2", None)
        gr.add_row(rows, "記事", "skip", None)
        rs = gr.read_rows(rows)
    body = gr.table("romania/bucharest", "abcdef0123", rs, "https://x/run", "1234567（写真 3）")
    marks = [r.split("|")[2].strip() for r in body.splitlines() if r.startswith("| ") and "段" not in r and "---" not in r]
    if (marks == ["🔴", "🟢", "🟡", "─"] and "赤 1・🟡 数えられない 1" in body and body.startswith(gr.MARK)
            and "| 写真 | 🟢 |  |" in body):
        print("[2] ○ 0 緑・1 赤・2 黄・skip ─。頭に赤と黄の数。緑の行には落ちた所を書かない")
    else:
        print(f"[2] ✕ 印 {marks}\n{body}")
        ng += 1
    green = gr.table("a/b", "0" * 7, [("x", "0", "")], "u", "")
    if "ぜんぶ緑" not in green or "ぜんぶ緑" in body:
        print("[2b] ✕ 頭の行の緑と赤が取り違えている")
        ng += 1

    jobs = [{"name": "browserwatch", "status": "completed", "conclusion": "failure", "steps": [
                {"name": "site の依存を入れる", "conclusion": "failure"},
                {"name": "焼き込まれた日付の字が、画面が出てから数え直されているか", "conclusion": "failure"},
                {"name": "画面が、システムの仕様を説明していないか", "conclusion": "success"}]},
            {"name": "guide", "conclusion": "success", "steps": []}]
    hr = gr.heavy_rows(jobs)
    want = [("重い見張り browserwatch", "1", "failure"),
            ("　└ 焼き込まれた日付の字が、画面が出てから数え直されているか", "1", "ログのこの step"),
            ("重い見張り reachwatch", "skip", "この run に job が無い")]
    early = gr.heavy_rows([{"name": "guide", "status": "in_progress"}], early=True)
    if hr == want and [r[1] for r in early] == ["wait", "wait"]:
        print("[3] ○ 赤い job は落ちた step を1行ずつ（土台の step は出さない）。job が無ければ ─")
    else:
        print(f"[3] ✕ {hr}")
        ng += 1

    other = {"id": 1, "body": "ほかの人のコメント"}
    f1 = Fake([other, {"id": 7, "body": gr.MARK + "\n前の表"}])
    f2 = Fake([other])
    r1, r2 = gr.upsert(f1, 9, "x"), gr.upsert(f2, 9, "x")
    if (r1, f1.calls, r2, f2.calls) == ("patched", [("PATCH", "/issues/comments/7")],
                                         "posted", [("POST", "/issues/9/comments")]):
        print("[4] ○ 印のあるコメントを書き換える。無ければ1つ足す。ほかのコメントは触らない")
    else:
        print(f"[4] ✕ {r1} {f1.calls} / {r2} {f2.calls}")
        ng += 1
    hw = gr.heavy_rows([{"name": "browserwatch", "status": "in_progress", "conclusion": None},
                        {"name": "reachwatch", "status": "completed", "conclusion": "success"}])
    tw = gr.table("a/b", "0" * 7, hw, "u", "")
    if hw[0][1] == "wait" and "⏳ 重い見張り 1本がまだ走っている" in tw and "| 重い見張り browserwatch | ⏳ |" in tw:
        print("[5] ○ まだ走っている重い見張りは ⏳（緑にも黄にも数えない）。頭の行に待っている本数")
    else:
        print(f"[5] ✕ {hw}\n{tw}")
        ng += 1

    with tempfile.TemporaryDirectory() as d:
        rows = Path(d) / "rows.tsv"
        rc = gr.run(rows, "落ちる", [sys.executable, "-c", "print('途中'); print('✕ 札が足りない'); raise SystemExit(1)"])
        rc0 = gr.run(rows, "通る", [sys.executable, "-c", "print('ok')"])
        rs = gr.read_rows(rows)
    if (rc, rc0) == (1, 0) and rs == [("落ちる", "1", "✕ 札が足りない"), ("通る", "0", "")]:
        print("[6] ○ run は回して終了コードと落ちた所の1行を残す（通った行には書かない）")
    else:
        print(f"[6] ✕ rc {rc}/{rc0} 行 {rs}")
        ng += 1
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
