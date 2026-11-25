import type { ReactNode } from "react";

import Icon, { type IconName } from "@/components/ui/Icon";
import type { Fact, Flags, Local, Mark, Pic, Src } from "@/content/guidebook/types";

/**
 * ガイドブックの面の、小さな部品（どの節でも使うもの）。**サーバで描き切る**（`Icon` を名前で引くので、
 * `"use client"` の部品から読まない。`docs/country-guide.md` 8章）。
 */

/** 窓の id。**節ごとに頭の字を決める**（`#do-<id>` が URL のハッシュになる） */
export const sheetId = (sec: "do" | "see" | "eat" | "buy" | "area" | "guide" | "dish" | "word" | "sight", id: string) => `${sec}-${id}`;

/** 星の言葉（1＝必見）。`rank` の数だけ★を塗るのではない（`docs/country-guide.md` 8章） */
export const STAR = ["", "必見", "行けたら", "余裕があれば"] as const;

/**
 * 節ひとつ。番号・絵・問いの見出し（h2）・答えの1行。**節の終わりに「目次へ」**（追従する板を重ねない）
 */
export function Sec({
  id,
  n,
  icon,
  title,
  lead,
  children,
}: {
  id: string;
  n: number;
  icon: IconName;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section className="gb-sec" id={id} data-gb={id} aria-labelledby={`${id}-h`}>
      {/* `data-icon` は見張りの目印（やりたいこと＝チェック・見たいもの＝カメラ。`tools/sprites/guidebook.mjs`） */}
      <header className="gb-sec-head" data-icon={icon}>
        <span className="gb-sec-n" aria-hidden="true">
          {String(n).padStart(2, "0")}
        </span>
        <Icon name={icon} size={30} className="gb-sec-i" />
        <h2 id={`${id}-h`}>{title}</h2>
      </header>
      {lead && <p className="gb-sec-lead">{lead}</p>}
      {children}
      <p className="gb-up">
        <a href="#toc">
          <Icon name="up" size={14} />
          目次へ
        </a>
      </p>
    </section>
  );
}

/**
 * 絵1枚。絵が無ければ、色の地の札だけ置く（**壊れた絵の枠を出さない**・穴を見せない）。
 *
 * **イラストに「イラスト」の札を乗せない**（あやと 2026-11-16「イラストのチップ要らない」・`docs/island-misses.md` #328）。
 * AI で描いた絵であることは、面の終わりの出どころの欄に1行（`Sources.tsx`）と、読み上げの名前（`alt` の頭の「イラスト：」）で知らせる
 */
export function Picture({
  pic,
  sizes,
  eager,
  ratio = "4 / 3",
  className = "",
  label,
}: {
  pic?: Pic;
  sizes: string;
  eager?: boolean;
  /** 縦横の比。`null` なら決めない（入れ物の側の CSS が大きさを決める。やりたいことの大小の札） */
  ratio?: string | null;
  className?: string;
  /** 絵の無いときに地に出す字（名前の頭など）。読み上げには出さない */
  label?: string;
}) {
  if (!pic) {
    return (
      <span className={`gb-pic is-none ${className}`} style={ratio ? { aspectRatio: ratio } : undefined} aria-hidden="true">
        {label && <b>{label}</b>}
      </span>
    );
  }
  const set = pic.small && pic.small !== pic.src ? `${pic.small} 500w, ${pic.src} 960w` : undefined;
  return (
    <span className={`gb-pic ${className}`} style={ratio ? { aspectRatio: ratio } : undefined}>
      <img
        src={pic.src}
        srcSet={set}
        sizes={set ? sizes : undefined}
        width={pic.w}
        height={pic.h}
        alt={pic.kind === "illust" && pic.alt && !pic.alt.startsWith("イラスト") ? `イラスト：${pic.alt}` : pic.alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
    </span>
  );
}

/**
 * 絵の出どころ。**借りた写真は必ず出す**（撮った人の字が元のページへ）。イラストは出さない（出どころの欄に1行。`Picture` と同じ理由）。
 * 名前に何の写真かを入れる——同じ写真家が何枚も撮っているので、字だけを名前にすると
 * 「おなじ字のリンクが別の先を指す」になる（`reachkeys`）。
 */
export function Credit({ pic, of }: { pic?: Pic; of: string }) {
  if (!pic) return null;
  if (pic.kind === "illust") return null;
  if (pic.kind === "card") return <p className="gb-credit">あやと撮影{pic.date ? `・${jpDate(pic.date)}` : ""}</p>;
  if (!pic.credit) return null;
  return (
    <p className="gb-credit">
      <a href={pic.credit.page} target="_blank" rel="noreferrer" aria-label={`${of}の写真の出どころ（${pic.credit.by}）`}>
        {pic.credit.by}
      </a>
      ／{pic.credit.lic}
    </p>
  );
}

/** 現地のつづり。`lang` を付ける（読み上げが現地の読みになる） */
export function LocalName({ l, full }: { l?: Local; full?: boolean }) {
  if (!l) return null;
  return (
    <span className="gb-local">
      <span lang={l.lang}>{l.text}</span>
      {full && (l.roman || l.kana) && <i>{[l.roman, l.kana].filter(Boolean).join("／")}</i>}
    </span>
  );
}

/**
 * 豚肉あり・アルコールあり。**好みの印ではなく、事実の印**（#1228）。選ぶのは読む人。
 *
 * **窓の中だけで使う。** 札と一覧には出さない（あやと 2026-11-16「豚・酒も私の好みに偏ってて微妙。詳細モーダルで酒とかは
 * 出せば良い」・`docs/island-misses.md` #328）。札に出す印は `Marks`。
 *
 * 字の札（「豚」「酒」）にしたのは、日本語で読む人にいちばん速く通じるから。絵だと
 * 「肉」と「豚」の違いが出ない。読み上げには長い名前で渡す。
 */
export function FlagMarks({ f, big }: { f?: Flags; big?: boolean }) {
  if (!f?.pork && !f?.alcohol && !f?.beef) return null;
  return (
    <span className={`gb-flags${big ? " is-big" : ""}`}>
      {f.pork && (
        <span className="gb-flag is-pork" title="豚肉あり">
          <b aria-hidden="true">豚</b>
          <span className="sr-only">豚肉あり</span>
          {big && <i>豚肉あり</i>}
        </span>
      )}
      {f.alcohol && (
        <span className="gb-flag is-alcohol" title="アルコールあり">
          <b aria-hidden="true">酒</b>
          <span className="sr-only">アルコールあり</span>
          {big && <i>アルコールあり</i>}
        </span>
      )}
      {/* 牛肉（企画の面のインド。ケーララのビーフ・フライ）。豚と同じく事実の印で、窓の中だけ（#1404 企画書7章） */}
      {f.beef && (
        <span className="gb-flag is-beef" title="牛肉あり">
          <b aria-hidden="true">牛</b>
          <span className="sr-only">牛肉あり</span>
          {big && <i>牛肉あり</i>}
        </span>
      )}
    </span>
  );
}

/**
 * 札の上の印（`Mark`）。**その国ならでは・値段・季節の3種類だけ**（#328）。`data-mark` は見張りの目印
 * （`tools/sprites/guidebook.mjs` が、札の上にこの3種類と「行った」以外の印が無いかを見る）
 */
export function Marks({ m, className = "" }: { m?: Mark[]; className?: string }) {
  if (!m?.length) return null;
  return (
    <span className={`gb-marks ${className}`}>
      {m.map((x) => (
        <span key={x.text} className={`gb-mark is-${x.kind}`} data-mark={x.kind}>
          {x.text}
        </span>
      ))}
    </span>
  );
}

/**
 * 事実の並び（窓の中）。`<dl>` で、見出し・字。
 *
 * **見出しに絵を付けない。** 窓は82枚あり、1行ずつ絵（1つ 1.5KB 前後の SVG）を置くと、
 * それだけで HTML と受け渡しの束に 1MB 余り乗った（2026-11-15 に数えた。面の HTML 3.0MB のうち SVG 522個・0.8MB）
 */
export function Facts({ rows }: { rows: Fact[] }) {
  if (!rows.length) return null;
  return (
    <dl className="gb-facts">
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>{r.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Google マップを開く札。道は**名前で検索した状態**のもの（`lib/mapsSearch.ts`。#1228 決めたこと4）をデータから渡す */
export function MapsLink({ href, of, label = "Google マップで開く" }: { href: string; of: string; label?: string }) {
  return (
    <a className="gb-maps" href={href} target="_blank" rel="noreferrer" aria-label={`${label}（${of}）`}>
      <Icon name="map" size={18} />
      <span>{label}</span>
    </a>
  );
}

/**
 * 窓の終わりの出どころ（その1件のぶんだけ）。面の終わりには全部の一覧がある。
 * 見た日（`Src.seen`）が在れば、いちばん新しい日を1つだけ添える（外の事実は「いつ見た字か」まで出す。`docs/country-guide.md` 1-2）
 * リンクの字は外の記事の題をそのまま引いたもの（「〜おすすめ10選」も他人の字）。`data-quote="src"` は見張り（`python/guide_watch.py`）への目印で、
 * 口調の見張りはこのリンクの字だけを飛ばす
 */
export function SrcLine({ src, of }: { src: Src[]; of: string }) {
  if (!src.length) return null;
  const seen = src.map((s) => s.seen ?? "").filter(Boolean).sort().at(-1);
  return (
    <p className="gb-src">
      <span>出どころ</span>
      {src.map((s, i) => (
        <a
          key={s.url}
          href={s.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`${of}の出どころ（${s.name}${src.length > 1 ? `・${i + 1}` : ""}）`}
          data-quote="src"
        >
          {s.name}
        </a>
      ))}
      {seen && (
        <i>
          <time dateTime={seen}>{jpDate(seen)}</time>に見た
        </i>
      )}
    </p>
  );
}

/**
 * 外の事実（骨組み）の入れ物。**出どころの行を中に持つ**。`data-src` は見張り（`python/guide_watch.py`）の目印で、
 * この中の額は出どころが正（配信の facts とは突き合わせない）。行った箱（`data-went`）をこの中に入れない
 */
export function Ext({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`gb-ext ${className}`} data-src="">
      {children}
    </div>
  );
}

/**
 * 描いた絵の幅を、ファイル名（`cover-tall-800.webp`）から読む。描く道具（`.claude/skills/chatgpt-image/guide_art.py`）が
 * `<名前>-<幅>.webp` で書き出す決まりなので、置き場（manifest）に小さい版の幅が無くても `srcset` の幅を正しく書ける。
 * 読めなければ `undefined`（呼ぶ側は大きい版だけにする）
 */
export function widthOf(url: string) {
  const m = url.match(/-(\d{2,4})\.(?:webp|jpe?g|png|avif)$/);
  return m ? Number(m[1]) : undefined;
}

/** 本文の日付（「2026年11月15日」） */
export function jpDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

/** 札に出す短い名前。**括弧の中は窓で読む**（札が3行に折れないように） */
export const shortName = (s: string) => s.replace(/（.*?）/g, "").trim();
