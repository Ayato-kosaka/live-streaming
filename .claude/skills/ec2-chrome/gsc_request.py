"""**Search Console の URL 検査で「インデックス登録をリクエスト」を押す。**（EC2 の上で動く。#1262・#332）

    # 手元から（EC2 が起きていること。札は `ytstudio` の列。止めるのは idle-stop に任せる）
    python3 .claude/skills/ec2-chrome/ec2.py put .claude/skills/ec2-chrome/gsc_request.py /home/ubuntu/cdp/gsc_request.py
    python3 .claude/skills/ec2-chrome/ec2.py run <(echo 'cd /home/ubuntu/cdp && python3 gsc_request.py https://ayato-arigato.com/travel/bulgaria/sofia') 600

1面ごとに1行: 押す前の状態（「URL is on Google」など）・押したあと（リクエスト済み／上限／読めなかった）。
最後の画面を `/home/ubuntu/shots/gsc-<n>.jpg` に撮る（`ec2.py get` で持ち帰って見る）。

## なぜ道具にしたか

2026-11-18 に2回、手で CDP を組んで押した（#1264 の街と国の面・#1295 の地図の絵を読ませ直す）。1回目は押したあとの窓を
3分の内に読み取れず、「通ったかは、あすの URL 検査で」と書いた。**同じ仕事を2回したら道具にする**（`CLAUDE.md`）。

## 決めごと

- **設定は何も変えない。** 押すのは URL 検査の「インデックス登録をリクエスト」だけ（あやと島の Search Console の決め。#1262）
- 1日に押せる数には上限がある（Google の側。数は公表されていない）。**上限と出たら、残りを押さずに止める**
- 画面の言葉は英語と日本語の両方を見る（あやとの Chrome は英語で出ていた。2026-11-18）
- Chrome は `ytstudio` のプロファイル（あやとの Google でログイン済み。`/youtube-studio`）。ログインが切れていたら
  「入っていない」と1行出して止める（パスワードは打たない）
"""

from __future__ import annotations

import json
import sys
import time
import urllib.parse

sys.path.insert(0, "/home/ubuntu/cdp")
from cdp import tab, up  # noqa: E402

PROPERTY = "sc-domain:ayato-arigato.com"
BTN = ["REQUEST INDEXING", "Request indexing", "インデックス登録をリクエスト"]
DONE = ["Indexing requested", "インデックス登録をリクエスト済み", "priority crawl queue", "優先クロール キュー", "優先クロールキュー"]
QUOTA = ["Quota exceeded", "割り当て", "上限に達し"]
STATES = ["URL is on Google", "URL is not on Google", "URL is unknown to Google",
          "URL は Google に登録されています", "URL が Google に登録されていません", "URL は Google に認識されていません"]
SIGNIN = ["Sign in", "ログイン"]


def body(t) -> str:
    return t.js("document.body ? document.body.innerText : ''") or ""


def main(urls: list[str]) -> int:
    if not urls:
        print("URL を渡してください")
        return 2
    up("ytstudio", "https://search.google.com/search-console")
    t = tab("ytstudio")
    code = 0
    for n, u in enumerate(urls):
        t.go("https://search.google.com/search-console/inspect?resource_id="
             f"{urllib.parse.quote(PROPERTY, safe='')}&id={urllib.parse.quote(u, safe='')}", wait=6)
        st, b = None, ""
        for _ in range(60):                      # 検査の結果が出るまで（ふつう 10〜40秒）
            b = body(t)
            st = next((s for s in STATES if s in b), None)
            if st and any(x in b for x in BTN):
                break
            time.sleep(2)
        if not st:
            signed_out = any(x in b[:400] for x in SIGNIN) and "search-console" not in (t.url() or "")
            print(f"{u}\t前: {'入っていない（ログインが切れている）' if signed_out else '検査の結果が読めなかった'}")
            t.shot(f"/home/ubuntu/shots/gsc-{n}.jpg")
            code = 1
            if signed_out:
                return 1
            continue
        find = ("(() => { const want = %s; const els = [...document.querySelectorAll('span,div,button,[role=button]')];"
                " for (const w of want) { const e = els.find(x => x.childElementCount === 0 && x.textContent.trim() === w"
                " && x.getBoundingClientRect().width > 0); if (e) return e.closest('[role=button],button') || e; }"
                " return null; })()") % json.dumps(BTN)
        try:
            t.click(find)
        except RuntimeError:
            print(f"{u}\t前: {st}\t後: 押すところが見つからなかった")
            t.shot(f"/home/ubuntu/shots/gsc-{n}.jpg")
            code = 1
            continue
        res = None
        for _ in range(120):                     # リクエストの窓（ふつう 1〜2分。前回は3分で読めなかった）
            b = body(t)
            if any(x in b for x in DONE):
                res = "リクエスト済み"
                break
            if any(x in b for x in QUOTA):
                res = "上限（今日はもう押せない）"
                break
            time.sleep(2)
        print(f"{u}\t前: {st}\t後: {res or '4分で読めなかった'}")
        t.shot(f"/home/ubuntu/shots/gsc-{n}.jpg")
        if res and res.startswith("上限"):
            return 1
        if not res:
            code = 1
        # 窓を閉じて次へ（閉じなくても次の go で消えるが、押しどころを残さない）
        t.key("Escape")
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
