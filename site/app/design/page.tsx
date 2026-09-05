import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { Panel } from "@/components/ui/Bits";
import Icon, { type IconName } from "@/components/ui/Icon";
import { GROUPS } from "@/components/ui/icons";
import Flag from "@/components/ui/Flag";

export const metadata: Metadata = {
  title: "デザインの見本",
  robots: { index: false, follow: false },
};

const FLAGS = [
  "france", "netherlands", "belgium", "germany", "austria", "czech", "slovakia",
  "hungary", "uk", "turkey", "cyprus", "egypt", "jordan", "uae", "azerbaijan",
  "georgia", "armenia", "iran-border",
  "poland", "lithuania", "latvia", "estonia", "finland", "sweden",
  "denmark", "norway", "canada", "japan",
];

const TOTAL = GROUPS.reduce((n, g) => n + g.names.length, 0);

/**
 * 作った印を全部並べる検品台。
 *
 * 絵文字を使わないと決めた以上、印は自分たちで作り続けることになる。
 * ここは「揃っているか」を見る場所ではなく、**潰れていないかを見る場所**。
 * だから小さい表示（16px＝本文に添える大きさ）と大きい表示（56px）を並べ、
 * 明るい下地と暗い下地の両方に置いてある。検索には出さない（robots: noindex）。
 *
 * CSS は他の人が触っているので、ここでは触らずインラインで書く。
 */
export default function DesignPage() {
  return (
    <PageShell crumbs={[{ label: "デザインの見本" }]}>
      <PageHead
        title="デザインの見本"
        lead={`このサイトで使う印。絵文字は1文字も使わないので、要るものはここに足していく。いま ${TOTAL} 種。`}
      />

      {GROUPS.map((g) => (
        <Panel key={g.title}>
          <h2>
            {g.title} {g.names.length}
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: 12.5, lineHeight: 1.7, opacity: 0.75 }}>
            {g.note}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))",
              gap: 8,
              marginTop: 12,
            }}
          >
            {g.names.map((n) => (
              <div
                key={n}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  padding: "10px 4px 7px",
                  borderRadius: 12,
                  background: "#fffaf0",
                  boxShadow: "inset 0 0 0 1.5px rgba(80,66,40,.1)",
                }}
              >
                <Icon name={n as IconName} size={54} />
                <span
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 6,
                    height: 26,
                    padding: "0 8px",
                    borderRadius: 8,
                    background: "#2f3a2c",
                    color: "#fdf6e6",
                  }}
                >
                  <Icon name={n as IconName} size={16} />
                  <Icon name={n as IconName} size={22} />
                </span>
                <i
                  style={{
                    fontStyle: "normal",
                    fontSize: 9.5,
                    fontWeight: 800,
                    wordBreak: "break-all",
                    textAlign: "center",
                    opacity: 0.65,
                  }}
                >
                  {n}
                </i>
              </div>
            ))}
          </div>
        </Panel>
      ))}

      <Panel>
        <h2>国旗 {FLAGS.length}</h2>
        <p style={{ margin: "2px 0 0", fontSize: 12.5, lineHeight: 1.7, opacity: 0.75 }}>
          小さく出すので細かい紋章は入れない。遠目に「あの国だ」と分かることだけを基準にする。
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))",
            gap: 8,
            marginTop: 12,
          }}
        >
          {FLAGS.map((s) => (
            <div
              key={s}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
                padding: "10px 4px 7px",
                borderRadius: 12,
                background: "#fffaf0",
                boxShadow: "inset 0 0 0 1.5px rgba(80,66,40,.1)",
              }}
            >
              <Flag slug={s} size={54} />
              <Flag slug={s} size={20} />
              <i
                style={{
                  fontStyle: "normal",
                  fontSize: 9.5,
                  fontWeight: 800,
                  wordBreak: "break-all",
                  textAlign: "center",
                  opacity: 0.65,
                }}
              >
                {s}
              </i>
            </div>
          ))}
        </div>
      </Panel>
    </PageShell>
  );
}
