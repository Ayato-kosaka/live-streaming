"use client";

import { yenText } from "./yen";

/**
 * ④ 払う前の、いちばん最後の1枚（特定商取引法 12条の6 の「最終確認」）。
 *
 * ここで言うのは、**払う額・何に払うか・払ったあと取り消せないこと**の3つと、押したら何が起きるか。
 * 「払う」を押すまでは何も払われない。押したら支払いの画面へ移る。
 */
export default function TipCheck({
  yen,
  message,
  sending,
  fail,
  canPay,
  onPay,
  onBack,
  signInAgain,
}: {
  yen: number;
  message: string;
  sending: boolean;
  /** 口に断られたときの1行 */
  fail?: string | null;
  /** 今日はもう作れない、のように押しても通らないときは false */
  canPay: boolean;
  onPay: () => void;
  onBack: () => void;
  /** 入りなおしてからでないと通らないときの押しどころ */
  signInAgain?: React.ReactNode;
}) {
  return (
    <section className="panel paper tip-paper">
      <h2>これで投げる？</h2>
      <dl className="tip-slip">
        <div className="tip-slip-yen">
          <dt>払う額</dt>
          <dd>{yenText(yen)}</dd>
        </div>
        <div>
          <dt>なにに</dt>
          <dd>メッセージを、配信のアラートに出す</dd>
        </div>
        <div className="tip-slip-msg">
          <dt>メッセージ</dt>
          <dd>{message.trim() ? message : <span className="tip-none">なし（名前と額だけ出る）</span>}</dd>
        </div>
        <div className="tip-slip-no">
          <dt>取り消し</dt>
          <dd>払ったあとは、取り消せない</dd>
        </div>
      </dl>

      {fail && <p className="err">{fail}</p>}
      {signInAgain}
      <button type="button" className="bbtn tip-go" disabled={sending || !canPay} onClick={onPay}>
        {sending ? "つないでいます…" : `${yenText(yen)} を払う`}
      </button>
      <p className="tip-next">押すと、支払いの画面に移ります。</p>
      <button type="button" className="tip-back" onClick={onBack} disabled={sending}>
        なおす
      </button>
    </section>
  );
}
