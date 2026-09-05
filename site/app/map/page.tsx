import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel, Stat } from "@/components/ui/Bits";
import { COUNTRIES } from "@/content/countries";
import Flag from "@/components/ui/Flag";
import Icon from "@/components/ui/Icon";
import WorldRoute from "@/components/atlas/WorldRoute";
import Days from "@/components/atlas/Days";
import MAP from "@/content/atlas/route.json";
import { PierArt } from "@/components/atlas/art";

export const metadata: Metadata = {
  title: "旅の桟橋",
  description:
    "2024年10月のパリから、いまいるジョージアまで。歩いた線と乗り物の線を1枚の地図にしました。",
};

/**
 * 旅の桟橋。
 *
 * 主役は地図。表で17行並べても「どこをどう回ったか」は伝わらないので、
 * まず1枚の地図を出して、そのあとに順番の年表を置く。
 * 国のピンからも年表からも、同じ国のページへ行ける。
 */

/** 出発の日。ここから今日までを数える。 */
const START = "2024-10-28";

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

  return (
    <PageShell current="map" crumbs={[{ label: "旅の桟橋" }]}>
      {/* h1 は場所の名前（docs/island-world.md 7.5）。
          国の数は静的書き出しで焼き込まれるので、見出しには入れない。
          カモメは、この下の地図の紙に「ピンを押すと」と同じことを言うので置かない。 */}
      <PageHead
        mark={<PierArt size={68} />}
        title="旅の桟橋"
        lead="2024年10月28日、パリで「日本語を話したい」と言いながら配信を始めました。そこからヨーロッパを回って、中東に降りて、いまはコーカサスにいます。"
      />

      {/* 4つを同じ重さで並べると、どれも「ただの数」に見える。
          先頭を大きくするのは CSS がやるので、こちらは添え字で中身の差を言う。
          国は旅の端から端、街は泊まった所だけ、日数は起点、いまここは数ではなく状態。 */}
      <div className="stats" style={{ marginBottom: 16 }}>
        <Stat value={visited.length} label="歩いた国" sub="パリからトビリシまで" />
        <Stat value={cities.size} label="通った街" sub="泊まった街だけ" />
        <Stat value={<Days from={START} />} label="旅した日数" sub="2024/10/28から" />
        <Stat
          value={<Flag slug={here.slug} size={34} />}
          label="いまここ"
          sub={here.name}
        />
      </div>

      <Panel>
        <h2>どこをどう回ったんだろう</h2>
        <p className="muted">
          ピンを押すと、その国のページへ行けます。上のボタンで地図を寄せられます。
        </p>
        <WorldRoute here={here.slug} />
      </Panel>

      <Panel>
        <h2>行った順に、ぜんぶ</h2>
        <p className="muted">同じ国に何度も戻っているので、番号は「初めて入った順」です。</p>
        <ol className="atrip">
          {ordered.map((c) => {
            const towns = [...new Set(c.stays.flatMap((s) => s.cities))];
            return (
              <li key={c.slug}>
                <span className="atrip-rail" aria-hidden />
                <span className="atrip-no" aria-hidden>
                  {c.order}
                </span>
                <Link className="atrip-card" href={`/map/${c.slug}`}>
                  <span className="atrip-flag">
                    <Flag slug={c.slug} size={34} />
                  </span>
                  <span className="atrip-body">
                    <span className="atrip-name">
                      <b>{c.name}</b>
                      <em>{c.en}</em>
                    </span>
                    <span className="atrip-when">
                      {c.stays.map(span).join("、")}
                    </span>
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
      </Panel>
    </PageShell>
  );
}
