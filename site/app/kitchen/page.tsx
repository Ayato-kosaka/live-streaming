import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import { KINDS, RECIPES } from "@/content/recipes";
import { COUNTRIES } from "@/content/countries";
import KitchenCatalog from "@/components/streams/KitchenCatalog";
import { H, Rec, Sheet, Zone } from "@/components/streams/Sheet";
import { ArtBasket, ArtMeeting, ArtPot, ArtStamp } from "@/components/streams/Art";

export const metadata: Metadata = {
  title: "クッキング・スタンプ帳",
  description: "旅先のキッチンで作ってきた料理のスタンプ帳。企画会議→買い出し→調理の3日がかりで作っています。",
};

export default function KitchenPage() {
  const byCountry = new Map<string, number>();
  RECIPES.forEach((r) => byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + 1));
  const ranked = [...byCountry.entries()].sort((a, b) => b[1] - a[1]);
  const top = COUNTRIES.find((c) => c.slug === ranked[0][0]);
  const streams = RECIPES.reduce((n, r) => n + r.streams.length, 0);

  /** いちばん手間のかかった品。同じ本数なら新しいほう。 */
  const hardest = [...RECIPES].sort((a, b) =>
    a.streams.length !== b.streams.length ? b.streams.length - a.streams.length : a.date < b.date ? 1 : -1,
  )[0];

  /** 種類ごとの数。多い順に。 */
  const byKind = KINDS.map((k) => ({ ...k, n: RECIPES.filter((r) => r.kind === k.id).length }))
    .filter((k) => k.n > 0)
    .sort((a, b) => b.n - a.n);

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
  const busiest = months.find((x) => x.n === peak)!;

  // キッチン小屋は島に建っていて、島から直接押して入る。配信やぐらの下に
  // ぶら下げると、パンくずと実際の行き方が食い違う（`docs/island-design.md` 6章）。
  return (
    <PageShell crumbs={[{ label: "キッチン小屋" }]}>
      <PageHead
        icon="hut-kitchen"
        title="クッキング・スタンプ帳"
        lead="何を作るかを企画会議で決めて、買い出しに行って、作って食べる。3日がかりで1品。"
        say={GUIDE.kitchen}
      />

      <Sheet>
        <Zone>
          <H art={<ArtStamp size={32} />} note={`${dates[0].replace(/-/g, "/")} からの記録`}>
            ここまでに押したスタンプ
          </H>
          <Rec
            items={[
              { n: RECIPES.length, unit: "品", label: "押したスタンプ", note: "作って、食べたところまで" },
              { n: byCountry.size, unit: "カ国", label: "借りたキッチン", note: "宿と、山の中の宿と" },
              { n: streams, unit: "本", label: "そのための配信", note: "買い出しの日もふくめて" },
              { n: hardest.streams.length, unit: "日", label: "いちばん長かった1品", note: hardest.name },
            ]}
          />
        </Zone>

        <Zone tight>
          <div className="folds">
            <Fold
              title="どこの国のキッチンが多い"
              lead={top ? `いちばんはジョージアの${ranked[0][1]}品` : undefined}
              note={`${byCountry.size}カ国`}
            >
              <ul className="kt-by">
                {ranked.map(([slug, n]) => {
                  const c = COUNTRIES.find((x) => x.slug === slug);
                  return (
                    <li key={slug}>
                      <Flag slug={slug} size={20} />
                      <b>{c?.name ?? slug}</b>
                      <span>
                        <i style={{ width: `${(n / ranked[0][1]) * 100}%` }} />
                      </span>
                      <em>{n}品</em>
                    </li>
                  );
                })}
              </ul>
              <p>
                ジョージアに落ち着いてから、同じキッチンで作り続けている。イギリスとベルギーは、まだ宿を転々としていたころ。
              </p>
            </Fold>

            <Fold title="どんな料理が多い" lead={`いちばんは${byKind[0].label}の${byKind[0].n}品`} note={`${byKind.length}種`}>
              <ul className="kt-by">
                {byKind.map((k) => (
                  <li key={k.id}>
                    <b style={{ width: "6.5em" }}>{k.label}</b>
                    <span>
                      <i style={{ width: `${(k.n / byKind[0].n) * 100}%` }} />
                    </span>
                    <em>{k.n}品</em>
                  </li>
                ))}
              </ul>
              <p>
                現地の食材で日本の味を作ろうとすると、だいたい粉ものか麺になる。魚が3品しかないのは、内陸のジョージアで生の魚を手に入れるのが難しいから。
              </p>
            </Fold>

            <Fold
              title="いつ、たくさん作っていた"
              lead={`${busiest.key.replace("-", "/")} の${peak}品がいちばん多い`}
              note={`${months.length}ヶ月`}
            >
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
              <p>
                週に1品のペースになったのは、ジョージアに落ち着いてから。山にこもっていた2026年8月も、宿のキッチンで作り続けている。
              </p>
            </Fold>

            <Fold title="1品は、どうやってできる" lead="企画会議 → 買い出し → 作って食べる" note="3日">
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
        </Zone>

        <KitchenCatalog recipes={RECIPES} countries={COUNTRIES.map((c) => ({ slug: c.slug, name: c.name }))} />
      </Sheet>

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
