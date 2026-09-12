import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/ui/PageShell";
import { Panel, Stat } from "@/components/ui/Bits";
import Fold from "@/components/ui/Fold";
import { BEFORE_STREAM, BEFORE_STREAM_DAYS, COUNTRIES } from "@/content/countries";
import Flag from "@/components/ui/Flag";
import Icon from "@/components/ui/Icon";
import Days from "@/components/atlas/Days";
import { HereRoute, HereStat, HereTag, MapHead, TripCountries, type TripStep } from "./parts";
import MAP from "@/content/atlas/route.json";
import { PROFILE } from "@/content/site";
import { CHAPTERS, tripDate } from "@/content/chapters";
import { BUILT_AT } from "@/lib/builtAt";
import { LEAVE, MAIN, NORDIC_COUNTRIES, cityName } from "@/content/nordic";
import { shortHref, shortThumb, shortsOf } from "@/content/shorts";

/* **焼いた字に「いま」を入れない。** ここは書き出したあと差し替えられないので、
   国の名前を書くと、国境を越えた日から次のビルドまで嘘になる（前は
   「いまいるジョージアまで」だった）。 */
export const metadata: Metadata = {
  title: "歩いた国",
  description:
    "2024年9月に日本を出てから、これまでに歩いた国ぜんぶ。歩いた線と乗り物の線を1枚の地図にしました。",
};

/**
 * 歩いた国。
 *
 * 主役は地図。表で17行並べても「どこをどう回ったか」は伝わらないので、
 * まず1枚の地図を出して、そのあとに順番の年表を置く。
 * 国のピンからも年表からも、同じ国のページへ行ける。
 *
 * ## 年表を章で畳んである理由
 *
 * 17カ国を素で並べると 2,648px（3.1画面）あって、この面だけで 5.1画面あった。
 * `docs/island-ux.md` 8.1 の「入口の面は3画面まで」を大きくこえている。
 * 主役の地図が画面から流れていくほど下に長い面は、地図を見せる面ではない。
 *
 * 区切りは**地図を寄せるボタンと同じ3章**を使う。国が持っている region
 * （「中東・アフリカ」）ではなく章の名前で見出しを付けるのは、
 * 同じ面の中でボタンと見出しが違う名前だと、別の区切りに見えるから。
 *
 * 開いておくのは、いまいる国が入っている章だけ。旅は続いているので、
 * 「いまどこまで来たか」がいちばん先に読めるほうがいい。
 */

/** 出発の日。ここから今日までを数える。 */
const START = "2024-10-28";

/** 配信を始める前の6週間に出したショート。章ではないので、島ではなくここに出る */
const BEFORE = shortsOf("before-stream");
/* **「旅した日数」は日本を出た日から数える。**
   配信の初回（2024-10-28）から数えていたので、6週間ぶん足りていなかった。
   イギリス・バルセロナ・ローマを2週間ずつ回っていた47日は、配信が無いだけで
   旅ではある。`site.ts` の PROFILE から引くので、ここに日付を写さない。 */

/** 国の region を、地図の章に結び直す。章の名前は route.json（＝寄せるボタン）が正本。 */
const CHAPTER_OF: Record<string, string> = {
  "ヨーロッパ": "europe",
  "中東・アフリカ": "mideast",
  "コーカサス": "caucasus",
};

/**
 * いま歩いている旅の国。**`content/countries.ts` には足さない。**
 *
 * あちらは「歩いた国」の一覧で、`order`（何カ国目）も世界地図の焼き込みも
 * そこから数えている。歩いている最中の国を混ぜると、歩く前から歩いたことになる
 * （`content/countries.ts` の `AHEAD_COUNTRIES` の注）。
 *
 * かわりに**旅程（`content/nordic.ts` の ROUTE）から引く。** 入った日は区間の
 * 日付で、そこから先は旅が進めばひとりでに増える。**ここで日付を手で書かない。**
 * 書くと、国境を越えた翌日にまた古くなる。
 *
 * ここはサーバ側（静的書き出し）で1度だけ組み立てる。出す出さないを決めるのは
 * 画面が出てから（`./parts.tsx` の `TripCountries`）。
 */
const TRIP_STEPS: TripStep[] = (() => {
  const out: TripStep[] = [];
  let cur: TripStep | undefined;
  for (const l of MAIN) {
    if (l.enters) {
      const c = NORDIC_COUNTRIES.find((x) => x.slug === l.enters);
      if (!c) continue;
      // 前の国は、次の国に入った日に出たことになる
      if (cur) cur.to = l.date ?? "";
      // `en` は旅程のほうが総大文字（"POLAND"）。年表の他の行と同じ書き方にそろえる
      cur = {
        slug: c.slug,
        name: c.name,
        en: c.en.charAt(0) + c.en.slice(1).toLowerCase(),
        from: l.date ?? "",
        to: "",
        towns: [],
      };
      out.push(cur);
    }
    if (cur && l.date) cur.towns.push({ name: cityName(l.to), date: l.date });
  }
  // 最後の国は、旅が終わる日まで。**終わりを空けたままにしない**（ジョージアと同じ）
  if (cur) cur.to = LEAVE.date;
  // 歩き終わって `COUNTRIES` へ移された国は、こちらから外す（二重に出さない）
  return out.filter((x) => x.from && !COUNTRIES.some((c) => c.slug === x.slug));
})();

/** 旅程を持っている章。名前は `content/chapters.ts` が正本なので、ここに書かない。 */
const TRIP_CHAPTER = CHAPTERS.find((c) => c.slug === "nordic");

/** 焼いたときに、もう旅に出ていたか。年表のどの章を開いておくかを決める。 */
const TRIP_ON = TRIP_STEPS.some((x) => x.from <= tripDate(BUILT_AT));

const ym = (d: string) => (d ? `${d.slice(0, 4)}/${d.slice(5, 7)}` : "いま");

/** 滞在の期間を「2024/10 – 11」のように縮める。同じ年なら年を省く。 */
function span(s: { from: string; to: string }) {
  const a = ym(s.from);
  const b = ym(s.to);
  if (!s.to) return `${a} –`;
  if (a === b) return a;
  return a.slice(0, 4) === b.slice(0, 4) ? `${a} – ${b.slice(5)}` : `${a} – ${b}`;
}

export default function MapPage() {
  /* **いちばん新しく歩いた国**（滞在の始まりがいちばん新しい国）。
     並びの最後にすると、GWにイラン国境まで歩いた回が最後に来てしまう。

     前はここが「滞在の終わりが空いている国」だった。終わりの欄は人が手で入れる
     ものなので、**入っていない＝まだ居る**として読むと、出国しても居つづける
     （`docs/island-misses.md` #24）。ジョージアの出国が入った日から、この探し方では
     1件も見つからず**フランス**に落ちていた。日付で決める。

     ここは焼き込みなので「いまいる国」とは言い切れない。旅に出れば、まだこの表に
     無い国を歩いている。**「いま」を言うところだけ、画面が出てから引き直す**
     （`./parts.tsx`）。 */
  const lastFrom = (c: (typeof COUNTRIES)[number]) =>
    c.stays.map((s) => s.from).sort().at(-1) ?? "";
  const here = [...COUNTRIES].sort((a, b) => lastFrom(b).localeCompare(lastFrom(a)))[0];
  // イランは国境まで歩いただけで中に入っていない。国の数には入れない。
  const visited = COUNTRIES.filter((c) => c.slug !== "iran-border");
  const cities = new Set(MAP.cities.filter((c) => c.kind !== "side").map((c) => c.id));
  const ordered = [...COUNTRIES].sort((a, b) => a.order - b.order);
  // 章は route.json（＝地図を寄せるボタン）から。「ぜんぶ」は年表の区切りにならないので外す。
  const chapters = (MAP.chapters as { id: string; label: string }[]).filter((x) => x.id !== "all");

  return (
    <PageShell current="map" crumbs={[{ label: "歩いた国" }]}>
      {/* h1 は場所の名前（docs/island-world.md 7.5）。
          国の数は静的書き出しで焼き込まれるので、見出しには入れない。
          カモメは、この下の地図の紙に「ピンを押すと」と同じことを言うので置かない。

          前置きの最後の1文だけが「いま」を言うので、そこは画面が出てから
          引き直す（`./parts.tsx`）。焼いたままだと、旅に出た日から
          「いまはコーカサスにいます」が残りつづける。 */}
      <MapHead region={here.region} />

      {/* 4つを同じ重さで並べると、どれも「ただの数」に見える。
          先頭を大きくするのは CSS がやるので、こちらは添え字で中身の差を言う。
          国は旅の端から端、街は泊まった所だけ、日数は起点、いまここは数ではなく状態。 */}
      <div className="stats" style={{ marginBottom: 16 }}>
        {/* **「パリからトビリシまで」と書かない。** すぐ下に「その前に6週間ある」と
            書いてある面で、いちばん上の数字が「パリから」だと面が自分と喧嘩する。
            この数は配信タイトルから復元したものなので、数えているのは配信のあった国。 */}
        <Stat value={visited.length} label="歩いた国" sub="配信のあった国だけ" />
        <Stat value={cities.size} label="通った街" sub="泊まった街だけ" />
        <Stat value={<Days from={PROFILE.leftJapan} />} label="旅した日数" sub="日本を出た日から" />
        {/* いまいる国の名前は数ヶ月変わらないので、この欄だけが止まって見えていた。
            添え字を滞在の日数にすると、旅が進んでいることが毎日1ずつ出る
            （`docs/island-play.md` 仕掛け10）。国の名前は上の見出しにも出ている。 */}
        <HereStat slug={here.slug} name={here.name} />
      </div>

      <Panel>
        <h2>どこをどう回ったんだろう</h2>
        <p className="muted">
          ピンを押すと、その国のことが出てくる。「パリから、たどる」で、出発から今日までを順に回る。
        </p>
        {/* **「いまここ」の輪は、いまいる国にしか出さない。** 旅に出ているあいだ
            この地図に居場所は無いので、輪は消して名札だけ残す（`./parts.tsx`）。 */}
        <HereRoute slug={here.slug} />
      </Panel>

      {/* **配信より前の6週間を、地図と年表のあいだに置く。**
          下の一覧は配信タイトルから復元したものなので、配信の無い6週間が
          まるごと抜けている。「1カ国目はフランス」と読めてしまうが、
          実際はその前にロンドン・バルセロナ・ローマを回っている。

          **日付が届いたので入れた**（2026-09-06、GitHub #121）。前は「2週間ずつ」と
          書いていたが、実際は 16日・12日・12日で、そろっていなかった。
          パリだけは滞在の途中で配信が始まっているので、その1行だけ断る。 */}
      <Panel className="mbefore">
        <h2>その前に、配信していない6週間がある</h2>
        <p>
          日本を出たのは{PROFILE.leftJapan.replace(/-/g, "/")}、パリで配信を始めたのは
          {START.replace(/-/g, "/")}。そのあいだの{BEFORE_STREAM_DAYS}日は、
          {BEFORE_STREAM.map((c) => c.city ?? c.name).join("、")}と歩いていました。
          この6週間のぶんは、下の一覧には出てきません。かわりに、ショート動画が
          {BEFORE.length}本あります。
        </p>
        <ol className="mbefore-list">
          {BEFORE_STREAM.map((c) => (
            <li key={c.slug}>
              <b>{c.city ?? c.name}</b>
              <i>{c.city ? c.name : ""}</i>
              {/* 日付まで出すと1行に4つ並んで読めなくなるので、日数だけ。
                  パリは滞在の途中で配信が始まっているので、そこだけ言い添える */}
              <span>{c.days}日{c.streamBegan ? "・この街で配信が始まった" : ""}</span>
            </li>
          ))}
        </ol>
        {/* **ここに出すと決めた理由。**
            この段はもともと「配信が無いので出てきません」で終わっていた。
            でも実際には動画が15本あるので、そのままだと嘘に近い。

            ヨーロッパ周遊の島には置けない。島に建つのは章のあいだにあったことだけで
            （`docs/island-atlas.md` 4章）、この15本は公開日が 2024-09-17〜10-19、
            章が始まる 2024-10-28 より**全部前**にある（`python/build_shorts.py`）。
            章の外のものを島に建てると、島が嘘をつく。

            畳んであるのは、地図と年表のあいだに 15枚の絵が居座ると
            この段が主役に見えてしまうから（`docs/island-design.md` 4章）。
            **何本あるかは畳んだままでも読める。** */}
        <div className="hlist">
          <Fold
            title="この6週間に出したショート動画"
            lead={`${BEFORE[0].city}から${BEFORE[BEFORE.length - 1].city}まで、出した順に`}
            note={`${BEFORE.length}本`}
          >
            <ul className="mshorts">
              {BEFORE.map((s) => (
                <li key={s.id}>
                  <a href={shortHref(s.id)} target="_blank" rel="noopener noreferrer">
                    <img
                      src={shortThumb(s.id)}
                      alt={s.title}
                      width={480}
                      height={360}
                      loading="lazy"
                      decoding="async"
                    />
                    <b>{s.title}</b>
                    {/* **日付を出さない。** この段は「2週間ずつ」しか聞いていないので
                        日付を書かない決まりで作ってある（上の注）。ショートの日付は
                        撮った日ではなく出した日なので、ここに並べると
                        「9/17 にロンドンにいた」と読めてしまう */}
                    <i>{s.city}</i>
                  </a>
                </li>
              ))}
            </ul>
          </Fold>
        </div>
      </Panel>

      <Panel>
        <h2>行った順に、ぜんぶ</h2>
        <p className="muted">番号は、初めてその国に入った順。</p>
        {/* `.folds` は紙を1枚敷く部品なので、紙のパネルの中では使わない。
            紙の上に紙が乗って貼り紙に見える（app/css/ui.css の注）。
            ここは国のページの「この国であったこと」と同じ `.hlist`。 */}
        <div className="hlist">
          {chapters.map((ch) => {
            const list = ordered.filter((c) => CHAPTER_OF[c.region] === ch.id);
            if (!list.length) return null;
            return (
              <Fold
                key={ch.id}
                title={ch.label}
                lead={`${list[0].name}から${list[list.length - 1].name}まで`}
                note={`${list.length}カ国`}
                /* 開いておくのは、いまどこまで来たかが読める章ひとつだけ。
                   旅に出ているあいだは、いちばん下の「いま歩いている旅」がそれ */
                open={!TRIP_ON && list.some((c) => c.slug === here.slug)}
              >
                <ol className="atrip">
                  {list.map((c) => {
                    const towns = [...new Set(c.stays.flatMap((s) => s.cities))];
                    return (
                      <li key={c.slug}>
                        <span className="atrip-rail" aria-hidden />
                        <span className="atrip-no" aria-hidden>
                          {c.order}
                        </span>
                        <Link className="atrip-card" href={`/map/${c.slug}`} prefetch={false}>
                          <span className="atrip-flag">
                            <Flag slug={c.slug} size={34} />
                          </span>
                          <span className="atrip-body">
                            <span className="atrip-name">
                              <b>{c.name}</b>
                              <em>{c.en}</em>
                            </span>
                            <span className="atrip-when">{c.stays.map(span).join("、")}</span>
                            <span className="atrip-tags">
                              {towns.slice(0, 5).map((t) => (
                                <span key={t}>{t}</span>
                              ))}
                              {towns.length > 5 && <span>ほか{towns.length - 5}</span>}
                              {c.slug === here.slug && <HereTag slug={c.slug} />}
                            </span>
                          </span>
                          <Icon name="right" size={15} className="tile-go" />
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </Fold>
            );
          })}
          {/* いま歩いている旅の国。国境を越えた日にひとりでに1行増える。 */}
          <TripCountries
            steps={TRIP_STEPS}
            start={COUNTRIES.length}
            label={TRIP_CHAPTER?.name ?? ""}
            open={TRIP_ON}
          />
        </div>
      </Panel>
    </PageShell>
  );
}
