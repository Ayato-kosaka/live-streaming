import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import Icon, { type IconName } from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";

export const metadata: Metadata = {
  title: "デザインの見本",
  robots: { index: false, follow: false },
};

const ICONS: IconName[] = [
  "download", "external", "right", "close", "chevron",
  "appstore", "googleplay", "instagram", "youtube",
  "thumb", "ferry", "plane", "walk",
  "book", "coin", "wifi", "shirt", "sauna", "bowl", "gift",
  "alert", "light", "talk", "pin", "bell",
  "see", "do", "eat", "buy",
];

const FLAGS = [
  "france", "netherlands", "belgium", "germany", "austria", "czech", "slovakia",
  "hungary", "uk", "turkey", "cyprus", "egypt", "jordan", "uae", "azerbaijan",
  "georgia", "armenia", "iran-border",
  "poland", "lithuania", "latvia", "estonia", "finland", "sweden",
  "denmark", "norway", "canada", "japan",
];

/**
 * 作った印を全部並べておくページ。
 *
 * 絵文字を使わないと決めた以上、印は自分たちで作り続けることになる。
 * 揃っているか・欠けていないかを一目で見られる場所が要る。
 * 検索には出さない（robots: noindex）。
 */
export default function DesignPage() {
  return (
    <PageShell crumbs={[{ label: "デザインの見本" }]}>
      <PageHead
        title="デザインの見本"
        lead="このサイトで使う印。絵文字は1文字も使わないので、要るものはここに足していく。"
      />
      <Panel>
        <h2>アイコン {ICONS.length}</h2>
        <div className="dsgrid">
          {ICONS.map((n) => (
            <div key={n} className="dscell">
              <Icon name={n} size={26} />
              <i>{n}</i>
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <h2>国旗 {FLAGS.length}</h2>
        <div className="dsgrid">
          {FLAGS.map((s) => (
            <div key={s} className="dscell">
              <Flag slug={s} size={34} />
              <i>{s}</i>
            </div>
          ))}
        </div>
      </Panel>
    </PageShell>
  );
}
