import type { Metadata } from "next";
import Link from "next/link";

import Fold from "@/components/ui/Fold";
import Icon, { type IconName } from "@/components/ui/Icon";
import Notes from "@/components/live/Notes";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import CalendarMonths from "@/components/goods/CalendarMonths";
import StampVotes from "@/components/goods/StampVotes";
import {
  CAL_MONTHS,
  CAL_SHOWN,
  LINE_STAMPS,
  LINE_WANT,
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
 * 6つのうち、ステッカー・カード・キャラクターは**もう手に入る**。
 * カレンダーと LINEスタンプは**まだ形が決まりきっていない**。
 * 同じ顔で並べると、押して初めて「まだ無い」と分かる欄ができる。
 * 札（`.gd-tag`）と地の色で、開く前に見分けがつくようにした。
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

export const metadata: Metadata = {
  title: "あやとグッズ",
  /* 数は手で書かない。載っているものから作る（`/north-macedonia` と同じ） */
  description: `島から持って帰れるものと、これからいっしょに決めるもの。ステッカー${STICKERS.length}枚、LINEスタンプの一言${LINE_STAMPS.length}。`,
};

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
  /** 開く前に分かる1語。「無料」か「検討中」 */
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
  lead: string;
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
 * 索引に残すステッカーの枚数。**4枚**（390px で2×2、広い画面で1列）。
 *
 * **ここで「どれを出すか」を決めない。** 名簿（`STICKERS`）の頭から取る。
 * 選び直すと、並びの表がこの面と `content/goods.ts` の2つになる。
 */
const PEEK = 4;

/**
 * あやとのセリフで、まだ決まっていない数。
 *
 * **手で書かない。** 絵が1枚届いた日に、面の「あと◯つ」だけが古くなる。
 * 埋まったら 0 になって、募集の字そのものが消える。
 */
const LINE_LEFT = Math.max(0, LINE_WANT - LINE_STAMPS.length);

/**
 * カレンダーの、まだ絵の載っていない月の数。**これも手で書かない。**
 * 12か月そろったら 0 になって、「できたものから載せます」の1行が消える。
 */
const CAL_LEFT = CAL_MONTHS.length - CAL_SHOWN.length;

export default function GoodsPage() {
  return (
    <PageShell crumbs={[{ label: "あやとグッズ" }]}>
      <PageHead
        mark={<Icon name="gift" size={44} />}
        title="あやとグッズ"
        lead="島から持って帰れるものと、まだ形の決まっていないもの。"
        /* **数を言わない。** 「上の3つ」と書くと、1つ足した日から嘘になる。
           どれが持って帰れてどれがまだかは、欄の札（無料／検討中）が言っている。
           「無料のは落とせる」とも書かない——カードとキャラクターは、
           落とせる場所がこの面ではなく、それぞれの面のほうにある */
        /* **「その場で落とせる」とは言わない**（2026-10-13）。ステッカーは
           自分の面へ出たので、落とすのは押した先。ここで言えるのは
           「押した先で落とせる」まで */
        say="ステッカーもカードも、押した先で落とせるよ。「検討中」のは、ほしい形を書いてって。"
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

        {/* ---- 4. カレンダー -------------------------------------------- */}
        <Sec
          id="calendar"
          icon="calendar"
          title="カレンダー"
          tag="検討中"
          /* **「どの絵がいいか押して」はもう言わない**（あやと 2026-10-12、#759。
             イラストで行くと決まった）。言うのは、このカレンダーが何か——
             1年ぶんの思い出が、月ごとに1枚ずつ載る——だけ。
             「2026年の」と書かない（暦11・12月は 2025年の思い出）。
             値段も寸法も書かない（`island-standards.md` 16章）。
             仕組みの説明も1文字も置かない（同 6章） */
          lead="この1年の思い出を、月ごとに1枚の絵に。"
        >
          <CalendarMonths />
          {/* まだの月を**並べない・名指ししない**。言うのは「これから増える」だけ。
              0か月のときは「ほか」が無いので言い方を変える。そろったら出さない */}
          {CAL_LEFT > 0 && (
            <p className="gd-note">
              {CAL_SHOWN.length > 0
                ? "ほかの月は、できたものから載せます。"
                : "できた月から、ここに載せます。"}
            </p>
          )}
          <Say
            theme="goods-calendar"
            title="ほかの絵を出す"
            lead="こんな絵がいい、を一言でも。写真も貼れる"
          />
        </Sec>

        {/* ---- 5. LINEスタンプ ------------------------------------------ */}
        <Sec
          id="linestamp"
          icon="talk"
          title="LINEスタンプ"
          tag="検討中"
          /* **「絵はこれから」と書かない。** 絵が届いたので、書いたままだと
             その日から嘘になる。数は `LINE_STAMPS` から出す（足した日に直し忘れない）。

             **何を集めている欄なのかを、頭で言う。** 「あやとの11枚。どれがいいか」
             だけだと、11枚から選ぶ話にしか読めない。集めているのは、まだ決まって
             いないぶんのセリフのほう（あやと #701）。
             残りの数も手で書かない（`content/goods.ts` の `LINE_WANT`）。
             埋まったら募集の字は出さない——0枚を募る字が残らないように */
          lead={
            LINE_LEFT > 0
              ? `あと${LINE_LEFT}つ、セリフが決まっていません。いいと思ったものを押して、ほしい一言を出してください。`
              : `あやとの${LINE_STAMPS.length}枚。いいと思ったものを押して教えてください。`
          }
        >
          <StampVotes />
          <Say
            theme="goods-linestamp"
            title="ほかのセリフを出す"
            lead="候補の絵も貼れる"
            /* 10枚の枠がすでに同じ字を出している。一覧にも出すと2回ならぶ */
            omit={LINE_WORDS}
          />
        </Sec>

        {/* ---- 6. SUZURI ------------------------------------------------ */}
        <Sec
          id="suzuri"
          icon="shirt"
          title="SUZURI のグッズ"
          tag="お店"
          lead={`ここだけ、島の外のお店です。${SUZURI.what}`}
        >
          {/* **外に出ることが分かる印を付ける**（`Icon` の `external`）。
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
              「ぜんぶ見る → イギリスぶらら を先頭にして」）。住人の100人ぶんも
              ステッカーぶんもあちらに在るので、ここで数えずに店へ送る
              （数えると、1つ増えた日から嘘になる）。
              その次がトート——店でいちばん古いデザインで、新しい順だと
              後ろに沈むが、**店の顔はこちら**（`content/goods.ts` の並びの注）。 */}
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
                <b>{SUZURI.cap}</b>
                <span className="gd-get">
                  <Icon name="external" size={16} />
                  ぜんぶ見る
                </span>
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
                  <b>{goods.name}</b>
                  <span className="gd-get">
                    <Icon name="external" size={16} />
                    お店で見る
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {/* あやとの言葉（2026-10-11）:

              > こんなスズリグッズが欲しい！ を書けるように付箋作って

              **ほかの3つと同じ `Say`（畳んだ付箋）にそろえる。** この面の中で
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
