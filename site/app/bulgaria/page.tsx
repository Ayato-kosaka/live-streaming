import type { Metadata } from "next";
import Link from "next/link";

import BgMapSvg from "@/components/bulgaria/BgMapSvg";
import { crumbOf } from "@/components/island/layout";
import StickyNotes from "@/components/live/Notes";
import Fold from "@/components/ui/Fold";
import Icon, { type IconName } from "@/components/ui/Icon";
import PageShell from "@/components/ui/PageShell";
import { share } from "@/lib/share";
import {
  BG_BASICS,
  BG_BUY,
  BG_COURSE,
  BG_COURSE_NOTE,
  BG_EVENTS,
  BG_FACTS,
  BG_FOOD,
  BG_HERO,
  BG_HISTORY,
  BG_IMAGE,
  BG_LEAD,
  BG_RATE,
  BG_SPOTS,
  BG_TODO,
  BG_WORDS,
  type Mark,
} from "@/content/bulgaria";

import "./bg.css";

/**
 * ブルガリア（ソフィア）の歩きかた。
 *
 * ## 作り直した理由（2026-11-06・あやと）
 *
 * > 見ましたが25点くらい。写真もgoogle mapもなくて、ほかの人が見てワクワクしない、
 * > 全くみたいと思わない。文字が多い。写真メインにしたい。
 * > 付箋を張る仕組みもない。文字化けが混じってる。縦長すぎて読みにくい。
 *
 * **1枚目は「字で正しい面」だった。** 調べた中身は合っていたが、
 * 見たくなる面になっていなかった。直したのは4つ:
 *
 * | | |
 * | --- | --- |
 * | **写真を主役に** | 見どころ・食べもの・買いものは、まず絵。字は押すまで出さない |
 * | **本物の地図** | 自前の丸だけの絵をやめて、通りと公園の見える地図を敷く |
 * | **縦を切る** | 狭い画面で 44,000px あった。絵の格子と畳みで、1画面に入る数を増やす |
 * | **付箋** | 視聴者さんが「ここ行って」を貼れる板（`content/themes.ts` の `bulgaria`） |
 *
 * ## 重要度は2本立てのまま
 *
 * | | |
 * | --- | --- |
 * | **星**（★1〜3） | 一般の重要度。必見／行けたら／余裕があれば |
 * | **印**（◎○⚠） | **あやとに合うか** |
 *
 * 混ぜない。ブルガリア料理の看板は豚で、**あやとは豚が苦手**（ハム・ソーセージも）。
 * 酒も2年ほど前にやめている。普通に名物を並べると**半分が食べられないもの**になる。
 * **⚠ を隠さない。** 出したうえで、なぜかを1行添える。
 *
 * 印は手で書いていない。`python/build_bulgaria.py` が、議事録から実測した好み
 * （`python/data/bulgaria/taste.json`）を規則1本に通して付けている。
 *
 * ## 文章も写真も、1つもここに書かない
 *
 * `content/bulgaria.ts` を読むだけ。あれは `python/build_bulgaria.py` が
 * `python/data/bulgaria/*.json` から焼く。**直すなら JSON のほう。**
 *
 * ## 日付を焼かない
 *
 * 静的書き出しなので、ここに書いた字は次のビルドまで直らない。
 * トップに出す期間の入れ替えは `components/isle/spec.ts` の `GUIDES` が持っていて、
 * あちらは**画面が出てから**今日の日付で選び直す。
 */

export const metadata: Metadata = share({
  key: "bulgaria",
  title: "ブルガリア・ソフィア — 歩きかた",
  description: `ローマの遺跡と、ただで湧く温泉の首都。見どころ${BG_SPOTS.length}か所、食べもの${BG_FOOD.length}品、基本情報${BG_BASICS.length}、ことば${BG_WORDS.length}語。`,
  path: "/bulgaria",
});

/** 印の字。**1か所で決める**——節ごとに書くと、同じ印が別の意味に見える */
const MARK: Record<Mark, { label: string; icon: IconName }> = {
  good: { label: "あやとの好みに合う", icon: "heart" },
  ok: { label: "たぶん合う", icon: "check" },
  warn: { label: "注意（豚・酒・高い入場料）", icon: "alert" },
};

/** 星の言葉。★の数より、**何をしたらいいか**が先に読めるようにする */
const STAR = ["", "必見", "行けたら", "余裕があれば"];

/**
 * 印ひとつ。
 *
 * **字（◎○⚠）ではなく絵で出す。** ⚠（U+26A0）は Zen Maru Gothic
 * そのものに無い（`cmap` を数えて確かめた。`fonts.css` の
 * `unicode-range` には3か所 U+26A0 が並んでいるが、**範囲に書いてあることは
 * 字が在る証拠ではない**——束に詰めようとしても、元の書体に無いものは出ない）。
 * 落ちると、そこだけ端末の書体になる——面の中で1文字だけ書体が変わるのは、
 * 読む人には**文字化けに見える**（あやと 2026-11-06）。
 * 絵なら、どの端末でも同じ形で出る。
 *
 * **地の文からも ⚠ を追い出した。** 絵にしたのは印だけで、説明文に
 * 「⚠は豚か酒です」と書いてあれば、その1字はやはり落ちる（CI の
 * `fontfall.mjs` が実機で拾った）。文では「注意の印」と呼ぶ。
 */
function Badge({ mark, why, big }: { mark: Mark; why?: string; big?: boolean }) {
  return (
    <span className={`bgmark is-${mark}${big ? " is-big" : ""}`}>
      <b aria-hidden="true">
        <Icon name={MARK[mark].icon} size={big ? 16 : 13} />
      </b>
      <span className="bgmark-sr">{MARK[mark].label}</span>
      {why && <i>{why}</i>}
    </span>
  );
}

/** 星ひとつ。`rank: 1` が「必見」なので、塗る★は `4 - rank` 個 */
function Star({ rank, word }: { rank: number; word?: boolean }) {
  const n = 4 - rank;
  return (
    <span className="bgstar">
      <b aria-hidden="true">{"★".repeat(n)}</b>
      <span className="bgmark-sr">{STAR[rank]}</span>
      {word && <i>{STAR[rank]}</i>}
    </span>
  );
}

type Shot = { img: string; thumb: string; big: string; cm: string; by: string; lic: string; alt: string };

/**
 * 絵の板。**1枚目はここが空で、字だけが 44,000px 続いていた。**
 *
 * 写真が無いものは、地の色のまま印と名前だけ出す（**穴を見せない**）。
 */
function Shot({ s, eager }: { s: Shot; eager?: boolean }) {
  if (!s.img) return <span className="bgshot is-none" aria-hidden="true" />;
  return (
    <span className="bgshot">
      <img
        src={s.img}
        alt={s.alt}
        loading={eager ? "eager" : "lazy"}
        /* Wikimedia は参照元を見て断ることがある。島から出す絵は全部これ
           （`components/nordic/Countries.tsx` と同じ） */
        referrerPolicy="no-referrer"
      />
    </span>
  );
}

/**
 * 写真の出どころ。**絵を借りたら必ず出す。** 書けない絵は載せない。
 *
 * **名前に、何の写真かを入れる。** 同じ写真家が何枚も撮っているので、
 * 字をそのまま名前にすると「同じ名前の札が別の先を指す」になる
 * （`reachkeys` の「おなじ字」。9件出た）。見える字は名前のままにして、
 * `aria-label` で分ける。
 */
function Credit({ s, of }: { s: Shot; of?: string }) {
  if (!s.cm) return null;
  const who = s.by || "Wikimedia Commons";
  return (
    <p className="bgcredit">
      <a
        href={s.cm}
        target="_blank"
        rel="noreferrer"
        aria-label={of ? `${of}の写真の出どころ（${who}）` : `写真の出どころ（${who}）`}
      >
        {who}
      </a>
      ／{s.lic}
    </p>
  );
}

/** 節ひとつ */
function Sec({
  id,
  icon,
  n,
  title,
  note,
  lead,
  children,
}: {
  id: string;
  icon: IconName;
  n: number;
  title: string;
  note?: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bgsec" id={id}>
      <h2 className="bgsec-h">
        <span className="bgsec-n">{String(n).padStart(2, "0")}</span>
        <Icon name={icon} size={26} className="bgsec-i" />
        <span className="bgsec-t">{title}</span>
        {note && <em className="bgsec-note">{note}</em>}
      </h2>
      {lead && <p className="bgsec-lead">{lead}</p>}
      {children}
      <p className="bgup">
        <a href="#toc">
          <Icon name="up" size={14} />
          目次へ
        </a>
      </p>
    </section>
  );
}

const CHAPTERS: { id: string; icon: IconName; title: string; note: string }[] = [
  { id: "see", icon: "church", title: "見たいもの", note: `${BG_SPOTS.length}か所` },
  { id: "eat", icon: "eat", title: "食べたいもの", note: `${BG_FOOD.length}品` },
  { id: "course", icon: "walk", title: "歩くコース", note: `${BG_COURSE.length}か所` },
  { id: "todo", icon: "sparkle", title: "したいこと", note: `${BG_TODO.length}つ` },
  { id: "buy", icon: "souvenir", title: "買いたいもの", note: `${BG_BUY.length}つ` },
  { id: "about", icon: "oldtown", title: "どんな街か", note: `${BG_HISTORY.length + BG_IMAGE.length}話` },
  { id: "basics", icon: "info", title: "基本情報", note: `${BG_BASICS.length}件` },
  { id: "words", icon: "phrase", title: "ことば", note: `${BG_WORDS.length}語` },
];

export default function BulgariaPage() {
  const spotsBy = [1, 2, 3].map((r) => BG_SPOTS.filter((s) => s.rank === r));
  const foodBy = [1, 2, 3].map((r) => BG_FOOD.filter((d) => d.rank === r));
  const good = BG_FOOD.filter((d) => d.mark === "good").length;
  const warn = BG_FOOD.filter((d) => d.mark === "warn").length;
  /* 頭に出す数は3つだけ。**9つ出していたのをやめた**——読む前に数の表を
     読まされると、そこで止まる（あやと「文字が多い」） */
  const facts = BG_FACTS.slice(0, 3);

  return (
    <PageShell crumbs={[crumbOf("next"), { label: "ブルガリア・ソフィア" }]}>
      {/* ---- 表紙。**絵を先に、字をあとに** ------------------------------- */}
      <div className={`bghero${BG_HERO.img ? "" : " is-none"}`}>
        {BG_HERO.img && (
          <img
            className="bghero-img"
            src={BG_HERO.img}
            alt={BG_HERO.alt}
            /* 表紙の1枚だけは、下まで送る前に出す */
            loading="eager"
            referrerPolicy="no-referrer"
          />
        )}
        <div className="bghero-body">
          <span className="bghero-cyr" lang="bg">
            СОФИЯ, БЪЛГАРИЯ
          </span>
          <h1>ブルガリア・ソフィア</h1>
          <p>{BG_LEAD}</p>
        </div>
      </div>
      <Credit s={BG_HERO as unknown as Shot} of="ソフィアの街" />

      {/* 驚く数は3つだけ */}
      <ul className="bgnums">
        {facts.map((f) => (
          <li key={f.cap}>
            <b>
              {f.n}
              <i>{f.unit}</i>
            </b>
            <span>{f.cap}</span>
          </li>
        ))}
      </ul>

      {/* 目次。**ここから各節へ跳ぶ**——下まで送らせない */}
      <nav className="bgtoc" id="toc" aria-label="この面の中身">
        {CHAPTERS.map((c) => (
          <a key={c.id} href={`#${c.id}`}>
            <Icon name={c.icon} size={22} />
            <b>{c.title}</b>
            <i>{c.note}</i>
          </a>
        ))}
      </nav>

      {/* 印の読みかた。**畳んでおく**——記号の意味は、見たくなってから読めばいい */}
      <Fold
        title="★ と 印 の読みかた"
        lead="重要度を2本立てにしてあります"
        note={`◎${good} 注意${warn}`}
      >
        <div className="bgkey">
          <p>
            <b>★</b>は一般の重要度（必見／行けたら／余裕があれば）、
            <b>◎○と注意</b>は<b>あやとの好みに合うか</b>です。混ぜていません——
            「有名だけど合わない」が表せなくなるので。
          </p>
          <ul>
            {(Object.keys(MARK) as Mark[]).map((m) => (
              <li key={m}>
                <Badge mark={m} big />
                {MARK[m].label}
              </li>
            ))}
          </ul>
          <p>
            印は手で書いていません。これまでの配信の議事録から好みを実測して、規則1本から
            出しています（豚・酒・バクラヴァ系・高い入場料が注意）。食べもの{BG_FOOD.length}品のうち
            <b>◎が{good}品、注意が{warn}品</b>。注意の印は<b>隠していません</b>——
            隠すと現地で頼んでしまうので、出したうえで理由を1行添えています。
          </p>
          <p className="bgnote">{BG_RATE}</p>
        </div>
      </Fold>

      {/* ---- 01 見たいもの ------------------------------------------------ */}
      <Sec
        id="see"
        icon="church"
        n={1}
        title="見たいもの"
        note={`${BG_SPOTS.length}か所`}
        lead="絵を押すと、入場料・所要時間・行きかた・ADVICE が出ます。"
      >
        {spotsBy.map((group, gi) => (
          <div key={gi} className="bggroup">
            <h3 className="bgsub">
              <Star rank={gi + 1} word />
              <em>{group.length}か所</em>
            </h3>
            <div className="bgtiles">
              {group.map((s, i) => (
                <details key={s.name} className={`bgtile is-${s.mark}`}>
                  <summary>
                    <Shot s={s as Shot} eager={gi === 0 && i < 2} />
                    <span className="bgtile-tag">
                      {s.letter ? (
                        <b className="bgtile-l">{s.letter}</b>
                      ) : (
                        <b className="bgtile-l is-far">
                          <Icon name="bus" size={13} />
                        </b>
                      )}
                      <Badge mark={s.mark as Mark} />
                    </span>
                    <span className="bgtile-body">
                      <b>{s.name}</b>
                      <i lang="bg">{s.cyr}</i>
                      <em>
                        {s.far ? `中心から${s.far}km` : s.walk}・{s.stay}
                      </em>
                    </span>
                    <Icon name="chevron" size={16} className="bgtile-c" />
                  </summary>
                  <div className="bgtile-more">
                    {s.why && <p className="bgtile-why">{s.why}</p>}
                    <p>{s.what}</p>
                    <ul className="bgfacts">
                      <li>
                        <Icon name="wallet" size={14} />
                        <span>{s.fee}</span>
                      </li>
                      <li>
                        <Icon name="signpost" size={14} />
                        <span>{s.how}</span>
                      </li>
                      <li>
                        <Icon name="phrase" size={14} />
                        <span>
                          {s.roman}／{s.kana}
                        </span>
                      </li>
                    </ul>
                    {s.advice && (
                      <p className="bgadvice">
                        <b>ADVICE</b>
                        {s.advice}
                      </p>
                    )}
                    <a
                      className="bgmaps"
                      href={s.maps}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Google マップで開く（${s.name}）`}
                    >
                      <Icon name="map" size={15} />
                      Google マップで開く
                      <Icon name="external" size={13} />
                    </a>
                    <Credit s={s as Shot} of={s.name} />
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </Sec>

      {/* ---- 02 食べたいもの ---------------------------------------------- */}
      <Sec
        id="eat"
        icon="eat"
        n={2}
        title="食べたいもの"
        note={`${BG_FOOD.length}品`}
        lead="注意の印は豚か酒です。ブルガリア料理の看板がちょうどそこなので、件数が多くなります。"
      >
        {foodBy.map((group, gi) => (
          <div key={gi} className="bggroup">
            <h3 className="bgsub">
              <Star rank={gi + 1} word />
              <em>{group.length}品</em>
            </h3>
            <div className="bgtiles">
              {group.map((d) => (
                <details key={d.jp} className={`bgtile is-${d.mark}`}>
                  <summary>
                    <Shot s={d as Shot} />
                    <span className="bgtile-tag">
                      <Badge mark={d.mark as Mark} />
                    </span>
                    <span className="bgtile-body">
                      <b>{d.jp}</b>
                      <i lang="bg">{d.cyr}</i>
                      <em>{d.price}</em>
                    </span>
                    <Icon name="chevron" size={16} className="bgtile-c" />
                  </summary>
                  <div className="bgtile-more">
                    {d.why && <p className="bgtile-why">{d.why}</p>}
                    <p>{d.what}</p>
                    <ul className="bgfacts">
                      <li>
                        <Icon name="market" size={14} />
                        <span>{d.where}</span>
                      </li>
                      <li>
                        <Icon name="meat" size={14} />
                        <span>肉：{d.meat}</span>
                      </li>
                      <li>
                        <Icon name="phrase" size={14} />
                        <span>
                          {d.roman}／{d.kana}
                        </span>
                      </li>
                    </ul>
                    {d.note && <p className="bgadvice is-food">{d.note}</p>}
                    <Credit s={d as Shot} of={d.jp} />
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </Sec>

      {/* ---- 03 歩くコース ------------------------------------------------ */}
      <Sec
        id="course"
        icon="walk"
        n={3}
        title="歩くコース"
        note={`${BG_COURSE.length}か所`}
        lead="中心から出て、西の市場へ回り、東の大聖堂で終わる1本道。記号は上の一覧と同じです。"
      >
        <BgMapSvg />
        <ol className="bgcourse">
          {BG_COURSE.map((c, i) => (
            <li key={c.letter}>
              {i > 0 && (
                <p className="bgleg">
                  <Icon name="walk" size={14} />
                  徒歩 約{c.min}分（{c.m}m）
                </p>
              )}
              <div className={`bgstop is-${c.mark}`}>
                <span className="bgstop-l">{c.letter}</span>
                <span className="bgstop-b">
                  <b>{c.name}</b>
                  <i>
                    <Icon name="clock" size={12} /> {c.stay}
                  </i>
                </span>
                <Badge mark={c.mark as Mark} />
              </div>
              {i === BG_COURSE.length - 1 && <p className="bggoal">GOAL</p>}
            </li>
          ))}
        </ol>
        <p className="bgnote">{BG_COURSE_NOTE}</p>
      </Sec>

      {/* ---- 04 したいこと ------------------------------------------------ */}
      <Sec
        id="todo"
        icon="sparkle"
        n={4}
        title="ここでしたいこと"
        note={`${BG_TODO.length}つ`}
        lead="好みの実測と、現地で本当にできることを突き合わせた結論です。名物の順番とは違います。"
      >
        <ol className="bgtodo">
          {BG_TODO.map((t, i) => (
            <li key={t.what}>
              <span className="bgtodo-n">{i + 1}</span>
              <div className="bgtodo-b">
                <h3>
                  {t.what}
                  <Badge mark={t.mark as Mark} />
                </h3>
                <p className="bgtodo-where">
                  <Icon name="pin" size={14} /> {t.where}
                </p>
                <p>{t.why}</p>
              </div>
            </li>
          ))}
        </ol>
        <Fold title="その時期にあるもの" note={`${BG_EVENTS.length}件`}>
          <div className="bgevents">
            {BG_EVENTS.map((e) => (
              <article key={e.what} className="bgevent">
                <h4>{e.what}</h4>
                <p className="bgevent-when">
                  <Icon name="calendar" size={14} /> {e.when}
                </p>
                <p>{e.body}</p>
              </article>
            ))}
          </div>
        </Fold>
      </Sec>

      {/* ---- 05 買いたいもの ---------------------------------------------- */}
      <Sec
        id="buy"
        icon="souvenir"
        n={5}
        title="買いたいもの"
        note={`${BG_BUY.length}つ`}
        lead="注意の印が付いているのは酒です。あやとは飲まないので、人に贈るときだけ。"
      >
        <div className="bgtiles">
          {BG_BUY.map((b) => (
            <details key={b.what} className={`bgtile is-${b.mark}`}>
              <summary>
                <Shot s={b as Shot} />
                <span className="bgtile-tag">
                  <Badge mark={b.mark as Mark} />
                </span>
                <span className="bgtile-body">
                  <b>{b.what}</b>
                  <em>{b.price}</em>
                </span>
                <Icon name="chevron" size={16} className="bgtile-c" />
              </summary>
              <div className="bgtile-more">
                {b.markwhy && <p className="bgtile-why">{b.markwhy}</p>}
                <p>{b.why}</p>
                <ul className="bgfacts">
                  <li>
                    <Icon name="market" size={14} />
                    <span>{b.where}</span>
                  </li>
                </ul>
                <Credit s={b as Shot} of={b.what} />
              </div>
            </details>
          ))}
        </div>
      </Sec>

      {/* ---- 06 どんな街か ------------------------------------------------ */}
      <Sec
        id="about"
        icon="oldtown"
        n={6}
        title="どんな街か"
        note={`${BG_HISTORY.length + BG_IMAGE.length}話`}
      >
        <Fold title="街の来かた" note={`${BG_HISTORY.length}話`} open>
          <div className="bgcards">
            {BG_HISTORY.map((h) => (
              <article key={h.title} className="bgcard">
                {/* **h3。** 節の見出しが h2 で、畳みの題は見出しではない
                    （`Fold` は `<summary>` の中の `<b>`）。h4 にすると段が1つ飛ぶ */}
                <h3>{h.title}</h3>
                <p>{h.body}</p>
              </article>
            ))}
          </div>
        </Fold>
        <Fold title="みんなが持っているイメージ、合っているか" note={`${BG_IMAGE.length}話`}>
          <div className="bgcards is-image">
            {BG_IMAGE.map((h) => (
              <article key={h.title} className="bgcard">
                <h3>{h.title}</h3>
                <p>{h.body}</p>
              </article>
            ))}
          </div>
        </Fold>
      </Sec>

      {/* ---- 07 基本情報 -------------------------------------------------- */}
      <Sec id="basics" icon="info" n={7} title="基本情報" note={`${BG_BASICS.length}件`}>
        <Fold title="お金・足・治安・11月の気候" note={`${BG_BASICS.length}件`} lead={BG_RATE.slice(0, 34) + "…"}>
          <dl className="bgbasics">
            {BG_BASICS.map((b) => (
              <div key={b.title}>
                <dt>{b.title}</dt>
                <dd>{b.body}</dd>
              </div>
            ))}
          </dl>
        </Fold>
      </Sec>

      {/* ---- 08 ことば ---------------------------------------------------- */}
      <Sec
        id="words"
        icon="phrase"
        n={8}
        title="ことば"
        note={`${BG_WORDS.length}語`}
        lead="キリル文字が読めないと、看板も路線図も引けません。"
      >
        <Fold title="キリル文字と、現地でいちばん要る言いかた" note={`${BG_WORDS.length}語`}>
          <ul className="bgwords">
            {BG_WORDS.map((w) => (
              <li key={w.cyr}>
                <b lang="bg">{w.cyr}</b>
                <i>
                  {w.roman}／{w.kana}
                </i>
                <span>{w.jp}</span>
              </li>
            ))}
          </ul>
        </Fold>
      </Sec>

      {/* ---- 付箋 ---------------------------------------------------------
          **宛先は決まっているので、選ばせない**（`theme`）。ここまで来た人は
          もうソフィアの話をしている。題は宛先の名前にそろえる
          （`content/themes.ts` の `bulgaria`）。 */}
      <StickyNotes theme="bulgaria" title="ソフィアでこれやって" />

      <p className="bgback">
        <Link prefetch={false} href="/">
          <Icon name="left" size={15} />
          島へ戻る
        </Link>
      </p>
    </PageShell>
  );
}
