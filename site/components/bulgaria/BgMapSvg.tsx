import MAP from "@/content/bulgaria/map.json";

/**
 * ソフィアの地図。**節ごとに1枚、その節の場所だけ**を載せる。
 *
 * ## なぜ節ごとなのか（2026-11-13・あやと）
 *
 * > ブルガリアのページに見たいもの、食べたいもの、買いたいもののところに
 * > マップを入れてほしくて、どこにあるのか分かるようにしてほしいです。
 * > でマップは今アルクコースのところにあると思うんですけど、そのマップが
 * > 日本語じゃなくて見にくいので、日本語のマップに変えてほしいです。
 *
 * 直したのは2つ。
 *
 * | | |
 * | --- | --- |
 * | **節ごとに割る** | 1枚に全部載せると印が潰れる。割れば載る数が減って、**縮尺を上げられる** |
 * | **札を日本語で描く** | OSM のタイルに焼かれた字はブルガリア語。**上に重ねる札はこちらが描ける** |
 *
 * 記号だけ（A〜P）だった版は、名前が地図の外の一覧にしかなかった。
 * 現地で見る人は、地図と一覧を目で往復することになる。**地図の上で読めるようにした。**
 *
 * ## 札が重ならないことは、焼くほうが保証している
 *
 * 置き場所は `python/build_bulgaria.py` の `place_labels()` が、
 * **地図の目盛り（viewBox）の上で**総当たりして決める。SVG はまるごと同じ倍率で
 * 縮むので、**目盛りの上で重なっていなければ、どの画面幅でも重ならない。**
 * 1枚でも置けなければ焼かずに落ちる——札の無いピンは、現地で見ても何なのか
 * 分からないので、出す意味がない。
 *
 * ## 地の絵は3枚で1つ
 *
 * 切り抜く枠（`x` `y` `w` `h`）だけを変えて、`city.png` は共有する。
 * 絵を3枚焼くと、読む人が3枚ぶん払う。`<img>` のまま置いてあるので、
 * 画面の細かさに応じて `srcSet` が 1x / 2x を選ぶ（SVG の `<image>` にすると選べない）。
 *
 * 座標は焼くほうが web-mercator で出している。**ここで出し直さない。必ずズレる**
 * （`components/macedonia/NmMapSvg.tsx` と同じ決まり）。
 */

type Which = "see" | "eat" | "buy";

type Pin = {
  id: string;
  /** 丸の中の字。見どころは A〜P、店・市場は番号 */
  letter: string;
  name: string;
  /** 地図の上に出す日本語の札 */
  label: string;
  /** 札に描く字。**記号を頭に付ける**——丸が近いと、どの札がどの丸のものか決まらない */
  text: string;
  mark: string;
  star: number;
  x: number;
  y: number;
  /** 札の箱（左上・大きさ）と中心。焼くほうが重ならない場所を決めてある */
  lx: number;
  ly: number;
  lw: number;
  lh: number;
  lcx: number;
  lcy: number;
  /** 離して置いた札。ピンとのあいだに線を引く */
  lead: boolean;
};

type SecMap = {
  x: number;
  y: number;
  w: number;
  h: number;
  font: number;
  r: number;
  pins: Pin[];
  far: { name: string; km: number; maps: string }[];
};

const ART = MAP.art as {
  png: string;
  png2x: string;
  w: number;
  h: number;
  credit: string;
  licence: string;
};
const MAPS = MAP.maps as unknown as Record<Which, SecMap>;

/** 読み上げ用の1行。**地図の中身をそのまま言う**——絵だけ置いて黙らない */
const LEAD: Record<Which, string> = {
  see: "ソフィア中心部の見どころの位置",
  eat: "食べたいものが買える店と市場の位置",
  buy: "買いたいものが手に入る市場の位置",
};

export default function BgMapSvg({
  which,
  showFar = true,
}: {
  which: Which;
  /** 絵に入らないものを、この下に並べるか。
      食べもの・買いものは**下の店の一覧**が同じものを説明つきで出すので、二度書かない */
  showFar?: boolean;
}) {
  const m = MAPS[which];
  const say = `${LEAD[which]}。${m.pins.map((p) => `${p.letter} ${p.label}`).join("、")}。`;
  return (
    <figure className="bgmap">
      <div className="bgmap-box" style={{ aspectRatio: `${m.w} / ${m.h}` }}>
        <img
          className="bgmap-art"
          src={ART.png}
          srcSet={`${ART.png} 1x, ${ART.png2x} 2x`}
          width={ART.w}
          height={ART.h}
          /* 地の絵そのものは飾り。**意味は上に重ねた札が持っている**ので、
             ここで二重に言わない（読み上げが2回同じことを言う） */
          alt=""
          aria-hidden="true"
          style={{
            width: `${(ART.w / m.w) * 100}%`,
            left: `${(-m.x / m.w) * 100}%`,
            top: `${(-m.y / m.h) * 100}%`,
          }}
          loading="lazy"
          decoding="async"
        />
        <svg viewBox={`${m.x} ${m.y} ${m.w} ${m.h}`} role="img" aria-label={say}>
          {/* 離して置いた札へ引く線。**いちばん下に敷く** */}
          {m.pins.filter((p) => p.lead).map((p) => (
            <line key={`l${p.id}`} className="bgm-lead"
              x1={p.x} y1={p.y} x2={p.lcx} y2={p.lcy} strokeWidth={m.font * 0.14} />
          ))}
          {m.pins.map((p) => (
            <g key={`p${p.id}`} className={`bgm-pin is-${p.mark}`}>
              <circle cx={p.x} cy={p.y} r={m.r} strokeWidth={m.r * 0.16} />
              <text x={p.x} y={p.y + m.r * 0.34} textAnchor="middle" fontSize={m.r * 0.95}>
                {p.letter}
              </text>
            </g>
          ))}
          {/* 日本語の札。**地の絵の字（ブルガリア語）の上に、白い板ごと置く** */}
          {m.pins.map((p) => (
            <g key={`t${p.id}`} className={`bgm-tag is-${p.mark}`}>
              <rect x={p.lx} y={p.ly} width={p.lw} height={p.lh} rx={p.lh / 2}
                strokeWidth={m.font * 0.1} />
              <text x={p.lcx} y={p.ly + p.lh / 2 + m.font * 0.36}
                textAnchor="middle" fontSize={m.font}>
                {p.text}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <figcaption>
        <a href={ART.licence} target="_blank" rel="noreferrer">
          {ART.credit}
        </a>
      </figcaption>
      {showFar && m.far.length > 0 && (
        /* **この絵に入らないもの。** 字の塊にすると読み飛ばされるので、
            名前と距離の組を1つずつの札にする。押せば本物の Google マップが開く */
        <ul className="bgfar">
          {m.far.map((f) => (
            <li key={f.name}>
              <b>{f.name}</b>
              <i>中心から {f.km}km</i>
              <a href={f.maps} target="_blank" rel="noreferrer"
                aria-label={`Google マップで開く（${f.name}）`}>
                マップ
              </a>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
