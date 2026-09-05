"""北欧旅の「その日いた人」を、手で足す・外す。

Doneru で出してくれた人は**自動で取れない**（`docs/nordic-photos.md` 4章）。
YouTube のスパチャは `python/nordic_supporters.py` が BigQuery から
毎日置きにくるが、Doneru はそこに乗らないので、ここから入れる。

「管理スクリプトを実行」（`.github/workflows/run_admin_script.yml`）から
`script: nordic_supporter` で呼ぶ。入力はほかの管理スクリプトと同じ ARGS。

ARGS 例:
  {"day": "2026-09-12", "channel": "UCxxxxxxxx", "name": "だれか"}
  {"day": "2026-09-12", "icon": "1kzs_Lm8VmHXkfcW3_7LfssXu2P6sDA47"}
  {"day": "2026-09-12", "channel": "UCxxxxxxxx", "op": "remove"}
  {"day": "2026-09-12"}                      ← いま誰が入っているか見るだけ

## どちらで入れるか

**チャンネルIDが分かるなら channel で入れる。** キャラクターの絵は
`site/content/residents.ts` を見て画面の側が引くので、あとで絵が
差し替わってもここを直さなくてよい。

分からないとき（Doneru の名前しか分からないなど）だけ `icon` で入れる。
`icon` は Google ドライブの画像ID で、`python/residents_map.json` に
載っているものだけを受け付ける。載っていない値は、画面で
「絵の出ない1マス」になるだけなので、ここで止める。

**名前は画面に出るとは限らない。** 出るのは「島に名前を出してよい」と
本人が言った人のぶんだけで、そこは islandApi が絞っている。
ここに書く名前は、あとから名簿を読み返すためのもの。
"""

import json
import os

from _fs import args, db, log, need, show

MAP_JSON = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "residents_map.json",
)


def known_icons() -> set:
    """あやとの表にあるキャラクターの絵の id。"""
    with open(MAP_JSON, encoding="utf-8") as f:
        return set(json.load(f).keys())


def main() -> None:
    """エントリポイント。"""
    a = args()
    (day,) = need(a, "day")
    ref = db().collection("nordicDays").document(day)
    cur = ref.get()
    people = list((cur.to_dict() or {}).get("people", [])) if cur.exists else []

    channel = (a.get("channel") or "").strip()
    icon = (a.get("icon") or "").strip()

    # 何も指定が無ければ、いま入っているものを出すだけ
    if not channel and not icon:
        log.info("nordicDays/%s: %d人", day, len(people))
        for p in people:
            log.info("  %s", show(p))
        return

    if icon and icon not in known_icons():
        log.error(
            "icon '%s' は residents_map.json にありません。"
            "絵の出ない1マスになるので止めます",
            icon,
        )
        raise SystemExit(1)

    def same(p: dict) -> bool:
        """同じ人か。channel が分かっていればそちらで、無ければ絵で見る。"""
        if channel:
            return p.get("channelId") == channel
        return p.get("icon") == icon

    if a.get("op") == "remove":
        after = [p for p in people if not same(p)]
        if len(after) == len(people):
            log.info("その人は入っていませんでした")
            return
        people = after
    else:
        entry = {"via": a.get("via", "doneru")}
        if channel:
            entry["channelId"] = channel
        if icon:
            entry["icon"] = icon
        if a.get("name"):
            entry["name"] = str(a["name"])[:20]
        # 同じ人が2回並ばないように、いったん外してから足す
        people = [p for p in people if not same(p)] + [entry]

    ref.set({"day": day, "people": people}, merge=True)
    log.info("nordicDays/%s: %d人", day, len(people))
    for p in people:
        log.info("  %s", show(p))


main()
