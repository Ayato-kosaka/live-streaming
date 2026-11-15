import Fold from "@/components/ui/Fold";
import Icon, { type IconName } from "@/components/ui/Icon";
import { CITY_STREAMS } from "@/content/cityStreams";
import type { Guidebook, Went } from "@/content/guidebook/types";
import { SHORTS, type Short, shortHref } from "@/content/shorts";
import { LINKS } from "@/content/site";
import { JsonLd, videoLd } from "@/lib/jsonld";

import ShortPlayer from "./ShortPlayer";
import { Sec, jpDate } from "./parts";

/**
 * **動画の欄。** 導線は「検索 → ブログ → ショート → アーカイブ → ライブ」（あやと #1228・2026-11-15）。
 *
 * - 行った所の札（窓の中）: ① ショート（縦の枠・押すまでサムネイル）→ ② 配信アーカイブの時刻つきの場面
 * - 面のいちばん下「この街の動画」: ショートの横並び → アーカイブの一覧 → 「配信を見に来る」（チャンネル）
 *
 * 埋めたショートには `VideoObject` の構造化データを付ける（`lib/jsonld.tsx` の `videoLd`）。**埋めていない動画は名乗らない。**
 */

const ALL_SHORTS: Map<string, Short> = new Map(Object.values(SHORTS).flatMap((xs) => xs.map((s) => [s.id, s])));

/** ショート1本。**名簿に無い id は書き出しを止める**（題も日付も無い枠を出さない） */
export function shortOf(id: string): Short {
  const s = ALL_SHORTS.get(id);
  if (!s) throw new Error(`components/guidebook/Videos.tsx: ショート ${id} が content/shorts.ts に無い`);
  return s;
}

/** この面に埋めるショート（街のぶん＋行った所のぶん。同じ id は1回） */
export function shortsIn(g: Guidebook): string[] {
  const went = [...g.todo, ...g.see.items, ...g.eat.items, ...g.buy.items].map((x) => x.went?.short).filter((x): x is string => !!x);
  return [...new Set([...g.videos.shorts, ...went])];
}

/** 面に埋めたショートの構造化データ。`<head>` ではなく本文に置いてよい（Google は場所を問わない） */
export function VideoLds({ g }: { g: Guidebook }) {
  return (
    <>
      {shortsIn(g).map((id) => {
        const s = shortOf(id);
        return <JsonLd key={id} data={videoLd({ id, name: s.title, uploadDate: s.date })} />;
      })}
    </>
  );
}

function Short1({ id }: { id: string }) {
  const s = shortOf(id);
  return (
    <figure className="gb-short">
      <ShortPlayer id={id} title={s.title} play={<Icon name="play" size={30} />} />
      <figcaption>
        {/* 実在する題名の引用（island-design 1章の例外。絵文字もそのまま）。`data-quote="title"` は見張りへの目印（案内鳥の字ではない） */}
        <a href={shortHref(id)} target="_blank" rel="noopener noreferrer" data-quote="title">
          {s.title}
        </a>
        <time dateTime={s.date}>{jpDate(s.date)}</time>
      </figcaption>
    </figure>
  );
}

const watch = (v: string, t?: number) => `https://www.youtube.com/watch?v=${v}${t ? `&t=${t}s` : ""}`;
const hms = (t: number) => {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/**
 * 行った所の窓の中の動画。① ショート → ② アーカイブの場面。ショートの無い所は ② だけ。
 *
 * 本人の一言（`say`）は ② の札の中に置く——**押せば、その場面で本人がそう言っている**のが証拠だから
 * （前のハブの吹き出しと同じ。`python/guide_watch.py` が、一言が場面のリンクの中に在り、秒が facts と同じかを見る）
 */
export function WentVideo({ w, of }: { w: Went; of: string }) {
  if (!w.short && !w.scene) return null;
  return (
    <div className="gb-went-video">
      {w.short && <Short1 id={w.short} />}
      {w.scene && (
        <a
          className={`gb-scene${w.say ? " has-say" : ""}`}
          href={watch(w.scene.v, w.scene.t)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${w.say ? `「${w.say}」` : ""}配信のこの場面（${of}）`}
        >
          {w.say && (
            <span className="gb-say">
              「<span data-quote="ayato">{w.say}</span>」
            </span>
          )}
          <span className="gb-scene-b">
            <Icon name="youtube" size={22} />
            <span>
              配信のこの場面
              <i>
                <time dateTime={w.scene.date}>{jpDate(w.scene.date)}</time>・{hms(w.scene.t)} から
              </i>
            </span>
          </span>
        </a>
      )}
    </div>
  );
}

/**
 * 行った箱（肉付け）。「行った」と日付 → 短い話 → ① ショート → ② 場面（一言つき）。
 * **場面のリンクは箱に1つ**（`docs/island-misses.md` #323）。`data-went` は見張りの目印で、この中の額は facts の行と突き合わせる
 */
export function WentBox({ w, of, label = "行った" }: { w: Went; of: string; label?: string }) {
  return (
    <div className="gb-went-box" data-went="">
      <p className="gb-went-head">
        <span className="gb-went">{label}</span>
        <time dateTime={w.date}>{jpDate(w.date)}</time>
      </p>
      {w.story?.map((t, i) => (
        <p key={i} className="gb-went-t">
          {t}
        </p>
      ))}
      <WentVideo w={w} of={of} />
    </div>
  );
}

/** 窓で引いた場面の数（配信ごと）。アーカイブの一覧で、よく引いた回を先に出す */
function citedOf(g: Guidebook): Map<string, number> {
  const out = new Map<string, number>();
  const add = (w?: Went) => w?.scene && out.set(w.scene.v, (out.get(w.scene.v) ?? 0) + 1);
  [...g.todo, ...g.about.areas, ...g.see.items, ...g.eat.items, ...g.buy.items, ...g.basics.guides].forEach((x) => add(x.went));
  return out;
}

/** アーカイブの一覧で、畳まずに見せる本数（全部並べると、それだけで2画面になる） */
const STREAMS_OPEN = 5;

/** 面のいちばん下「この街の動画」。記事（物価など）があれば、配信の前に札で繋ぐ */
export default function Videos({
  g,
  n,
  articles = [],
}: {
  g: Guidebook;
  n: number;
  articles?: { href: string; title: string; note: string; icon: IconName }[];
}) {
  const shorts = shortsIn(g);
  const all = g.videos.streams ? (CITY_STREAMS[g.videos.streams.country]?.[g.videos.streams.city] ?? []) : [];
  /* 行ったあと: その街に居たあいだの回だけ（次の国へ着いた日の回は、次の国の話） */
  const stay = g.stay;
  const streams = stay ? all.filter((s) => s.date >= stay.from && s.date < stay.to) : all;
  const cited = citedOf(g);
  const sorted = [...streams].sort((a, b) => (cited.get(b.videoId) ?? 0) - (cited.get(a.videoId) ?? 0) || b.date.localeCompare(a.date));
  /* よく引いた回を選び、並べるのは日の順（読む人は旅の順に追う） */
  const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);
  const top = sorted.slice(0, STREAMS_OPEN).sort(byDate);
  const rest = sorted.slice(STREAMS_OPEN).sort(byDate);
  const channel = LINKS.find((l) => l.id === "youtube");
  if (!channel) throw new Error("components/guidebook/Videos.tsx: content/site.ts の LINKS に youtube が無い");
  return (
    <Sec id="videos" n={n} icon="youtube" title={`${g.name}の動画`}>
      {shorts.length > 0 && (
        <>
          <h3 className="gb-sub">ショート</h3>
          <div className="gb-shorts">
            {shorts.map((id) => (
              <Short1 key={id} id={id} />
            ))}
          </div>
        </>
      )}
      {streams.length > 0 && (
        <>
          <h3 className="gb-sub">配信のアーカイブ</h3>
          <StreamList rows={top} />
          {rest.length > 0 && (
            <Fold title={`ほかの配信${rest.length}本`}>
              <StreamList rows={rest} />
            </Fold>
          )}
        </>
      )}
      <a className="gb-live" href={channel.href} target="_blank" rel="noopener noreferrer">
        <Icon name="youtube" size={26} />
        <span>
          配信を見に来る
          <i>毎晩22時から、旅先から生配信</i>
        </span>
        <Icon name="external" size={14} />
      </a>
      {articles.length > 0 && (
        <>
          <h3 className="gb-sub">{g.name}の記事</h3>
          <ul className="gb-articles">
            {articles.map((a) => (
              <li key={a.href}>
                <a href={a.href}>
                  <Icon name={a.icon} size={26} />
                  <span>
                    <b>{a.title}</b>
                    <i>{a.note}</i>
                  </span>
                  <Icon name="right" size={16} />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sec>
  );
}

function StreamList({ rows }: { rows: { videoId: string; title: string; date: string }[] }) {
  return (
    <ul className="gb-streams">
      {rows.map((s) => (
        <li key={s.videoId}>
          <a href={watch(s.videoId)} target="_blank" rel="noopener noreferrer">
            <img src={`https://i.ytimg.com/vi/${s.videoId}/mqdefault.jpg`} alt="" width={320} height={180} loading="lazy" decoding="async" />
            <span>
              {/* 実在する題名の引用（絵文字もそのまま） */}
              <b data-quote="title">{s.title}</b>
              <time dateTime={s.date}>{jpDate(s.date)}</time>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
