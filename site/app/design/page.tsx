import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
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
 * ここは「揃っているか」を見る場所ではなく、**潰れていないかを見る場所**。
 * だから並べるのは3通り: 大きく（56px）／本文に添える大きさ（16px）／
 * 暗い下地。明るい下地に置いたときに白い絵が消えるのは、ここでしか見つからない。
 *
 * 見た目は「紙の型」（`docs/ac-reference.md` 7章）。一覧なので板を積まない。
 * 影を落とさず、細い罫線で区切り、見出しには蛍光ペンの帯を敷く。
 * CSS は他の担当が触っているので、このページの中だけインラインで書く。
 */

/** 紙の実測値（ac-reference 7章の表）。ここだけで使う。 */
const P = {
  paper: "#eadda9",
  paperLit: "#efe4b6",
  outer: "#f4efcf",
  rule: "#9e976d",
  mark: "#dbdc90",
  chip: "#cfc202",
  ink: "#4b4335",
  dark: "#2f3a2c",
};

/** 紙。無地にしないでムラを入れる（画像は足さず、重ねたグラデーションで作る）。 */
const sheet: React.CSSProperties = {
  background: `
    radial-gradient(60% 40% at 18% 12%, ${P.paperLit} 0%, rgba(239,228,182,0) 60%),
    radial-gradient(50% 35% at 82% 68%, ${P.paperLit} 0%, rgba(239,228,182,0) 62%),
    radial-gradient(70% 50% at 45% 95%, rgba(200,186,132,.35) 0%, rgba(200,186,132,0) 60%),
    ${P.paper}`,
  border: `1px solid ${P.rule}`,
  borderRadius: 10,
  padding: "18px 16px 20px",
  margin: "0 0 14px",
  color: P.ink,
};

/** 見出し。蛍光ペンの帯を字の後ろに敷く。これ1つで印刷物に見える。 */
function Head({ title, count, note }: { title: string; count: number; note: string }) {
  return (
    <>
      <h2 style={{ margin: 0, fontSize: 17, letterSpacing: ".04em", lineHeight: 1.5 }}>
        <span
          style={{
            background: `linear-gradient(${P.mark},${P.mark}) 0 82%/100% .62em no-repeat`,
            padding: "0 .18em",
          }}
        >
          {title}
        </span>
        <b
          style={{
            marginLeft: 8,
            padding: "1px 8px",
            borderRadius: 999,
            background: P.chip,
            color: P.ink,
            fontSize: 11.5,
            verticalAlign: "middle",
          }}
        >
          {count}
        </b>
      </h2>
      <p
        style={{
          margin: "6px 0 0",
          paddingBottom: 10,
          borderBottom: `1px solid ${P.rule}`,
          fontSize: 12.5,
          lineHeight: 1.75,
          opacity: 0.8,
        }}
      >
        {note}
      </p>
    </>
  );
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))",
  gap: 0,
  marginTop: 2,
};

/**
 * ますめ。紙の型なので影は付けない。区切りは罫線だけ。
 * 罫線を右と下だけに引いて、隣どうしで1本を分け合う。
 */
const cell: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 5,
  padding: "12px 4px 9px",
  borderRight: `1px solid ${P.rule}55`,
  borderBottom: `1px solid ${P.rule}55`,
};

const label: React.CSSProperties = {
  fontStyle: "normal",
  fontSize: 9.5,
  fontWeight: 800,
  wordBreak: "break-all",
  textAlign: "center",
  opacity: 0.6,
};

/** 小さくしたときの見え方を見る帯。明暗2本で1組にする。 */
const strip = (bg: string, ink: string): React.CSSProperties => ({
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  gap: 6,
  height: 26,
  padding: "0 8px",
  borderRadius: 6,
  background: bg,
  color: ink,
});

/** 暗い下地。明るい下地で消える白い絵は、ここでしか見つからない。 */
const night = strip(P.dark, "#fdf6e6");
/** 明るい下地。逆に、暗い絵が紙に沈んでいないかを見る。 */
const day = strip("#fbf6df", P.ink);

export default function DesignPage() {
  return (
    <PageShell crumbs={[{ label: "デザインの見本" }]}>
      <PageHead
        title="デザインの見本"
        lead={`このサイトで使う印。絵文字は1文字も使わないので、要るものはここに足していく。いま ${TOTAL} 種。`}
      />

      <div style={{ background: P.outer, borderRadius: 14, padding: 10 }}>
        {GROUPS.map((g) => (
          <section key={g.title} style={sheet}>
            <Head title={g.title} count={g.names.length} note={g.note} />
            <div style={grid}>
              {g.names.map((n) => (
                <div key={n} style={cell}>
                  <Icon name={n as IconName} size={56} />
                  <span style={day}>
                    <Icon name={n as IconName} size={16} />
                    <Icon name={n as IconName} size={22} />
                  </span>
                  <span style={night}>
                    <Icon name={n as IconName} size={16} />
                    <Icon name={n as IconName} size={22} />
                  </span>
                  <i style={label}>{n}</i>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section style={sheet}>
          <Head
            title="国旗"
            count={FLAGS.length}
            note="小さく出すので細かい紋章は入れない。遠目に「あの国だ」と分かることだけを基準にする。"
          />
          <div style={grid}>
            {FLAGS.map((s) => (
              <div key={s} style={cell}>
                <Flag slug={s} size={56} />
                <Flag slug={s} size={20} />
                <i style={label}>{s}</i>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
