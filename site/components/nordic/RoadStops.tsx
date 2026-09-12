import Icon from "@/components/ui/Icon";
import Fold from "@/components/ui/Fold";
import type { Leg } from "@/content/nordic";

/**
 * 道すじの上にある、寄り道の候補。
 *
 * 街の見どころ（`WantList`）とは別の軸。あちらは**街に着いてから歩いて見るもの**で、
 * ここは**その手前**——走っている最中に窓の外にあるもの、「ここで降ろしてもらうと、
 * こんなのがある」。
 *
 * ## 左の列に、幹線から外れる距離を並べる
 *
 * 寄るか寄らないかは、面白いかどうかでは決まらない。**何km外れるか**で決まる。
 * 車の中で片手で開く面なので、その数字が先に目に入らないと使えない。
 * だから札を行の**いちばん左**へ回して（`order: -1`）、4件ぶんの数字が縦に
 * 揃うようにした。名前より先に、数字を上から下へ舐められる。
 *
 * ## 畳む
 *
 * 1件は「何があるか・どの道か・面白さ・ヒッチハイク的にどうか」で、開いたまま
 * 並べると1件 600px、4件で 2,600px になった。いまの1日ぶんの面が 2,700〜5,100px
 * なので、**この区画ひとつで面が倍になる**（`docs/island-misses.md` #8 と
 * `docs/island-standards.md` 7）。閉じた行に「距離・名前・読み・一行」を残せば、
 * 寄るかどうかはそこで決まる。中身は押してから。
 *
 * ## これは行程表ではない
 *
 * 企画会議（`docs/island-meeting-nordic.md`）で決まった形は「乗せてくれた人に
 * 決めてもらう」だった。
 *
 * > 23:02 @茶々-d7c「貴方が素敵だと思う場所迄行って下さいとか」
 * > 23:32 @ゆうチャンネル-w8v「現地の人と行き場所一致するかは？」
 *
 * **運転手さんが選んだ場所のほうが面白い。** ここに並ぶのはその呼び水で、
 * 上書きするものではない。だから頭の一行で「寄るかどうかは車しだい」と先に言う。
 * **決まりごとに見えたら、この区画は失敗している。**
 *
 * ## 見出しは持たない
 *
 * 区画の見出し（`h2`）と紙は、面の側が持つ。ここは配列を受け取って描くだけ。
 */
export default function RoadStops({ stops }: { stops: NonNullable<Leg["stops"]> }) {
  if (stops.length === 0) return null;
  return (
    <div className="ndrs">
      {/* 決まっていないことを、いちばん先に言う。
          あとから小さく断っても、上の一覧はもう予定として読まれている。 */}
      <p className="ndrs-lead">
        道すじの上にあるものを並べました。寄るかどうかは、乗せてくれた人しだい。
        運転手さんが別のところを挙げてくれたら、そっちへ行きます。
      </p>
      <div className="folds ndrs-l">
        {stops.map((s) => (
          <Fold
            key={s.name}
            title={
              <>
                {s.name}
                <i>{s.read}</i>
              </>
            }
            lead={s.what}
            note={
              <>
                <i>道から</i>
                <b>{s.off}</b>
              </>
            }
          >
            <p className="ndrs-road">
              <Icon name="road" size={18} />
              {s.road}
            </p>
            <p className="ndrs-body">{s.body}</p>
            {/* 見立てであることを、字のすぐ後ろで断る。
                札は「親指を上げる」の区画と同じもの（`.ndhh-guess`）を使う。
                同じ意味に2つの見た目を作らない。 */}
            <p className="ndrs-ride">
              <Icon name="thumb" size={18} />
              <span>
                {s.ride}
                <em className="ndhh-guess">見立て</em>
              </span>
            </p>
          </Fold>
        ))}
      </div>
    </div>
  );
}
