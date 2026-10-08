import MAP from "@/content/northMacedonia/map.json";

/**
 * 北マケドニアの地図。
 *
 * **この面でいちばん先に伝えたいのは「海に出ない」こと**なので、
 * 左にアドリア海とアルバニアを一緒に入れてある。海はここにしか写っていない。
 *
 * 形は本物（world-atlas 10m と ne_10m_lakes）。
 * 陸も湖も街の座標も `python/build_macedonia_map.py` が計算して焼いている。
 * **ここで経度緯度から座標を出し直さない。必ずズレる**
 * （`components/nordic/RouteMapSvg.tsx` と同じ決まり）。
 *
 * 塗りは島と同じで、輪郭線を引かない。色は全部 CSS 変数にしてあるので、
 * 島の色（`app/css/tokens.css` の `[data-theme]`）を変えると地図も一緒に動く。
 *
 * **凡例を地図の上に置かない。** 1000x581 の絵に板を重ねると、
 * いちばん見せたいオフリド湖のあたりが隠れる。読み方は下の行で言う。
 */

/** 名札をどちらへ出すか。隣どうしがぶつからないよう、描いた絵を見て手で決めた */
const LABEL: Record<string, { dx: number; dy: number; at: "start" | "end" }> = {
  skopje: { dx: 14, dy: 6, at: "start" },
  // マトカはスコピエの西 30px しか離れていない。右へ出すと札が重なるので左へ返す
  matka: { dx: -13, dy: 16, at: "end" },
  ohrid: { dx: 14, dy: 5, at: "start" },
  bitola: { dx: 13, dy: 17, at: "start" },
  // この2つは国の東はしに居る。右へ出すと札が地図の外へはみ出して切れるので、左へ返す
  kavadarci: { dx: -13, dy: 6, at: "end" },
  stip: { dx: -13, dy: 6, at: "end" },
  kokino: { dx: 14, dy: 6, at: "start" },
  // ティラナは国の外。左へ出して、地図の縁へ逃がす
  tirana: { dx: -13, dy: 6, at: "end" },
};

export default function NmMapSvg() {
  return (
    <figure className="nmmap">
      <svg
        viewBox={`0 0 ${MAP.w} ${MAP.h}`}
        role="img"
        aria-label="北マケドニアと、西どなりのアルバニア。左端にアドリア海。南西にオフリド湖とプレスパ湖。"
      >
        {/* 海。いちばん下に敷いて、陸でふさいだ残りが海になる */}
        <rect x="0" y="0" width={MAP.w} height={MAP.h} className="nmm-sea" />
        {/* となりの国ぜんぶ。くすんだ1色で、どこが国境かは描かない */}
        <path d={MAP.land} className="nmm-land" />
        {/* アルバニア。**いま居るところ**なので、ほかの隣国と分ける */}
        <path d={MAP.al} className="nmm-al" />
        {/* 北マケドニア */}
        <path d={MAP.mk} className="nmm-mk" />
        {/* 湖。海と同じ色にしない——同じ色だと、湖が海とつながって見える */}
        <path d={MAP.lakes} className="nmm-lake" />
        {MAP.places.map((p) => {
          const l = LABEL[p.id] ?? { dx: 13, dy: 6, at: "start" as const };
          const fs = p.kind === "cap" ? 38 : 32;
          /* 名前はぜんぶ全角のカタカナなので、幅は「字数 × 字の大きさ」で足りる。
             ここで実測しないのは、SVG の中で字を測るには一度描く必要があるから。 */
          const tw = p.name.length * fs;
          const tx = p.x + l.dx;
          return (
            <g key={p.id} className={`nmm-pin is-${p.kind}`}>
              <circle cx={p.x} cy={p.y} r={p.kind === "cap" ? 10 : 7} />
              {/* **字の下に地を敷く。** 縁取り（stroke）では濃さが足りない——
                  測る側は縁取りを字といっしょに消すし、実際そこを読んでもいない
                  （`components/nordic/RouteMapSvg.tsx` に実測つきの同じ注がある）。
                  緑の陸の上に茶色の字を直に置くと 1.97 しか出ず、紙を敷くと 5 を超える。 */}
              <rect
                className="nmm-lab"
                x={l.at === "end" ? tx - tw - 6 : tx - 6}
                y={p.y + l.dy - fs * 0.82}
                width={tw + 12}
                height={fs * 1.14}
                rx={fs * 0.3}
              />
              <text x={tx} y={p.y + l.dy} textAnchor={l.at} fontSize={fs}>
                {p.name}
              </text>
            </g>
          );
        })}
      </svg>
      {/* **時点を言わない。** 「いま居るアルバニア」と書くと、島を出た日から嘘になる
          （`docs/island-standards.md` 16章）。位置の話だけにする。 */}
      <figcaption>
        緑が北マケドニア。左の海はアドリア海で、西どなりのアルバニア（ティラナのあるほう）までしか来ていない。
        南西の水色がオフリド湖とプレスパ湖——どちらも半分はアルバニア側。
      </figcaption>
    </figure>
  );
}
