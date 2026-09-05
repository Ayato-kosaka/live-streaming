"""Doneru の寄付履歴を取り出すためのモジュール。

Doneru に公開 API は無い。あるのは画面が叩いている
`api.doneru.jp/streamer/...` で、認証はブラウザの cookie だけで通る。
その cookie を GitHub Actions に持ち込むのがこのモジュール。

なぜ要るか: スパチャは `chat_messages.event_type = 'PAID'` に入っているが、
**Doneru 経由の寄付はどこにも残っていない**。
`functions/src/doneruAmount.ts` で取れるのは合計額だけで、誰がいつ出したかは
取れない（`docs/nordic-fund.md` 2.2 / 2.3）。ここが埋まると、
月末のふりかえりや「その日いてくれた人」から Doneru の人が漏れなくなる。
"""

from .client import DoneruClient, DoneruError, DoneruSessionExpired

__all__ = ["DoneruClient", "DoneruError", "DoneruSessionExpired"]
