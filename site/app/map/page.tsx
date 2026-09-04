import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import { Panel, Stat } from "@/components/ui/Bits";
import { COUNTRIES } from "@/content/countries";

export const metadata: Metadata = {
  title: "これまでに歩いた17カ国",
  description: "2024年10月のパリから、いまいるジョージアまで。配信しながら歩いてきた国の記録です。",
};

const REGIONS = ["ヨーロッパ", "中東・アフリカ", "コーカサス"] as const;

const fmt = (d: string) => (d ? d.replace(/-/g, "/").slice(0, 7) : "いま");

export default function MapPage() {
  const days = Math.round((new Date("2026-09-04").getTime() - new Date("2024-10-28").getTime()) / 86400000);
  return (
    <PageShell current="map" crumbs={[{ label: "旅の桟橋" }]}>
      <PageHead
        icon="signpost"
        title="これまでに歩いた17カ国"
        lead="2024年10月28日、パリで「日本語を話したい」と言いながら配信を始めました。そこからヨーロッパを回って、中東に降りて、いまはコーカサスにいます。"
        say={GUIDE.map}
      />
      <div className="stats" style={{ marginBottom: 18 }}>
        <Stat value="17" label="国" />
        <Stat value="40+" label="街" />
        <Stat value={days.toLocaleString()} label="旅した日数" sub="2024/10/28から" />
        <Stat value="🇬🇪" label="いまここ" sub="ジョージア" />
      </div>

      {REGIONS.map((region) => (
        <Panel key={region}>
          <h2>{region}</h2>
          <ul className="clist">
            {COUNTRIES.filter((c) => c.region === region).map((c) => (
              <li key={c.slug}>
                <Link href={`/map/${c.slug}`}>
                  <span className="clist-flag" aria-hidden>{c.flag}</span>
                  <span className="clist-body">
                    <b>
                      {c.name}
                      <em>{c.en}</em>
                    </b>
                    <i>
                      {c.stays.map((s) => `${fmt(s.from)}–${fmt(s.to)}`).join("、")}
                      {" ・ "}
                      {c.stays.flatMap((s) => s.cities).slice(0, 4).join("、")}
                    </i>
                  </span>
                  <span className="tile-go" aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </PageShell>
  );
}
