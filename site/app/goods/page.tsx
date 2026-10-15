import type { Metadata } from "next";
import { share } from "@/lib/share";
import Link from "next/link";
import { Fragment } from "react";

import Fold from "@/components/ui/Fold";
import Icon, { type IconName } from "@/components/ui/Icon";
import Notes from "@/components/live/Notes";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import Phrase from "@/components/ui/Phrase";
import StampVotes from "@/components/goods/StampVotes";
import { shutDest, themeById } from "@/content/themes";
import {
  LINE_PRICE,
  LINE_RESIDENTS,
  LINE_STAMPS,
  LINE_WORDS,
  SHOP_GOODS,
  shopHref,
  STICKERS,
  SUZURI,
} from "@/content/goods";

import "./goods.css";

/**
 * あやとグッズ。
 *
 * あやとの言葉（2026-10-08）は `content/goods.ts` の頭にそのまま置いてある。
 * 並べる6つも、その順も、あちらが決めたとおり。
 *
 * ## 「もう在る」と「まだ決めていない」を、形で分ける
 *
 * ステッカー・カード・キャラクターは**もう手に入る**。LINEスタンプは
 * 2026-10-14 に申請を終えて**審査中**（形は決まったが、まだ手に入らない）。
 * 同じ顔で並べると、押して初めて「まだ無い」と分かる欄ができる。
 * 札（`.gd-tag`）と地の色で、開く前に見分けがつくようにした。
 *
 * **カレンダーの欄は 2026-10-14 に消した**（あやと「カレンダー検討中の項目は
 * 削除して、付箋も閉じて」）。SUZURI に出品したので、カレンダーは
 * **SUZURI の升目の1マス**になる（`content/goods.ts` の `SHOP_GOODS`）。
 * 同じ品の入口を2つ置かない。月ごとの絵（`public/goods/calendar/`）と
 * 焼く道具（`tools/goods/calbake.py`）は、出品と来年のために残してある。
 *
 * ## 付箋は、欄の中に置く
 *
 * 宛先は `content/themes.ts` の `GOODS_GROUP` の束。**ただし
 * `goods-art`（あやとステッカー）の欄は、この面には無い**——
 * 2026-10-13 にステッカーが自分の面（`/goods/stickers`）へ出たので、
 * 書く窓もそちらへ移した。**同じ宛先の窓を2つ置かない。**
 * **数をここに書かない**——欄を1つ足した日に、この説明だけが古くなる。
 * 掲示板（`/board`）へ送らずにここで書けるのは、あやとの
 * 「該当の付箋も読み書きできる」に合わせたもの。
 *
 * **畳んで置く。** 書く欄を開いたまま並べると、1つで 300px 近く取るので、
 * 欄の数ぶんでグッズそのものが画面の外へ出る
 * （`docs/island-design.md` 4章）。
 *
 * ## 誰がもらえるか、は1文字も書かない
 *
 * 貢献額も順位も、**選びかたも**出さない（`docs/island-money.md`）。
 * 「投げ銭の多い人から」と書けば、出ている人がそのまま順位表になる。
 */

export const metadata: Metadata = share({
  key: "goods",
  title: "あやとグッズ",
  /* 数は手で書かない。載っているものから作る（`/north-macedonia` と同じ） */
  description: `島から持って帰れるものと、お店で買えるもの。ステッカー${STICKERS.length}枚、LINEスタンプ${LINE_STAMPS.length + LINE_RESIDENTS}種類。`,
  path: "/goods",
});

/** 欄ひとつ。**絵と札は、ここ1か所で決める** */
function Sec({
  id,
  icon,
  title,
  tag,
  lead,
  children,
}: {
  id: string;
  icon: IconName;
  title: string;
  /** 開く前に分かる1語。「無料」「審査中」「お店」 */
  tag: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    /* 器は島の「紙の型」をそのまま借りる（`app/css/pages.css` の
       `.panel.paper`）。同じ用事の面が2通りの見た目を持つと、
       島の中で部屋が増えたように見える（`docs/island-design.md`） */
    <section className="panel paper gd-sec" id={id} data-tag={tag}>
      <h2 className="gd-h">
        <Icon name={icon} size={26} />
        <b>{title}</b>
        <em className="gd-tag">{tag}</em>
      </h2>
      <p className="gd-lead">{lead}</p>
      {children}
    </section>
  );
}

/** 付箋の欄。**畳んで置く**（開く欄が3つ縦に並ぶと、グッズが画面から出る） */
function Say({ theme, title, lead, omit }: {
  theme: string;
  title: string;
  /** 畳んだままで見える一行。締め切った宛先では書く話をしないので、無くてよい */
  lead?: string;
  omit?: string[];
}) {
  return (
    <div className="gd-say">
      <Fold title={title} lead={lead}>
        <Notes theme={theme} bare title={null} omitTexts={omit} />
      </Fold>
    </div>
  );
}

/**
 * SUZURI の升目の題と、外へ出る印。
 *
 * **印は題の終わりに字と同じ行で付ける。** 題の横に別の柱として立てると、
 * 印のぶん題の幅が削れて「Tシ／ャツ」「ぶら／ぶら」のように折れる
 * （2026-10-14 に 390px で撮って見た）。**最後の1字と印を離さない**——
 * 離せる形だと、印だけが次の行に落ちる日が来る。
 */
function ShopName({ name, parts }: { name: string; parts?: string[] }) {
  /* 切れ目（`ShopGoods.nameParts`）は、つなぐと題と同じ字のときだけ使う。
     食い違った切れ目で題の字が変わると、押した先の店の題と合わなくなる */
  const segs = parts && parts.join("") === name ? [...parts] : [name];
  const tail = Array.from(segs.pop() ?? "");
  const last = tail.pop() ?? "";
  return (
    <b className="gd-shopname">
      {segs.map((seg) => (
        <Fragment key={seg}>
          {seg}
          <wbr />
        </Fragment>
      ))}
      {tail.join("")}
      <span className="gd-shoptail">
        {last}
        <Icon name="external" size={14} />
      </span>
    </b>
  );
}

/**
 * 索引に残すステッカーの枚数。**4枚**（390px で2×2、広い画面で1列）。
 *
 * **ここで「どれを出すか」を決めない。** 名簿（`STICKERS`）の頭から取る。
 * 選び直すと、並びの表がこの面と `content/goods.ts` の2つになる。
 */
const PEEK = 4;

/**
 * LINEスタンプの付箋が締め切られているか（2026-10-14 に畳んだ）。
 *
 * **判定は島の表の1本**（`content/themes.ts` の `shutDest`）。畳んだ日に
 * 畳みの題（「ほかのセリフを出す」→ 読むだけの題）もここで切り替わる。
 * 付箋の窓の中身（書く段を出さない・締め切りの1行）は `Notes` が同じ判定で決める。
 */
/* **ここは机から足したぶんを重ねない**（2026-10-15）。貼り先は机から締め切れる
   ようになったが、この定数が決めるのは**畳みの題と一行だけ**で、書く窓そのものは
   `Notes` が重ねた側（`lib/dests.ts`）で判断する——机で締め切れば窓は閉じる。
   題のほうは読み込み時に1回決まる定数で、`output: "export"` なので焼いた字が
   そのまま配られる。**焼き込みの貼り先1つを名指しした字**なので、変えるなら
   `content/themes.ts` の1行を変えて焼き直すほうが筋が通る。 */
const LINE_SHUT = shutDest(themeById("goods-linestamp"), null);

export default function GoodsPage() {
  return (
    <PageShell crumbs={[{ label: "あやとグッズ" }]}>
      <PageHead
        mark={<Icon name="gift" size={44} />}
        title="あやとグッズ"
        /* 「まだ形の決まっていないもの」は外した（2026-10-14）。そう呼べたのは
           カレンダーの欄で、出品して欄ごと消えた。
           **読点で折る**（`Phrase`）。何もしないと 390px で「…お店で買える／もの。」と
           「もの。」だけが2行目に落ちた */
        lead={<Phrase parts={["島から持って帰れるものと、", "お店で買えるもの。"]} />}
        /* **数を言わない。** 「上の3つ」と書くと、1つ足した日から嘘になる。
           どれが持って帰れてどれがまだかは、欄の札（無料／審査中）が言っている。
           「無料のは落とせる」とも書かない——カードとキャラクターは、
           落とせる場所がこの面ではなく、それぞれの面のほうにある */
        /* **「その場で落とせる」とは言わない**（2026-10-13）。ステッカーは
           自分の面へ出たので、落とすのは押した先。ここで言えるのは
           「押した先で落とせる」まで */
        /* **「検討中」を名指ししない**（2026-10-14）。その札を持っていた
           カレンダーの欄を消したので、指す先が無くなった。ほしい形を書く窓は
           いま SUZURI の欄の付箋だけなので、そちらを言う */
        say="ステッカーもカードも、押した先で落とせるよ。ほしいグッズは、お店の欄に書いてって。"
      />

      <div className="gdbook">
        {/* ---- 1. ステッカー ------------------------------------------- */}
        <Sec
          id="sticker"
          icon="stamp"
          title="あやとステッカー"
          tag="無料"
          /* **「島を歩いているあやと」と書かない。** 1枚だったころの字で、
             ヒッチハイクの1枚が増えた日から合わなくなる。数も書かない
             （足すたびに直すことになる）。 */
          lead="落として、好きなところに貼ってください。"
        >
          {/* **升目はこの面から出した**（2026-10-13）。あやとの言葉:

              > あやとステッカー無料は、増えてきたので、「住んでいる人」みたいに
              > 個別ページが欲しい。そこで付箋も貼れる。

              3枚が13枚になって、升目だけで欄の背が 600px を超えていた。
              この面は**持って帰れるものの索引**で、カードもキャラクターも
              行き先の札1枚しか置いていない。ステッカーだけが中身を抱えていると、
              下の5つが升目の下へ沈む（`docs/island-standards.md` 7章）。

              **絵は何枚か残す。** 字の札1枚に替えると、ここだけ絵が消えて
              索引が急に静かになる。並べるのは名簿の頭から——
              **どれを出すかを別に決めない**（決めると、並びの表が2つになる）。 */}
          <Link className="gd-go gd-peek" href="/goods/stickers" prefetch={false}>
            {/* **ここは升目用の小さい写し（`stickerThumb`。長辺160）に替えない。**
                図鑑のマスは 390px の画面で 40.1px だが、ここの4枚は 148px
                （実測。`.gd-peekshots` は 140px 下限の2列）。dpr2 で 296px、
                dpr3 で 444px 要るので、長辺480 の `art` がちょうど。
                160 に落とすと、索引のほうだけ粗くなる（#885） */}
            <span className="gd-peekshots">
              {STICKERS.slice(0, PEEK).map((sticker) => (
                <img
                  key={sticker.id}
                  src={sticker.art}
                  alt=""
                  width={sticker.w}
                  height={sticker.h}
                  loading="lazy"
                />
              ))}
            </span>
            <span className="gd-peekside">
              <span>
                <b>あやとステッカー</b>
                <i>持って帰れる1枚が、ぜんぶ並んでいる</i>
              </span>
              <Icon name="right" size={16} />
            </span>
          </Link>
        </Sec>

        {/* ---- 2. あやと島カード ---------------------------------------- */}
        <Sec
          id="cards"
          icon="photo"
          title="あやと島カード"
          tag="無料"
          lead="その日の配信で撮った写真。キャラクターを1人だけ入れて持って帰れます。"
        >
          <Link className="gd-go" href="/cards" prefetch={false}>
            <span>
              <b>あやと島カード</b>
              <i>配信のあった日の写真が、ぜんぶ並んでいる</i>
            </span>
            <Icon name="right" size={16} />
          </Link>
        </Sec>

        {/* ---- 3. キャラクター ------------------------------------------ */}
        <Sec
          id="character"
          icon="friends"
          title="キャラクター"
          tag="無料"
          lead="島を歩いている一人ひとりの絵。図鑑から、自分の1枚を落とせます。"
        >
          <Link className="gd-go" href="/friends" prefetch={false}>
            <span>
              <b>住んでる人</b>
              <i>島のみんなの絵が、ぜんぶ並んでいる</i>
            </span>
            <Icon name="right" size={16} />
          </Link>
          {/* **誰のキャラクターをグッズにするかは、まだ決まっていない。**
              ここに名簿から誰かを並べると、並んだ人が「決まった人」に見える。
              選びかた（何を見て選ぶか）も書かない——書いた時点で、
              出ている人が順位表になる（`docs/island-money.md`）。 */}
          <p className="gd-note">グッズになるキャラクターは、これから決めます。</p>
        </Sec>

        {/* ---- 4. LINEスタンプ ------------------------------------------ */}
        <Sec
          id="linestamp"
          icon="talk"
          title="LINEスタンプ"
          tag="審査中"
          /* **言うのは、何が起きたかと、これから何が起きるかだけ**
             （`docs/island-standards.md` 6章）。「いま審査中」は札が言っているので
             ここでは繰り返さない。

             **住人の名前も顔ぶれも、選びかたも書かない**（#716。名簿は投げ銭の
             順位そのもの）。出してよいのは数まで。数は手で書かず、
             `LINE_STAMPS`（あやとのぶん）と `LINE_RESIDENTS` から出す。
             値段の決めかたも書かない。値段そのものは書いてよい（あやと 2026-10-14） */
          lead={`あやとと島の住人${LINE_RESIDENTS}人の、${LINE_STAMPS.length + LINE_RESIDENTS}種類のスタンプを LINE に申請しました。出たら、ここからお店に行けるようにします。1セット${LINE_PRICE}円です。`}
        >
          <StampVotes />
          {/* **締め切ったら、書く話をしない。** 題が「ほかのセリフを出す」のままだと、
              開いた先に窓が無い（`Notes` の `shut`）。開く前の字と開いた中身を
              同じことにそろえる。貼られた付箋は今までどおり読める */}
          <Say
            theme="goods-linestamp"
            title={LINE_SHUT ? "みんなが出したセリフ" : "ほかのセリフを出す"}
            lead={LINE_SHUT ? undefined : "候補の絵も貼れる"}
            /* 17枚の枠がすでに同じ字を出している。一覧にも出すと2回ならぶ */
            omit={LINE_WORDS}
          />
        </Sec>

        {/* ---- 5. SUZURI ------------------------------------------------ */}
        <Sec
          id="suzuri"
          icon="shirt"
          title="SUZURI のグッズ"
          tag="お店"
          lead={`ここだけ、島の外のお店です。${SUZURI.what}`}
        >
          {/* **外に出ることが分かる印を付ける**（`Icon` の `external`）。
              **字は付けない**（あやと 2026-10-14「『お店でみる』などの文言は
              消して」）。前はマスの下に「お店で見る」「ぜんぶ見る」を1行ずつ
              置いていたが、**升目のマスは全部同じ動き**をするので、同じ字が
              7回ならぶだけだった。島の外へ出ることは欄の一行（「ここだけ、
              島の外のお店です」）と、題の右の印が言う。印は題に寄せる——
              絵の上に載せると、商品の写真の一部に見える。
              新しいタブで開いて、こちらの窓への参照は渡さない
              （`noopener`。`noreferrer` で、どこから来たかも渡さない）。
              `prefetch` の見張り（`prefetch_selftest.mjs`）は `<Link>` を
              数えているので、外へ出るものは素の `<a>` のままにする。

              **店の入口1つだったところを、升目にした**（あやと 2026-10-13）。
              前は外部リンクが1本あるだけで、押した先の店は JS で描かれる
              一覧なので、**どこに何が在るのかは押してから探すしかなかった。**
              住人グッズとあやとステッカーはそれぞれの面から行けるようになり、
              **どちらからも行けないものだけ**がここに残る（`SHOP_GOODS`）。

              **ステッカーの升目と同じ形にそろえる。** 同じ面の中に升目が
              2通りあると、別の仕掛けに見える。**升目ぜんぶが押せるので、
              1枚ずつに厚みは付けない**（`docs/island-design.md` 3-3 の例外）。

              **いちばん前の1マスが店そのもの**（あやと 2026-10-13
              「ぜんぶ見る → イギリスぶらら を先頭にして」。題は 2026-10-14 に
              「あやとの店」から「全部見る」へ）。住人の100人ぶんも
              ステッカーぶんもあちらに在るので、ここで数えずに店へ送る
              （数えると、1つ増えた日から嘘になる）。
              その次がトート——店でいちばん古いデザインで、新しい順だと
              後ろに沈むが、**店の顔はこちら**（`content/goods.ts` の並びの注）。
              3つ目がカレンダー（あやと 2026-10-14）。 */}
          <ul className="gd-shopgrid">
            <li>
              <a
                className="gd-shopitem gd-shopall"
                href={SUZURI.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  className="gd-shopart"
                  src={SUZURI.shot.src}
                  alt={SUZURI.shot.alt}
                  width={SUZURI.shot.w}
                  height={SUZURI.shot.h}
                  loading="lazy"
                />
                <ShopName name={SUZURI.cap} />
              </a>
            </li>
            {SHOP_GOODS.map((goods) => (
              <li key={goods.id}>
                <a
                  className="gd-shopitem"
                  href={shopHref(goods.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {/* **ここはステッカーの升目と違って、絵を飾り扱いにしない。**
                      あちらは名前が絵の説明そのもの（「島にいるあやと」）だが、
                      こちらの名前は品名で、**何が描いてあるかは名前から分からない。**
                      消すと、目で見ない人には白いTシャツ2枚の区別が付かなくなる */}
                  <img
                    className="gd-shopart"
                    src={goods.shot.src}
                    alt={goods.shot.alt}
                    width={goods.shot.w}
                    height={goods.shot.h}
                    loading="lazy"
                  />
                  <ShopName name={goods.name} parts={goods.nameParts} />
                </a>
              </li>
            ))}
          </ul>
          {/* あやとの言葉（2026-10-11）:

              > こんなスズリグッズが欲しい！ を書けるように付箋作って

              **LINEスタンプの欄と同じ `Say`（畳んだ付箋）にそろえる。** この面の中で
              「ほしい形を書く」の置き方が2通りあると、別の仕掛けに見える。

              **ここに品ぞろえ・値段・個数を1文字も足さない**（`content/goods.ts`
              の `SUZURI` の頭。向こうが持っているものを焼くと、変わった日から
              嘘になる）。だから題も一行も、**書く人の側のこと**だけを言う。 */}
          <Say
            theme="goods-suzuri"
            title="ほしいグッズを出す"
            lead="こんなのがほしい、を一言でも。絵も貼れる"
          />
        </Sec>
      </div>
    </PageShell>
  );
}
