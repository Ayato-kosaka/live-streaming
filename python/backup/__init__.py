"""失ったら取り戻せないものを、本番の外へ退避する。

入口は3つ。
  python/backup/run.py       … 取る（毎晩 .github/workflows/backup.yml から）
  python/backup/restore.py   … 戻す（**本番には書けない**）
  python/admin/backup_preflight.py … 置き場の下見（読むだけ）

何を取って何を取らないかは python/backup/plan.py に、1件ずつ理由つきで書いてある。
戻しかたは docs/island-backup.md。
"""
