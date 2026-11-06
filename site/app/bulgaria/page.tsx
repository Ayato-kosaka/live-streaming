import type { Metadata } from "next";
import Link from "next/link";

import BgMapSvg from "@/components/bulgaria/BgMapSvg";
import Icon, { type IconName } from "@/components/ui/Icon";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { share } from "@/lib/share";
import {
  BG_BASICS,
  BG_BUY,
  BG_COURSE,
  BG_COURSE_NOTE,
  BG_EVENTS,
  BG_FACTS,
  BG_FOOD,
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
 * ## 何を載せる面か
 *
 * あやと（2026-11-06）:「来週木曜日からブルガリアのソフィアに一週間ほど行きます。
 * 超絶ハイレベルで見やすいソフィアのページを作りたいです」。
 * もらった見開き8枚（エジプト4・プラハ4）と `tabiiro.jp` が見た目の指定で、
 * 章立ては本人が挙げた6つ（どんな街か／ここでしたいこと／基本情報／
 * 見たいもの／食べたいもの／買いたいもの）＋見開きから足した3つ
 * （頭の数・歩くコース・ことば）。
 *
 * ## ここの作りで、ほかの面と違うところ
 *
 * **重要度を2本立てにしてある。**
 *
 * | | |
 * | --- | --- |
 * | **星**（★1〜3） | 一般の重要度。必見／行けたら／余裕があれば |
 * | **印**（◎○⚠） | **あやとに合うか** |
 *
 * 混ぜない。混ぜると「有名だけどあやとには合わない」が表せなくなる。
 * ブルガリア料理の看板は豚で、**あやとは豚が苦手**（ハム・ソーセージも）。
 * 酒も2年ほど前にやめている。普通に名物を並べると**半分が食べられないもの**になる。
 *
 * **⚠ を隠さない。** 隠すと配信の場で頼んでしまう。出したうえで、
 * なぜかを1行添える（「豚なので」「酒なので」「入場料が高いので」）。
 *
 * 印は**手で書いていない。** `python/build_bulgaria.py` が、議事録から実測した
 * 好み（`python/data/bulgaria/taste.json`）を規則1本に通して付けている。
 * 好みが変わったら規則を直せば、22+22件ぜんぶが動く。
 *
 * ## 文章を1行もここに書かない
 *
 * `content/bulgaria.ts` を読むだけ（`/north-macedonia` と同じ決まり）。
 * あちらは `python/build_bulgaria.py` が `python/data/bulgaria/*.json` から焼く。
 * **直すなら JSON のほう。**
 *
 * ## 日付を焼かない
 *
 * 静的書き出しなので、ここに書いた字は次のビルドまで直らない。
 * 「あと◯日」も「◯月◯日に行く」も置かない。トップページに出す期間の
 * 入れ替えは `components/isle/spec.ts` の `GUIDES` が持っていて、
 * あちらは**画面が出てから**今日の日付で選び直す。
 */

export const metadata: Metadata = share({
  key: "bulgaria",
  title: "ブルガリア・ソフィア — 歩きかた",
  /* 数は手で書かない。載っている件数から作る */
  description: `ローマの遺跡と温泉の湧く首都。見どころ${BG_SPOTS.length}か所、食べもの${BG_FOOD.length}品、基本情報${BG_BASICS.length}、ことば${BG_WORDS.length}語。`,
  path: "/bulgaria",
});

/** 節の表。**絵と呼び名はここ1か所で決める**——節の中で書くと、目次と食い違う */
const CHAPTERS: { id: string; icon: IconName; title: string; note: string }[] = [
  { id: "about", icon: "oldtown", title: "どんな街か", note: `歴史${BG_HISTORY.length}・イメージ${BG_IMAGE.length}` },
  { id: "todo", icon: "sparkle", title: "ここでしたいこと", note: `${BG_TODO.length}つ` },
  { id: "basics", icon: "info", title: "基本情報", note: `${BG_BASICS.length}件` },
  { id: "course", icon: "walk", title: "歩くコース", note: `${BG_COURSE.length}か所` },
  { id: "see", icon: "church", title: "見たいもの", note: `${BG_SPOTS.length}か所` },
  { id: "eat", icon: "eat", title: "食べたいもの", note: `${BG_FOOD.length}品` },
  { id: "buy", icon: "souvenir", title: "買いたいもの", note: `${BG_BUY.length}つ` },
  { id: "words", icon: "phrase", title: "ことば", note: `${BG_WORDS.length}語` },
];

/** 印の字。**1か所で決める**——節ごとに書くと、同じ印が別の意味に見える */
const MARK: Record<Mark, { sign: string; label: string }> = {
  good: { sign: "◎", label: "あやとの好みに合う" },
  ok: { sign: "○", label: "たぶん合う" },
  warn: { sign: "⚠", label: "注意（豚・酒・高い入場料）" },
};

/** 星の字。★の数そのものより、**何をしたらいいか**が先に読めるようにする */
const STAR = ["", "必見", "行けたら", "余裕があれば"];

/** 印ひとつ。**理由の字を必ず連れてくる**（印だけ出すと、なぜかが消える） */
function Badge({ mark, why }: { mark: Mark; why?: string }) {
  return (
    <span className={`bgmark is-${mark}`} title={MARK[mark].label}>
      <b aria-hidden="true">{MARK[mark].sign}</b>
      <span className="bgmark-sr">{MARK[mark].label}</span>
      {why && <i>{why}</i>}
    </span>
  );
}

/**
 * 星ひとつ。★の見た目と、言葉の両方を出す。
 *
 * **重要度の数（`rank`）と★の数は逆。** `rank: 1` が「必見」なので、
 * 塗る★は `4 - rank` 個。素直に `rank` 個にすると、いちばん大事なものが
 * ★1つで出る（一度そう出た）。
 */
function Star({ rank }: { rank: number }) {
  const n = 4 - rank;
  return (
    <span className={`bgstar is-s${n}`}>
      <b aria-hidden="true">{"★".repeat(n)}{"☆".repeat(3 - n)}</b>
      <i>{STAR[rank]}</i>
    </span>
  );
}

/** 節ひとつ。**畳まない**——るるぶの見開きは、開いた状態で並んでいるもの */
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
        <Icon name={icon} size={30} className="bgsec-i" />
        <span className="bgsec-t">{title}</span>
        {note && <em className="bgsec-note">{note}</em>}
      </h2>
      {lead && <p className="bgsec-lead">{lead}</p>}
      {children}
      {/* **節の終わりに、目次へ戻る1本。** この面は狭い画面で44,000px あって、
          下まで来た人が別の節へ行くには指で40画面ぶん戻ることになる。
          追従する板を重ねるより、節の切れめに1本置くほうが場所を取らない */}
      <p className="bgup">
        <a href="#toc">
          <Icon name="up" size={14} />
          目次へ
        </a>
      </p>
    </section>
  );
}

export default function BulgariaPage() {
  /* 星ごとに分ける。**ここで並べ替えない**——焼いた順（調べた順）が
     そのまま出どころの順で、入れ替えると JSON と照らせなくなる */
  const spotsBy = [1, 2, 3].map((r) => BG_SPOTS.filter((s) => s.rank === r));
  const foodBy = [1, 2, 3].map((r) => BG_FOOD.filter((d) => d.rank === r));
  const good = BG_FOOD.filter((d) => d.mark === "good").length;
  const warn = BG_FOOD.filter((d) => d.mark === "warn").length;

  return (
    <PageShell crumbs={[{ label: "島", href: "/" }, { label: "ブルガリア・ソフィア" }]}>
      <PageHead
        /* `icon` は島のスプライト名を取る欄（`/sprites/<名前>.webp`）。
           `church` はスプライトではなく印なので、`mark` で渡す
           ——`icon` に入れると絵が 404 で、壊れた画像の枠が出る（実測） */
        mark={<Icon name="church" size={44} />}
        title="ブルガリア・ソフィア"
        lead={BG_LEAD}
        meta={
          <span className="bghead-cyr" lang="bg">
            СОФИЯ, БЪЛГАРИЯ
          </span>
        }
      />

      {/* 頭の数。**「驚く数」を3つ以上**——見開きの1枚目がどれもこうなっている */}
      <ul className="bgnums">
        {BG_FACTS.map((f) => (
          <li key={f.cap}>
            <b>
              {f.n}
              <i>{f.unit}</i>
            </b>
            <span>{f.cap}</span>
          </li>
        ))}
      </ul>

      {/* 印の読みかた。**いちばん上に置く**——下の22+22件が全部この印を持っているので、
          読み方を知らないまま一覧に入ると、記号が飾りに見える */}
      <aside className="bgkey">
        <h2>この紙の読みかた</h2>
        <p>
          重要度を<b>2本立て</b>にしてあります。
          <b>★</b>は一般の重要度（必見／行けたら／余裕があれば）、
          <b>◎○⚠</b>は<b>あやとの好みに合うか</b>です。混ぜていません——
          「有名だけど合わない」が表せなくなるので。
        </p>
        <ul>
          {(Object.keys(MARK) as Mark[]).map((m) => (
            <li key={m}>
              <span className={`bgmark is-${m}`}>
                <b aria-hidden="true">{MARK[m].sign}</b>
              </span>
              {MARK[m].label}
            </li>
          ))}
        </ul>
        <p className="bgkey-why">
          印は手で書いていません。これまでの配信の議事録から好みを実測して、
          規則1本から出しています（豚・酒・バクラヴァ系・高い入場料が⚠）。
          食べもの{BG_FOOD.length}品のうち<b>◎が{good}品、⚠が{warn}品</b>。
          ⚠は<b>隠していません</b>——隠すと現地で頼んでしまうので、出したうえで理由を1行添えています。
        </p>
      </aside>

      {/* 目次。るるぶの「CONTENTS」の帯。押すとその節へ跳ぶ */}
      <nav className="bgtoc" id="toc" aria-label="この面の中身">
        {CHAPTERS.map((c, i) => (
          <a key={c.id} href={`#${c.id}`}>
            <span className="bgtoc-n">{String(i + 1).padStart(2, "0")}</span>
            <Icon name={c.icon} size={26} />
            <b>{c.title}</b>
            <i>{c.note}</i>
          </a>
        ))}
      </nav>

      {/* ---- 01 どんな街か ------------------------------------------------ */}
      <Sec id="about" icon="oldtown" n={1} title="どんな街か" note={`歴史${BG_HISTORY.length}・イメージ${BG_IMAGE.length}`}>
        <div className="bgcards">
          {BG_HISTORY.map((h) => (
            <article key={h.title} className="bgcard">
              <h3>{h.title}</h3>
              <p>{h.body}</p>
            </article>
          ))}
        </div>
        <h3 className="bgsub">みんなが持っているイメージ、合っているか</h3>
        <div className="bgcards is-image">
          {BG_IMAGE.map((h) => (
            <article key={h.title} className="bgcard">
              <h3>{h.title}</h3>
              <p>{h.body}</p>
            </article>
          ))}
        </div>
      </Sec>

      {/* ---- 02 ここでしたいこと ------------------------------------------ */}
      <Sec
        id="todo"
        icon="sparkle"
        n={2}
        title="ここでしたいこと"
        note={`${BG_TODO.length}つ`}
        lead="好みの実測と、現地で本当にできることを突き合わせた結論です。だから名物の順番とは違います。"
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
                  <Icon name="pin" size={15} /> {t.where}
                </p>
                <p>{t.why}</p>
              </div>
            </li>
          ))}
        </ol>

        <h3 className="bgsub">その時期にあるもの</h3>
        <div className="bgevents">
          {BG_EVENTS.map((e) => (
            <article key={e.what} className="bgevent">
              <h4>{e.what}</h4>
              <p className="bgevent-when">
                <Icon name="calendar" size={15} /> {e.when}
              </p>
              <p>{e.body}</p>
            </article>
          ))}
        </div>
      </Sec>

      {/* ---- 03 基本情報 -------------------------------------------------- */}
      <Sec
        id="basics"
        icon="info"
        n={3}
        title="基本情報"
        note={`${BG_BASICS.length}件`}
        lead={BG_RATE}
      >
        <dl className="bgbasics">
          {BG_BASICS.map((b) => (
            <div key={b.title}>
              <dt>{b.title}</dt>
              <dd>{b.body}</dd>
            </div>
          ))}
        </dl>
      </Sec>

      {/* ---- 04 歩くコース ------------------------------------------------ */}
      <Sec
        id="course"
        icon="walk"
        n={4}
        title="歩くコース"
        note={`${BG_COURSE.length}か所`}
        lead="中心から出て、西の市場へ回り、東の大聖堂で終わる1本道。記号は下の地図と一覧と同じです。"
      >
        <BgMapSvg />
        <ol className="bgcourse">
          {BG_COURSE.map((c, i) => (
            <li key={c.letter}>
              {i > 0 && (
                <p className="bgleg">
                  <Icon name="walk" size={15} />
                  徒歩 約{c.min}分（{c.m}m）
                </p>
              )}
              <div className={`bgstop is-${c.mark}`}>
                <span className="bgstop-l">{c.letter}</span>
                <span className="bgstop-b">
                  <b>{c.name}</b>
                  <i>
                    <Icon name="clock" size={13} /> {c.stay}
                  </i>
                </span>
                <span className={`bgmark is-${c.mark}`}>
                  <b aria-hidden="true">{MARK[c.mark as Mark].sign}</b>
                  <span className="bgmark-sr">{MARK[c.mark as Mark].label}</span>
                </span>
              </div>
              {i === BG_COURSE.length - 1 && <p className="bggoal">GOAL</p>}
            </li>
          ))}
        </ol>
        <p className="bgnote">{BG_COURSE_NOTE}</p>
      </Sec>

      {/* ---- 05 見たいもの ------------------------------------------------ */}
      <Sec
        id="see"
        icon="church"
        n={5}
        title="見たいもの"
        note={`${BG_SPOTS.length}か所`}
        lead="★は一般の重要度、◎○⚠はあやとの好みに合うか。入場料は全件に書いてあります。"
      >
        {spotsBy.map((group, gi) => (
          <div key={gi} className="bggroup">
            <h3 className="bgsub">
              <Star rank={gi + 1} />
              <em>{group.length}か所</em>
            </h3>
            <div className="bgspots">
              {group.map((s) => (
                <article key={s.name} className={`bgspot is-${s.mark}`}>
                  <header>
                    {s.letter ? (
                      <span className="bgspot-l">{s.letter}</span>
                    ) : (
                      <span className="bgspot-l is-far">
                        <Icon name="bus" size={16} />
                      </span>
                    )}
                    <div className="bgspot-ttl">
                      <h4>{s.name}</h4>
                      <p className="bgspot-cyr" lang="bg">
                        {s.cyr}
                        <i>
                          {s.roman}／{s.kana}
                        </i>
                      </p>
                    </div>
                    <Badge mark={s.mark as Mark} why={s.why} />
                  </header>
                  <p>{s.what}</p>
                  <ul className="bgfacts">
                    <li>
                      <Icon name="walk" size={14} />
                      <span>{s.far ? `中心から${s.far}km（歩く距離ではない）` : s.walk}</span>
                    </li>
                    <li>
                      <Icon name="clock" size={14} />
                      <span>{s.stay}</span>
                    </li>
                    <li>
                      <Icon name="wallet" size={14} />
                      <span>{s.fee}</span>
                    </li>
                    <li>
                      <Icon name="signpost" size={14} />
                      <span>{s.how}</span>
                    </li>
                  </ul>
                  {s.advice && (
                    <p className="bgadvice">
                      <b>ADVICE</b>
                      {s.advice}
                    </p>
                  )}
                  <a className="bgmaps" href={s.maps} target="_blank" rel="noreferrer">
                    <Icon name="map" size={15} />
                    Google マップで開く
                    <Icon name="external" size={13} />
                  </a>
                </article>
              ))}
            </div>
          </div>
        ))}
      </Sec>

      {/* ---- 06 食べたいもの ---------------------------------------------- */}
      <Sec
        id="eat"
        icon="eat"
        n={6}
        title="食べたいもの"
        note={`${BG_FOOD.length}品`}
        lead="⚠は豚か酒です。ブルガリア料理の看板がちょうどそこなので、件数が多くなります。隠さずに出しています。"
      >
        {foodBy.map((group, gi) => (
          <div key={gi} className="bggroup">
            <h3 className="bgsub">
              <Star rank={gi + 1} />
              <em>{group.length}品</em>
            </h3>
            <div className="bgspots is-food">
              {group.map((d) => (
                <article key={d.jp} className={`bgspot is-${d.mark}`}>
                  <header>
                    <div className="bgspot-ttl">
                      <h4>{d.jp}</h4>
                      <p className="bgspot-cyr" lang="bg">
                        {d.cyr}
                        <i>
                          {d.roman}／{d.kana}
                        </i>
                      </p>
                    </div>
                    <Badge mark={d.mark as Mark} why={d.why} />
                  </header>
                  <p>{d.what}</p>
                  <ul className="bgfacts">
                    <li>
                      <Icon name="coin" size={14} />
                      <span>{d.price}</span>
                    </li>
                    <li>
                      <Icon name="market" size={14} />
                      <span>{d.where}</span>
                    </li>
                    <li>
                      <Icon name="meat" size={14} />
                      <span>肉：{d.meat}</span>
                    </li>
                  </ul>
                  {d.note && <p className="bgadvice is-food">{d.note}</p>}
                </article>
              ))}
            </div>
          </div>
        ))}
      </Sec>

      {/* ---- 07 買いたいもの ---------------------------------------------- */}
      <Sec id="buy" icon="souvenir" n={7} title="買いたいもの" note={`${BG_BUY.length}つ`}>
        <div className="bgbuys">
          {BG_BUY.map((b) => (
            <article key={b.what} className="bgbuy">
              <h4>{b.what}</h4>
              <p>{b.why}</p>
              <p className="bgbuy-meta">
                <span>
                  <Icon name="market" size={14} /> {b.where}
                </span>
                <span>
                  <Icon name="coin" size={14} /> {b.price}
                </span>
              </p>
            </article>
          ))}
        </div>
      </Sec>

      {/* ---- 08 ことば ---------------------------------------------------- */}
      <Sec
        id="words"
        icon="phrase"
        n={8}
        title="ことば"
        note={`${BG_WORDS.length}語`}
        lead="キリル文字が読めないと、看板も路線図も地図も引けません。読みかただけでも持っていきます。"
      >
        <ul className="bgwords">
          {BG_WORDS.map((w) => (
            <li key={w.cyr}>
              <b lang="bg">{w.cyr}</b>
              <i>{w.roman}</i>
              <em>{w.kana}</em>
              <span>{w.jp}</span>
            </li>
          ))}
        </ul>
      </Sec>

      <p className="bgback">
        <Link href="/">
          <Icon name="left" size={15} />
          島へ戻る
        </Link>
      </p>
    </PageShell>
  );
}
