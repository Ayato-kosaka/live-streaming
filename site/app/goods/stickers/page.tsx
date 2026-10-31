import type { Metadata } from "next";
import { share } from "@/lib/share";
import Link from "next/link";

import Icon from "@/components/ui/Icon";
import Notes from "@/components/live/Notes";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import StickerBook from "@/components/goods/StickerBook";
import { STICKERS } from "@/content/goods";

import "../goods.css";

/**
 * あやとステッカー。
 *
 * あやとの言葉（2026-10-13）:
 *
 * > あやとステッカー無料は、増えてきたので、「住んでいる人」みたいに
 * > 個別ページが欲しい。そこで付箋も貼れる。
 *
 * > ステッカー毎に個別ページじゃなくて、あやとステッカーとして個別ページ一枚ね
 *
 * ## なぜ `/goods` から出したのか
 *
 * 3枚が13枚になった。`/goods` は6つの欄が縦に並ぶ索引で、**そこに13枚の
 * 升目を抱えると、ほかの5つが升目の下へ沈む。** カードもキャラクターも
 * 自分の面を持っていて、`/goods` には行き先の札しか置いていないので、
 * **ステッカーだけが中身を持っている**のも揃っていなかった。
 *
 * 道は `/goods/stickers`。パンくずは「島 › あやとグッズ › あやとステッカー」で、
 * **実際の行き方とそろえる**（`docs/island-design.md` 6章）。島に入口は
 * 建てない——持って帰れるものの入口は `/goods` ひとつ（同 6章）。
 *
 * ## 作りは住民図鑑（`/friends`）に合わせる
 *
 * 紙（`.pap`）を1枚敷いて、題名の札・図鑑・付箋の欄を罫で割る。
 * 新しい見た目を作っていない。借りているのは `app/css/live.css` の
 * `.pap-*` と `.rzk-*`（住民図鑑とスタンプ帳が着ているのと同じ型）。
 *
 * ## 付箋は、この面に1つ
 *
 * 宛先は `goods-art`（「あやとステッカー」）。**新しく作らない。**
 * すでに貼られているものと、押されたハートが、そのままここに乗る
 * （`content/themes.ts` の `id` の注：id を変えると付箋が行方不明になる）。
 * `/goods` の側からは欄を外した——同じ宛先の窓が2つあると、
 * 書いた人がどちらに貼ったか分からなくなる。
 */

export const metadata: Metadata = share({
  key: "goods",
  title: "あやとステッカー",
  /* 数は手で書かない。名簿から出す（`/goods` と同じ決まり） */
  description: `島から持って帰れるステッカー${STICKERS.length}枚。落として、好きなところに貼ってください。`,
  path: "/goods/stickers",
});

export default function StickersPage() {
  return (
    <PageShell
      crumbs={[{ label: "あやとグッズ", href: "/goods" }, { label: "あやとステッカー" }]}
    >
      <PageHead
        mark={<Icon name="stamp" size={44} />}
        title="あやとステッカー"
        lead="落として、好きなところに貼ってください。"
        /* カモメが言うのは**ここでどう遊ぶか**だけ（`docs/island-design.md` 5章）。
           見出しの言い直しをしない */
        say="押すと大きく出るよ。ノートでも、スマホの画面でも、好きなところにどうぞ。"
      />

      <div className="pap-mat">
        <div className="pap">
          <b className="pap-tag">ステッカー帳</b>

          {/* 図鑑をいちばん先に出す。字より絵が先（`docs/ac-reference.md` 7章4）。
              **枚数は見出しに書かない**——1枚足した日から直すことになる
              （数は図鑑の送りが出している）。 */}
          <section className="pap-sec">
            <h2 className="pap-h">島から持って帰れる1枚、ぜんぶ</h2>
            <StickerBook />
          </section>

          {/* 付箋。**畳まない。** この面でやることは「落とす」と「ほしい絵を言う」の
              2つしかないので、片方を畳みの中に隠さない。
              `/goods` では欄が6つ並ぶので畳んであった（あちらは索引）。 */}
          <section className="pap-sec">
            <h2 className="pap-h">ほしいステッカーを出す</h2>
            {/* 見出しはすぐ上に在るので、付箋の側には出さない（`title={null}`）。
                紙（`.pap`）の上なので、紙を重ねない（`bare`） */}
            <Notes theme="goods-art" bare title={null} />
          </section>

          {/* 行き止まりを作らない。グッズの索引へ戻る道を、紙の中に置く */}
          <section className="pap-sec">
            <h2 className="pap-h">ほかに持って帰れるもの</h2>
            <div className="pap-gos">
              <Link prefetch={false} className="pap-go" href="/goods">
                <img src="/sprites/signboard.webp" alt="" />
                <span>
                  <b>あやとグッズ</b>
                  <i>カード・キャラクター・LINEスタンプ・お店</i>
                </span>
                <Icon name="right" size={14} />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </PageShell>
  );
}
