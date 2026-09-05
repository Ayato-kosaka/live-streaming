import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import { Panel } from "@/components/ui/Bits";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import { RECIPES } from "@/content/recipes";
import { COUNTRIES } from "@/content/countries";
import KitchenCatalog from "@/components/streams/KitchenCatalog";
import { ArtBasket, ArtMeeting, ArtPot, ArtStamp } from "@/components/streams/Art";

export const metadata: Metadata = {
  title: "クッキング・スタンプ帳",
  description: "旅先のキッチンで作ってきた料理のスタンプ帳。企画会議→買い出し→調理の3日がかりで作っています。",
};

/** その料理が何日がかりだったか＝関わった配信の本数。 */
const days = (n: number) => RECIPES.filter((r) => r.streams.length === n).length;

export default function KitchenPage() {
  const byCountry = new Map<string, number>();
  RECIPES.forEach((r) => byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + 1));
  const ranked = [...byCountry.entries()].sort((a, b) => b[1] - a[1]);
  const top = COUNTRIES.find((c) => c.slug === ranked[0][0]);
  const streams = RECIPES.reduce((n, r) => n + r.streams.length, 0);
  const multi = RECIPES.filter((r) => r.streams.length >= 2).length;

  /** 何月に何品押したか。スタンプ帳なので、押されていない月も空けたまま並べる。 */
  const months: { key: string; n: number }[] = [];
  const dates = RECIPES.map((r) => r.date).sort();
  const [y0, m0] = dates[0].split("-").map(Number);
  const [y1, m1] = dates[dates.length - 1].split("-").map(Number);
  for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    months.push({ key, n: RECIPES.filter((r) => r.date.startsWith(key)).length });
  }
  const peak = Math.max(...months.map((x) => x.n));

  return (
    <PageShell current="streams" crumbs={[{ label: "配信やぐら", href: "/streams" }, { label: "キッチン小屋" }]}>
      <PageHead
        icon="hut-kitchen"
        title="クッキング・スタンプ帳"
        lead="何を作るかを企画会議で決めて、買い出しに行って、作って食べる。3日がかりで1品。"
        say={GUIDE.kitchen}
      />

      <Panel>
        <h2>
          <ArtStamp size={30} /> ここまで、何品たまったか
        </h2>
        <div className="stats">
          <div className="stat">
            <b>{RECIPES.length}</b>
            <span>押したスタンプ</span>
            <i>作って、食べたところまで</i>
          </div>
          <div className="stat">
            <b>{byCountry.size}</b>
            <span>作った国</span>
            <i>宿のキッチンを借りて</i>
          </div>
          <div className="stat">
            <b>{streams}</b>
            <span>そのための配信</span>
            <i>買い出しの日もふくめて</i>
          </div>
          <div className="stat">
            <b>{multi}</b>
            <span>2日以上かけた品</span>
            <i>買い出しの日から配信した</i>
          </div>
        </div>

        <div className="folds">
          <Fold
            title="どこの国のキッチンが多い"
            lead={top ? `いちばんは${top.name}の${ranked[0][1]}品` : undefined}
            note={`${byCountry.size}カ国`}
          >
            <ul className="kt-by">
              {ranked.map(([slug, n]) => {
                const c = COUNTRIES.find((x) => x.slug === slug);
                return (
                  <li key={slug}>
                    <Flag slug={slug} size={22} />
                    <b>{c?.name ?? slug}</b>
                    <span>
                      <i style={{ width: `${(n / ranked[0][1]) * 100}%` }} />
                    </span>
                    <em>{n}品</em>
                  </li>
                );
              })}
            </ul>
          </Fold>
          <Fold title="いつ、たくさん作っていた" lead={`${dates[0].replace(/-/g, "/")} からの ${months.length}ヶ月`} note={`最大 ${peak}品`}>
            <div className="kt-months">
              {months.map((mo) => (
                <span className="kt-mo" key={mo.key}>
                  <em>{mo.n || ""}</em>
                  <span
                    className={mo.n ? "" : "is-zero"}
                    style={{ height: mo.n ? `${14 + (mo.n / peak) * 54}px` : "6px" }}
                  />
                  <i>{Number(mo.key.slice(5)) === 1 ? mo.key.slice(2, 4) + "年" : Number(mo.key.slice(5))}</i>
                </span>
              ))}
            </div>
            <p style={{ marginTop: 10 }}>
              ジョージアに落ち着いてから、週に1品のペースになった。山にこもっていた2026年8月も、宿のキッチンで作り続けている。
            </p>
          </Fold>
          <Fold title="1品はどうやってできる" lead="企画会議 → 買い出し → 調理の3日" note={`${days(3)}品が3日がかり`}>
            <ol className="rt">
              <li>
                <span className="rt-stop">
                  <span className="rt-n">1</span>
                  <ArtMeeting size={40} />
                </span>
                <span className="rt-body">
                  <span className="rt-head">
                    <b>企画会議</b>
                  </span>
                  <p>「今日なにしよかー！」から始めて、コメントで出た案の中から作るものを決める。</p>
                </span>
              </li>
              <li>
                <span className="rt-stop">
                  <span className="rt-n">2</span>
                  <ArtBasket size={40} />
                </span>
                <span className="rt-body">
                  <span className="rt-head">
                    <b>買い出し</b>
                  </span>
                  <p>市場やスーパーへ。無い材料は現地のもので置き換える。ここでメニューが変わる日もある。</p>
                </span>
              </li>
              <li>
                <span className="rt-stop">
                  <span className="rt-n">3</span>
                  <ArtPot size={40} />
                </span>
                <span className="rt-body">
                  <span className="rt-head">
                    <b>作って、食べる</b>
                  </span>
                  <p>宿のキッチンで作って、その場で食べる。失敗した日は翌日にリベンジすることもある。</p>
                </span>
              </li>
            </ol>
          </Fold>
        </div>
      </Panel>

      <Panel>
        <h2>どれから見る</h2>
        <p className="muted">押すと、その1品ができるまでの3日ぶんが出てきます。</p>
        <div style={{ marginTop: 14 }}>
          <KitchenCatalog
            recipes={RECIPES}
            countries={COUNTRIES.map((c) => ({ slug: c.slug, name: c.name }))}
          />
        </div>
      </Panel>

      <Link className="tile" href="/streams/cooking" style={{ ["--tile" as string]: "var(--roof-coral)" }}>
        <img className="tile-icon" src="/sprites/hut-kitchen.webp" alt="" />
        <span className="tile-text">
          <b>クッキング配信そのものを見る</b>
          <i>どういう順で進む配信なのか</i>
        </span>
        <Icon name="right" size={15} className="tile-go" />
      </Link>
    </PageShell>
  );
}
