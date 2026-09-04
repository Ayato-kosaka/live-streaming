import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import { Panel, Stat } from "@/components/ui/Bits";
import { RECIPES } from "@/content/recipes";
import { COUNTRIES } from "@/content/countries";

export const metadata: Metadata = {
  title: "クッキング・スタンプ帳",
  description: "旅先のキッチンで作ってきた料理のスタンプ帳。企画会議→買い出し→調理の3日がかりで作っています。",
};

export default function KitchenPage() {
  const sorted = [...RECIPES].sort((a, b) => (a.date < b.date ? 1 : -1));
  const byCountry = new Map<string, number>();
  RECIPES.forEach((r) => byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + 1));
  return (
    <PageShell current="kitchen" crumbs={[{ label: "キッチン小屋" }]}>
      <PageHead
        icon="hut-kitchen"
        title="クッキング・スタンプ帳"
        lead="何を作るかを企画会議で決めて、買い出しに行って、作って食べる。3日がかりで1品。"
        say={GUIDE.kitchen}
      />
      <div className="stats" style={{ marginBottom: 18 }}>
        <Stat value={RECIPES.length} label="作った料理" />
        <Stat value={byCountry.size} label="作った国" />
        <Stat value={RECIPES.reduce((n, r) => n + r.streams.length, 0)} label="関係した配信" />
        <Stat value="3日" label="1品あたり" sub="企画→買い出し→調理" />
      </div>

      <Panel>
        <h2>スタンプ帳</h2>
        <div className="stamps">
          {sorted.map((r) => {
            const c = COUNTRIES.find((x) => x.slug === r.country);
            return (
              <Link key={r.slug} href={`/kitchen/${r.slug}`} className="stamp">
                <img className="stamp-icon" src={`/sprites/${r.icon}.png`} alt="" />
                <b>{r.name}</b>
                <i>
                  {c?.flag} {r.date.replace(/-/g, "/")}
                </i>
              </Link>
            );
          })}
        </div>
      </Panel>
    </PageShell>
  );
}
