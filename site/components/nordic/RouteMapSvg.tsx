import Link from "next/link";
import MAP from "@/content/nordic/map.json";
import { NORDIC_COUNTRIES, ROUTE } from "@/content/nordic";

/**
 * 北欧ルートの地図。
 *
 * 形は本物。Natural Earth の海岸線をランベルト正角円錐で投影してある
 * （`python/build_nordic_map.py`）。街・ルート・山なみ・国境・縮尺・方位も、
 * ぜんぶあのスクリプトが座標まで計算して焼き込んでいる。
 * **ここで経度緯度から座標を計算し直さないこと。必ずズレる。**
 * 本物との一致は面積で測ってある（重なり 99.5%）。
 *
 * 塗りは島と同じ作り。輪郭線を引かず、
 *   深い海 → 浅瀬 → 白い泡 → 濡れた砂 → 砂浜 → 草
 * の帯で陸と海を分ける（docs/ac-reference.md 2章）。
 * 色はぜんぶ CSS 変数。生の色をここに書くと、島の色を変えたときに
 * 地図だけ取り残されて浮く。
 *
 * 森と山は「同じパスを3枚、少しずらして重ねる」ことで立体にしている。
 * 木1本ずつに明るい面と暗い面を持たせると、パスの文字数が倍になって
 * JSON が太る（森だけで 700 本ある）。
 *
 * 凡例は地図の中に置かない。地図のいちばん見せたいところ（ノルウェーと
 * スウェーデン）が板で隠れる。線の読み方は `MapLegend` が外に出す。
 */

/**
 * 街の名札をどちらに出すか。
 * 近い街どうしがぶつからないよう、実際に描いた絵を見て手で決める。
 */
const LABEL: Record<string, { dx: number; dy: number; at: "start" | "middle" | "end" }> = {
  katowice: { dx: -22, dy: -14, at: "end" },
  krakow: { dx: 26, dy: 26, at: "start" },
  oswiecim: { dx: -20, dy: 44, at: "end" },
  warszawa: { dx: 28, dy: 12, at: "start" },
  bialystok: { dx: 28, dy: 12, at: "start" },
  vilnius: { dx: 28, dy: 14, at: "start" },
  siauliai: { dx: -26, dy: 8, at: "end" },
  riga: { dx: -28, dy: 4, at: "end" },
  tallinn: { dx: 28, dy: 16, at: "start" },
  helsinki: { dx: 28, dy: -8, at: "start" },
  stockholm: { dx: -28, dy: 6, at: "end" },
};

/** 区間の線の描き方。太さだけここで決めて、色は CSS 変数に逃がす。 */
const LEG: Record<string, { cls: string; width: number; dash?: string }> = {
  hitch: { cls: "is-hitch", width: 12 },
  ferry: { cls: "is-ferry", width: 8, dash: "4 20" },
  side: { cls: "is-side", width: 6, dash: "3 14" },
};

/** ピンの大きさ。泊まる街を大きく、通るだけの街を小さく。 */
const PIN: Record<string, number> = { goal: 16, stay: 13, pass: 10, side: 8, land: 10 };

export default function RouteMapSvg({ here }: { here?: string }) {
  const { view, land, countries, cities, legs, fly, borders } = MAP;
  const { lakes, rivers, grid, woods, hills, glints, labels, seas, scale, north } = MAP;
  const name = Object.fromEntries(NORDIC_COUNTRIES.map((c) => [c.slug, c.name]));
  const cityName = Object.fromEntries(cities.map((c) => [c.id, c.name]));
  const seqOf = Object.fromEntries(cities.map((c) => [c.id, c.seq]));

  // 距離は content/nordic.ts のルートが持っているものをそのまま使う。
  // 地図の側にもう一組 km を書くと、片方だけ直したときに黙って食い違う。
  // 街の名前で引き当てる（「オシフィエンチム（アウシュヴィッツ）」のような
  // 補足つきの表記があるので、括弧から先は落として比べる）。
  const bare = (s: string) => s.replace(/（.*$/, "");
  const km = new Map(ROUTE.map((l) => [`${bare(l.from)}|${bare(l.to)}`, l.km]));
  // 区間の id。地図の線と、下の区間カードを同じものとして扱うのに要る
  // （`docs/nordic-fund.md` 提案3）。付け合わせは km と同じく街の名前で行う。
  const legId = new Map(ROUTE.map((l) => [`${bare(l.from)}|${bare(l.to)}`, l.id]));

  // いまどこまで来たか。`here` が分かっているときだけ、通った道と
  // これからの道を塗り分ける。分からないときは全部「これから行く道」。
  //
  // トップページでは、いる場所が分かるのは画面が出たあと（`TripNow` が
  // `/island-api/state` を読む）。そのときは同じ `is-done` を DOM で付ける。
  // だから区間にも街にも `data-seq` を持たせてある。
  const hereSeq = here != null ? seqOf[here] : undefined;
  const done = (s: number) => hereSeq != null && s <= hereSeq;

  // 飛行機の区間。地図では1本の破線で、街のピンを2つ持たない
  // （出発地のクタイシは画面の外）。降りる街は seq が最小のところ。
  const flySeq = Math.min(...cities.map((c) => c.seq));
  const flyLegId = ROUTE.find((l) => l.move === "fly")?.id;

  return (
    <svg
      className="nmap"
      viewBox={`0 0 ${view.w} ${view.h}`}
      data-here={here ?? undefined}
      role="img"
      aria-label="ジョージアを出て、ポーランドからバルト三国を北上し、フェリーで北欧へ抜けるルートの地図"
    >
      <defs>
        <linearGradient id="nmSea" x1="0.1" y1="0" x2="0.35" y2="1">
          <stop className="nm-sea-a" offset="0" />
          <stop className="nm-sea-b" offset="0.52" />
          <stop className="nm-sea-c" offset="1" />
        </linearGradient>
        <linearGradient id="nmLand" x1="0" y1="0" x2="0.2" y2="1">
          <stop className="nm-land-a" offset="0" />
          <stop className="nm-land-b" offset="1" />
        </linearGradient>
        <radialGradient id="nmGlint">
          <stop className="nm-glint-a" offset="0" />
          <stop className="nm-glint-b" offset="1" />
        </radialGradient>
        {/* 浅瀬はふちをぼかす。かたい切り替わりを作らない（島の絵の原則） */}
        <filter id="nmShelf" x="-8%" y="-8%" width="116%" height="116%">
          <feGaussianBlur stdDeviation="11" />
        </filter>
        {/* 陸が海に落とす影。これがあると陸が「浮いた板」に見える。 */}
        <filter id="nmLandDrop" x="-6%" y="-6%" width="112%" height="112%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id="nmDrop" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.28" />
        </filter>
        <clipPath id="nmLandClip">
          <path d={land} />
        </clipPath>
      </defs>

      {/* ---- 海 ---------------------------------------------------- */}
      <rect width={view.w} height={view.h} fill="url(#nmSea)" />
      {/* うねり。島の海と同じ、うっすら流れる線 */}
      <g className="nm-swell">
        {Array.from({ length: 16 }, (_, i) => {
          const y = 30 + i * 58;
          return (
            <path
              key={i}
              d={`M${(i % 3) * 96 - 60} ${y}q46 -13 92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0`}
            />
          );
        })}
      </g>
      {/* きらめき。陸から離れた開いた海にだけ置いてある（ac-reference 1章） */}
      <g className="nm-glints">
        {glints.map(([x, y, r], i) => (
          <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.42} fill="url(#nmGlint)" />
        ))}
      </g>

      {/* ---- 岸。沖から順に 影 → 浅瀬 → 泡 → 濡れた砂 --------------- */}
      <path className="nm-landdrop" d={land} filter="url(#nmLandDrop)" transform="translate(3 7)" />
      <path className="nm-shelf" d={land} filter="url(#nmShelf)" />
      <path className="nm-shallow" d={land} />
      <path className="nm-foam-lace" d={land} />
      <path className="nm-foam" d={land} />

      {/* ---- 陸 ---------------------------------------------------- */}
      {/* 通らない国どうしの境は描かない。描くと政治の地図になって、
          通る6カ国が主役だということが伝わらなくなる。 */}
      <path className="nm-land" d={land} fill="url(#nmLand)" />
      {Object.entries(countries).map(([slug, d]) => (
        <path key={slug} className={`nm-c nm-c-${slug}`} d={d} />
      ))}
      {/* 国の境。かたい線は引かず、両側に落ちる淡い影だけで分ける。 */}
      {Object.entries(countries).map(([slug, d]) => (
        <path key={`s${slug}`} className="nm-seam" d={d} />
      ))}
      {/* 砂浜。陸の内側にだけ出す（外は濡れた砂と泡が受け持つ） */}
      <g clipPath="url(#nmLandClip)">
        <path className="nm-sand" d={land} />
        <path className="nm-sand-wet" d={land} />
      </g>

      {/* ---- 地面の情報量 ------------------------------------------ */}
      {/* 森と山は、同じパスをずらして3枚。奥から 影 → 光 → 本体。 */}
      <g clipPath="url(#nmLandClip)">
        <path className="nm-hill-shade" d={hills} transform="translate(4 4)" />
        <path className="nm-hill-hi" d={hills} transform="translate(-3 -4)" />
        <path className="nm-hill" d={hills} />
        <path className="nm-wood-shade" d={woods} transform="translate(1.6 2)" />
        <path className="nm-wood-hi" d={woods} transform="translate(-1.4 -1.8)" />
        <path className="nm-wood" d={woods} />
      </g>
      {/* ---- 国の名前。地形の一部なので、街の名札のような白フチは付けない。
           ただし森の上には出す（森の下に敷くと、木で読めなくなる）。 --- */}
      {Object.entries(labels).map(([slug, l]) => (
        <text key={slug} className="nm-country" x={l.x} y={l.y} fontSize={l.size} textAnchor="middle">
          {name[slug]}
        </text>
      ))}

      <path className="nm-lake" d={lakes} />
      <path className="nm-river" d={rivers} />
      <path className="nm-grid" d={grid} />

      {/* ---- 海の名前 ---------------------------------------------- */}
      {seas.map((s) => (
        <text
          key={s.name}
          className="nm-sea-name"
          x={s.x}
          y={s.y}
          fontSize={s.size}
          textAnchor="middle"
          transform={`rotate(${s.rot} ${s.x} ${s.y})`}
        >
          {s.name}
        </text>
      ))}

      {/* ---- ジョージアからの飛行機。画面の外から入ってくる --------
           この1本も区間カードを持っている（足代も道しるべも席がある）ので、
           `data-leg` を付けて、ほかの区間と同じように状態を出せるようにする。
           降りるのは、地図に出ている街のうちいちばん手前（seq が最小）のところ。 */}
      <g className="nm-leg is-fly" data-leg={flyLegId} data-seq={flySeq}>
        <path className="nm-leg-look" d={fly.d} strokeWidth="30" />
        <path className="nm-fly" d={fly.d} />
        <path className="nm-leg-tie" d={fly.d} strokeWidth="3" strokeDasharray="16 15" />
      </g>
      <g className="nm-chip" transform={`translate(${fly.chip[0]} ${fly.chip[1]})`}>
        <rect x="-178" y="-26" width="356" height="52" rx="26" />
        <text x="0" y="9" textAnchor="middle">
          クタイシから 3時間35分
        </text>
      </g>

      {/* ---- ルート ------------------------------------------------ */}
      {legs.map((l) => {
        const s = LEG[l.move] ?? LEG.hitch;
        const pair = `${cityName[l.from]}|${cityName[l.to]}`;
        const kmv = km.get(pair);
        return (
          <g
            key={`${l.from}-${l.to}`}
            className={`nm-leg ${s.cls}${done(seqOf[l.to]) ? " is-done" : ""}`}
            data-seq={seqOf[l.to]}
            data-leg={legId.get(pair)}
          >
            {/* 区間カードで開いているところ。線の下に太く1本敷くだけにして、
                線そのものの色は変えない（どの手段かが読めなくなる）。 */}
            <path className="nm-leg-look" d={l.d} strokeWidth={s.width + 26} />
            <path className="nm-leg-case" d={l.d} strokeWidth={s.width + 8} />
            <path className="nm-leg-line" d={l.d} strokeWidth={s.width} strokeDasharray={s.dash} />
            {/* つながった区間。線を1本増やさず、同じ線の芯を明るくする
                （`docs/nordic-fund.md` 提案3）。金額は地図に書かない。 */}
            <path
              className="nm-leg-tie"
              d={l.d}
              strokeWidth={Math.max(3, s.width - 5)}
              strokeDasharray={s.dash}
            />
            {l.marks.map(([mx, my, ang], i) => (
              <path
                key={i}
                className="nm-arrow"
                d="M-5 -7L7 0L-5 7Z"
                transform={`translate(${mx} ${my}) rotate(${ang})`}
              />
            ))}
            {l.kmAt && kmv && (
              <text className="nm-km" x={l.kmAt[0]} y={l.kmAt[1]} textAnchor="middle">
                {kmv}km
              </text>
            )}
          </g>
        );
      })}

      {/* ---- 陸の国境。越える向きに直角な、赤白の遮断棒 ------------- */}
      {borders.map((b) => (
        <g key={b.name} className="nm-border" transform={`translate(${b.x} ${b.y}) rotate(${b.deg})`}>
          <rect className="nm-border-bar" x="-4" y="-19" width="8" height="38" rx="4" />
          <rect className="nm-border-tip" x="-4" y="-19" width="8" height="13" rx="4" />
          <rect className="nm-border-tip" x="-4" y="6" width="8" height="13" rx="4" />
        </g>
      ))}

      {/* ---- 街 ---------------------------------------------------- */}
      {cities.map((c) => {
        const lb = LABEL[c.id] ?? { dx: 24, dy: 8, at: "start" as const };
        const big = c.kind === "stay" || c.kind === "goal";
        const r = PIN[c.kind] ?? 9;
        const fs = big ? 34 : 28;
        // 名札の当たり判定。文字幅はカタカナなので、字数×文字サイズでほぼ合う。
        const tw = c.name.length * fs + 12;
        const tx = lb.at === "end" ? c.x + lb.dx - tw : c.x + lb.dx;
        return (
          <Link
            key={c.id}
            href={`/nordic/${c.country}`}
            className={`nmap-pin is-${c.kind}${c.cap ? " is-cap" : ""}${done(c.seq) ? " is-done" : ""}${
              here === c.id ? " is-now" : ""
            }`}
            data-id={c.id}
            data-seq={c.seq}
          >
            {/* 指で押せる幅を稼ぐ。絵は小さくても、押せる場所は絵とピンの周り。 */}
            <rect className="nm-hit" x={c.x - 34} y={c.y - 34} width="68" height="68" rx="34" />
            <rect className="nm-hit" x={tx} y={c.y + lb.dy - fs} width={tw} height={fs + 14} rx="10" />
            <ellipse className="nm-pin-shadow" cx={c.x} cy={c.y + r * 0.55} rx={r * 1.15} ry={r * 0.5} />
            {c.cap ? (
              /* 首都は星。11個ぜんぶ同じ丸だと、点が並んでいるだけに見える。 */
              <g transform={`translate(${c.x} ${c.y}) scale(${r / 13})`}>
                <path
                  className="nm-pin-ring"
                  d="M0 -19L4.6 -6.4L18 -5.9L7.4 2.4L11.1 15.3L0 7.6L-11.1 15.3L-7.4 2.4L-18 -5.9L-4.6 -6.4Z"
                />
                <path
                  className="nm-pin-dot"
                  d="M0 -12L2.9 -4.1L11.4 -3.7L4.7 1.5L7 9.7L0 4.8L-7 9.7L-4.7 1.5L-11.4 -3.7L-2.9 -4.1Z"
                />
              </g>
            ) : (
              <>
                <circle className="nm-pin-ring" cx={c.x} cy={c.y} r={r} />
                <circle className="nm-pin-dot" cx={c.x} cy={c.y} r={r - 5} />
              </>
            )}
            <text
              className={`nm-city${big ? " is-big" : ""}`}
              x={c.x + lb.dx}
              y={c.y + lb.dy}
              fontSize={fs}
              textAnchor={lb.at}
            >
              {c.name}
            </text>
            {/* ゴール。この旅は「回る」のではなく「会いに行く」ので、
                着く場所が地図の上でもいちばん強く見えないといけない。 */}
            {c.kind === "goal" && (
              <g className="nm-goal">
                <circle className="nm-goal-halo" cx={c.x} cy={c.y} r={r + 15} />
                {/* 名前も、どういう人かも書かない。相手はこの企画に応募していない
                    実在の人なので、伏せたままで成立する形にしてある
                    （docs/nordic-fund.md 1章）。名前を出していいと分かったら、
                    この一行を差し替えるだけで済む。 */}
                {/* 札は下に出す。上はヘルシンキからのフェリーの線が通っている。 */}
                <g className="nm-chip is-goal" transform={`translate(${c.x - 24} ${c.y + r + 52})`}>
                  <rect x="-172" y="-25" width="344" height="50" rx="25" />
                  <text x="0" y="9" textAnchor="middle">
                    ここに、会いたい人がいる
                  </text>
                </g>
              </g>
            )}
            {/* いる場所が分かるのは画面が出たあとのこともあるので、
                札は全部の街に置いて、出すかどうかは CSS に任せる。 */}
            <g className="nm-here">
              <circle cx={c.x} cy={c.y} r={r + 14} fill="none">
                <animate attributeName="r" values={`${r + 6};${r + 32}`} dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.95;0" dur="2s" repeatCount="indefinite" />
              </circle>
              <g className="nm-chip is-here" transform={`translate(${c.x} ${c.y - r - 46})`}>
                <rect x="-80" y="-25" width="160" height="50" rx="25" />
                <text x="0" y="9" textAnchor="middle">
                  いま ここ
                </text>
              </g>
            </g>
          </Link>
        );
      })}

      {/* ---- 方位 -------------------------------------------------- */}
      {/* 正角円錐なので真北は場所で傾く。傾きも焼き込んである。 */}
      <g className="nm-compass" transform={`translate(${north.x} ${north.y})`}>
        <circle className="nm-compass-disc" r="44" />
        <g transform={`rotate(${north.deg})`}>
          <path className="nm-compass-n" d="M0 -34L11 6L0 -3L-11 6Z" />
          <path className="nm-compass-s" d="M0 34L11 6L0 -3L-11 6Z" />
        </g>
        <text className="nm-compass-t" x="0" y="-44" textAnchor="middle">
          N
        </text>
      </g>

      {/* ---- 縮尺。km は投影から計算して焼いてある ------------------ */}
      <g className="nm-scale" transform={`translate(${scale.x} ${scale.y})`}>
        <path className="nm-scale-bar" d={`M0 0h${scale.len}`} />
        <path
          className="nm-scale-tick"
          d={`M0 -9v18M${scale.len} -9v18M${scale.len / 2} -6v12`}
        />
        <text className="nm-scale-t" x={scale.len / 2} y="-18" textAnchor="middle">
          {scale.km}km
        </text>
      </g>
    </svg>
  );
}
