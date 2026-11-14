"""守りの札。**本番では全部 True のまま。**

見張り（`python/card_import_selftest.py`）が1つずつ False にして、
その守りが外れたときに対応する足が赤くなるかを見る（対照。
`docs/island-standards.md` §15）。守りを足したら、見張りにも足を足す。
"""

ON = {
    "exactDup": True,      # 同じ sha を2度数えない
    "range": True,         # 期間の外を落とす
    "quality": True,       # ブレ・暗さ・白飛び・小ささ
    "irrelevant": True,    # スクショ・書類・レシート・画面
    "group": True,         # 似た写真を束ねて1枚にする
    "existing": True,      # すでにカードになっている写真を落とす
    "quota": True,         # 1日の上限
    "diversity": True,     # 同じ日の中で種類と見た目をばらけさせる
    "localDay": True,      # 日付は撮った土地の時刻から
    "stripExif": True,     # 出す webp から EXIF（位置）を落とす
    "resume": True,        # 読み終えたものを飛ばす
    "labels": True,        # 認識合わせの答えを効かせる
}


def on(name: str) -> bool:
    return ON[name]
