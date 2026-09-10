"use client";

import { useState } from "react";
import Icon from "@/components/ui/IconCore";
import { useOwner } from "@/components/nordic/log";
import { deleteNordicPhoto } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * 貼った写真を1枚消す。**あやとにだけ出る。**
 *
 * あやとの言葉（2026-09-10）:
 *
 * > 9月10日(木)、あやと島カード1枚追加してみたけど、イマイチだった。
 * > 消したり、編集したらはどうやってできる？導線なければ追加しておいて。
 *
 * 消す口（`DELETE /island-api/nordic/photos/{id}`）も、それを叩く関数
 * （`lib/api.ts` の `deleteNordicPhoto`）も前からあった。**呼ぶ人が
 * 1人もいなかった。** 貼れるのに消せないので、貼り間違えた1枚が
 * 本番に残り続ける。
 *
 * ## 押し間違いで消えない形にする
 *
 * 戻せないので、1回で消さない。押すと文が出て、そこでもう1度押す。
 * **確認の文で仕組みを説明しない**（`CLAUDE.md`）。読む人に要るのは
 * 「これから何が起きるか」だけなので、「置き場の実体も消えます」とは
 * 書かない。**ただしカードのことは書く。** それはこの人の話ではなく
 * **もらった人の話**で、押す前に知らないと決められない。
 *
 * ## 消せなかったときに「消えました」と言わない（#34）
 *
 * 403 でも 502 でも、返らなくても、**失敗は失敗と出してその場に留まる。**
 * 消えていないのに一覧から落とすと、次に開いたときに戻ってきて、
 * 「消したのに残っている」に見える。落とすのは口が ok を返したときだけ。
 */
export default function DropPhoto({
  photoId,
  cardCount,
  onDropped,
}: {
  photoId: string;
  /**
   * この写真からできたカードの枚数。**絵の無い人のぶんも入っている**
   * （`cards.ts` の `PhotoGroup.cardCount`）。
   * `undefined` は「数えられていない」で、**0枚ではない。**
   */
  cardCount?: number;
  /** 消えた。一覧から落として、開いている紙を閉じるのは呼んだ側の仕事 */
  onDropped: (photoId: string) => void;
}) {
  const owner = useOwner();
  const { token } = useAuth();
  /** 押して、文が出ている最中 */
  const [asking, setAsking] = useState(false);
  const [doing, setDoing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // あやと以外には1つも出さない。読めなかった人も含めて（`useOwner`）
  if (!owner) return null;

  const go = async () => {
    setErr(null);
    setDoing(true);
    try {
      const t = await token();
      if (!t) {
        setErr("ログインしなおしてください。");
        return;
      }
      await deleteNordicPhoto(photoId, t);
      /* ここまで来たときだけ落とす。**返事を待たずに閉じない** */
      onDropped(photoId);
    } catch (e) {
      /* **状態の番号や、返ってきた中身をそのまま出さない**（`CLAUDE.md`）。
         読む人に要るのは次に何をするかで、`403 {"error":…}` は中の話。
         断られたのか届かなかったのかで、次にやることが変わるので、
         そこだけ分ける（`req` は「404 …」の形で投げる。`lib/api.ts`）。 */
      const denied = /\b40[13]\b/.test(String(e));
      setErr(
        denied
          ? "消せませんでした。ログインしなおして、もう一度おしてください。"
          : "消せませんでした。電波が届いたら、もう一度おしてください。",
      );
    } finally {
      setDoing(false);
    }
  };

  if (!asking) {
    return (
      <div className="akd-drop">
        <button className="akd-drop-open" onClick={() => setAsking(true)}>
          <Icon name="close" size={13} />
          この写真を消す
        </button>
        {/* 前に失敗していたら、畳んでも消さない。**閉じたら無かったことに
            なるのが、いちばん気づかれない嘘** */}
        {err && <p className="err">{err}</p>}
      </div>
    );
  }

  return (
    <div className="akd-drop is-ask">
      <p className="akd-drop-say">
        <b>この写真を消します。戻せません。</b>
        {/* 数えられていないときは黙る。**0枚と言わない**（#34） */}
        {cardCount !== undefined && cardCount > 0 && (
          <i>この写真からできたカードが{cardCount}枚あります。一緒に消えます。</i>
        )}
      </p>
      <div className="akd-drop-row">
        {/* やめるほうを先に置く。**指がいちばん先に当たるところに、
            戻せない側を置かない**（`docs/island-design.md` 3章） */}
        <button className="akd-drop-no" onClick={() => setAsking(false)} disabled={doing}>
          やめる
        </button>
        <button className="akd-drop-yes" onClick={go} disabled={doing}>
          {doing ? "消しています…" : "消す"}
        </button>
      </div>
      {err && <p className="err">{err}</p>}
    </div>
  );
}
