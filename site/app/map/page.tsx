import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel, Stat } from "@/components/ui/Bits";
import Fold from "@/components/ui/Fold";
import { BEFORE_STREAM, COUNTRIES } from "@/content/countries";
import Flag from "@/components/ui/Flag";
import Icon from "@/components/ui/Icon";
import WorldRoute from "@/components/atlas/WorldRoute";
import Days from "@/components/atlas/Days";
import StayDays from "@/components/atlas/StayDays";
import MAP from "@/content/atlas/route.json";
import { PROFILE } from "@/content/site";

export const metadata: Metadata = {
  title: "歩いた国",
  description:
    "2024年9月に日本を出てから、いまいるジョージアまで。歩いた線と乗り物の線を1枚の地図にしました。",
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
  // いまいる国 = まだ出国していない国（滞在の終わりが空）。
  // 並びの最後を「いまここ」にすると、GWにイラン国境まで歩いた回が最後に来てしまう。
  const here = COUNTRIES.find((c) => c.stays.some((s) => !s.to)) ?? COUNTRIES[0];
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
          カモメは、この下の地図の紙に「ピンを押すと」と同じことを言うので置かない。 */}
      <PageHead
        icon="signpost-flags"
        title="歩いた国"
        lead="2024年10月28日、パリで「日本語を話したい」と言いながら配信を始めました。そこからヨーロッパを回って、中東に降りて、いまはコーカサスにいます。"
      />

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
        <Stat
          value={<Flag slug={here.slug} size={34} />}
          label={here.name}
          sub={<StayDays fallback="いまここ" />}
        />
      </div>

      <Panel>
        <h2>どこをどう回ったんだろう</h2>
        <p className="muted">
          ピンを押すと、その国が地図の上で開きます。「パリから、たどる」を押すと、
          出発から今日まで、入った順に18カ国を回ります。
        </p>
        <WorldRoute here={here.slug} />
      </Panel>

      {/* **配信より前の6週間を、地図と年表のあいだに置く。**
          下の一覧は配信タイトルから復元したものなので、配信の無い6週間が
          まるごと抜けている。「1カ国目はフランス」と読めてしまうが、
          実際はその前にイギリス・バルセロナ・ローマを回っている。
          **日付は書かない。「2週間ずつ」しか聞いていないので、
          from/to を書くと聞いていない日付を書いたことになる。** */}
      <Panel className="mbefore">
        <h2>その前に、配信していない6週間がある</h2>
        <p>
          日本を出たのは{PROFILE.leftJapan.replace(/-/g, "/")}、パリで配信を始めたのは
          {START.replace(/-/g, "/")}。そのあいだの6週間は、
          {BEFORE_STREAM.map((c) => c.city ?? c.name).join("、")}を2週間ずつ回っていました。
          配信が無いので、下の一覧には出てきません。
        </p>
        <ol className="mbefore-list">
          {BEFORE_STREAM.map((c) => (
            <li key={c.slug}>
              <b>{c.city ?? c.name}</b>
              <i>{c.city ? c.name : ""}</i>
              <span>{c.weeks}週間</span>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel>
        <h2>行った順に、ぜんぶ</h2>
        <p className="muted">
          同じ国に何度も戻っているので、番号は「初めて入った順」です。章は上の地図と同じ区切りです。
          <b>配信のあった国だけ</b>なので、上の6週間はここに入っていません。
        </p>
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
                open={list.some((c) => c.slug === here.slug)}
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
                              {c.slug === here.slug && <span className="atrip-here">いまここ</span>}
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
        </div>
      </Panel>
    </PageShell>
  );
}
