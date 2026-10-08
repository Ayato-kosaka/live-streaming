import type { Metadata } from "next";
import Link from "next/link";

import Fold from "@/components/ui/Fold";
import Icon, { type IconName } from "@/components/ui/Icon";
import Notes from "@/components/live/Notes";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import StampVotes from "@/components/goods/StampVotes";
import { LINE_STAMPS, LINE_WORDS, STICKERS, SUZURI } from "@/content/goods";

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
 * カレンダーと LINEスタンプは**まだ何も決まっていない**。
 * 同じ顔で並べると、押して初めて「まだ無い」と分かる欄ができる。
 * 札（`.gd-tag`）と地の色で、開く前に見分けがつくようにした。
 *
 * ## 付箋は、欄の中に置く
 *
 * 宛先は**きのう足した3つ**（`content/themes.ts` の `goods-art` /
 * `goods-calendar` / `goods-linestamp`）。新しくは作らない。
 * 掲示板（`/board`）へ送らずにここで書けるのは、あやとの
 * 「該当の付箋も読み書きできる」に合わせたもの。
 *
 * **畳んで置く。** 3つぶんの書く欄を開いたまま並べると、それだけで
 * 900px を超えて、グッズそのものが画面の外へ出る
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
        say="ステッカーは、押せばその場で落とせるよ。「検討中」のは、ほしい形を書いてって。"
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
          {/* **1枚ぶんを決め打ちしない。** `STICKERS[0]` と書いていたので、
              2枚目を足した日に増えたのはデータだけで、面は1枚のままだった。
              増えても減っても、ここは並べるだけにしておく */}
          {STICKERS.map((sticker) => (
            <div className="gd-sticker" key={sticker.id}>
              <img
                className="gd-stickerart"
                src={sticker.art}
                alt={sticker.name}
                width={sticker.w}
                height={sticker.h}
              />
              <span className="gd-stickerside">
                <b>{sticker.name}</b>
                {/* **落ちてくるのは元絵そのまま。** 面に出しているのは小さく
                    焼いたほうで、押したときだけ大きいほうを取りにいく
                    （`content/goods.ts`）。`download` を付けるので、
                    押すと開かずに手元へ落ちる */}
                <a className="gd-get" href={sticker.file} download={sticker.saveAs}>
                  <Icon name="download" size={18} />
                  おとす
                </a>
              </span>
            </div>
          ))}
          <Say
            theme="goods-art"
            title="自分の1枚を出す"
            lead="描いたもの、撮ったもの。絵も貼れる"
          />
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
              <i>島のみんなの絵が、作った順に並んでいる</i>
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
          lead="壁にかけるか、机に置くか。どの月にどの写真が来るか。まだ何も決まっていません。"
        >
          <Say
            theme="goods-calendar"
            title="こんなのがほしい、を出す"
            lead="写真も貼れる。1枚でも、12枚ぶんの案でも"
          />
        </Sec>

        {/* ---- 5. LINEスタンプ ------------------------------------------ */}
        <Sec
          id="linestamp"
          icon="talk"
          title="LINEスタンプ"
          tag="検討中"
          /* **「絵はこれから」と書かない。** 絵が届いたので、書いたままだと
             その日から嘘になる。数は `LINE_STAMPS` から出す（足した日に直し忘れない） */
          lead={`あやとの${LINE_STAMPS.length}枚。どれがいいか、押して教えてください。`}
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
              数えているので、外へ出るものは素の `<a>` のままにする */}
          <a
            className="gd-go gd-out"
            href={SUZURI.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src={SUZURI.thumb}
              alt=""
              width={SUZURI.w}
              height={SUZURI.h}
              loading="lazy"
            />
            <span>
              <b>{SUZURI.cap}</b>
              <i>{SUZURI.note}</i>
            </span>
            <Icon name="external" size={16} />
          </a>
        </Sec>
      </div>
    </PageShell>
  );
}
