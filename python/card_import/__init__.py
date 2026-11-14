"""Google フォトの書き出し（Takeout）から、あやと島カードの候補を機械で選ぶ。

仕様は `docs/card-import.md`。入口は `python3 -m card_import.run`（`run.py` の頭）。
取得（`sources.py`）・数える（`measure.py` `embed.py` `scan.py`）・選ぶ（`choose.py`）・
出す（`pack.py`）を分けてあるのは、Takeout 以外の源（手元のフォルダなど）に
差し替えても、数えかたと選びかたをそのまま使うため。
"""
