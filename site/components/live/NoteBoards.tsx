"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadState } from "@/lib/liveStats";
import { type Idea, type NextNote } from "@/lib/api";
import { PLANS, type Plan } from "@/content/plans";
import { NORDIC_COUNTRIES } from "@/content/nordic";
import Icon from "@/components/ui/IconCore";
import { Pin } from "./art";

/**
 * 島じゅうに散らばった付箋を、貼り先ごとに1か所で読む。
 *
 * ## なぜ要るか
 *
 * 視聴者さんが字を書ける場所は、いま島に9か所ある。
 * `/next` の企画ごとの付箋（企画の数だけ増える）、`/board` の掲示板、
 * `/nordic` の「この旅に言う」、`/nordic/[国]` の6カ国。
 * **書いたものは、書いた場所にしか出ない。** だから貼った本人も、
 * 読むあやとも、いま何が来ているのかを一望できない。
 * 「散らばりすぎてて、一括で見ることができない」（オーナー）。
 *
 * ## カテゴリーを「貼り先」にした理由
 *
 * 分けかたの候補は、配信の型・旅の章・企画の状態などいくつかあったが、
 * どれも**書かれた字を推測で仕分ける**ことになる。外れたとき、
 * 人の書いた1行が関係の無い棚に入る。それはやらない。
 *
 * 付箋は必ず「何に貼られたか」を持っている。企画の付箋は `planId` を、
 * 国あての提案は本文の頭の `【国名】` を持っていて、**どちらも推測が要らない。**
 * だからカテゴリーは貼り先にする。棚の名前も、貼られた場所の名前そのままにする。
 *
 * ## 並べる順
 *
 * 枚数の多い順にはしない（`docs/island-play.md` の「順位表を作らない」）。
 * 企画は日付順、国は旅で通る順。**中身が増えても棚の順は動かない。**
 */

/** 本文の頭に付く貼り先の札。`components/nordic/CountryIdeas.tsx` が付けている。 */
const TAG = /^【([^】]{1,20})】/;

/** 画びょうの色。並べたときに同じ色が続かないよう、4色を順に回す */
const PINS = ["#e8879a", "#5fbde0", "#8dd06a", "#f2b53d"];

/** 1つの棚に出す枚数の上限。ここを越えたぶんは、貼ってある場所へ送る。 */
const SHOW = 24;

/** 棚に並ぶ1枚。付箋も国あての提案も、読むときは同じ形でよい。 */
type Sticky = { id: string; text: string; by?: string };

type Shelf = {
  key: string;
  /** 棚の名前。貼られた場所の名前そのまま */
  name: string;
  /** 棚の束ねかた。札の上に小さく出す */
  group: string;
  /** 貼ってある場所。押すとそこへ行けて、そこで続きが書ける */
  href?: string;
  items: Sticky[];
};

const byDate = (a: Plan, b: Plan) => (a.date ?? "9999").localeCompare(b.date ?? "9999");

/** 国の札から、その国の紙へ。表に無い札は行き先を持たない。 */
const NORDIC_HREF = new Map(NORDIC_COUNTRIES.map((c) => [c.name, `/nordic/${c.slug}`]));

/** 札の並び順。旅で通る順に固定する。枚数では動かさない。 */
const TAG_ORDER = ["北欧旅", ...NORDIC_COUNTRIES.map((c) => c.name)];

/**
 * 付箋と提案を、貼り先ごとの棚に分ける。
 *
 * 中身が1枚も無い棚は作らない。空の棚が並ぶと、
 * 「まだありません」だけが延々続く面になる。
 */
function shelves(notes: NextNote[], ideas: Idea[]): Shelf[] {
  const out: Shelf[] = [];

  /* 1. これからの企画。`/next` の付箋（islandNotes）。日付の早い順。 */
  const plans = [...PLANS].sort(byDate);
  for (const p of plans) {
    const items = notes
      .filter((n) => n.planId === p.id)
      .map((n) => ({ id: n.id, text: n.text }));
    if (items.length) {
      out.push({
        key: `plan:${p.id}`,
        name: p.title,
        group: "これからの企画",
        href: `/next#${p.id}-notes`,
        items,
      });
    }
  }

  /* 2. 企画の表から消えたもの。終わった企画を `content/plans.ts` から外すと、
        付箋だけが残って、どこからも読めなくなる。拾って最後に置く。 */
  const known = new Set(PLANS.map((p) => p.id));
  const lost = new Map<string, Sticky[]>();
  for (const n of notes) {
    if (known.has(n.planId)) continue;
    const list = lost.get(n.planId) ?? [];
    list.push({ id: n.id, text: n.text });
    lost.set(n.planId, list);
  }

  /* 3. 国あての提案（islandIdeas の【札】付き）。旅で通る順。 */
  const tagged = new Map<string, Sticky[]>();
  for (const i of ideas) {
    const m = TAG.exec(i.text);
    if (!m) continue;
    const list = tagged.get(m[1]) ?? [];
    list.push({ id: i.id, text: i.text.slice(m[0].length).trim(), by: i.name });
    tagged.set(m[1], list);
  }
  const tags = [...tagged.keys()].sort((a, b) => {
    const ia = TAG_ORDER.indexOf(a);
    const ib = TAG_ORDER.indexOf(b);
    // 表に無い札（あとから増えた貼り先）は、うしろに名前順で置く
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  for (const t of tags) {
    out.push({
      key: `tag:${t}`,
      name: t,
      group: "北欧の旅",
      href: NORDIC_HREF.get(t) ?? (t === "北欧旅" ? "/nordic#say" : undefined),
      items: tagged.get(t)!,
    });
  }

  for (const [planId, items] of lost) {
    out.push({ key: `gone:${planId}`, name: "終わった企画", group: "そのほか", items });
  }

  return out;
}

/**
 * 貼り先ごとの付箋のボード。
 *
 * `ideas` は掲示板がすでに読んでいるものをそのまま受ける。
 * 付箋（`islandNotes`）だけは `/state` にしか無いので、
 * 島じゅうで使い回している読み込み（`lib/liveStats.tsx`）に相乗りする。
 */
export default function NoteBoards({ ideas }: { ideas: Idea[] | null }) {
  const [notes, setNotes] = useState<NextNote[] | null>(null);
  /** 読めなかったか。空っぽと読めなかったを、同じ顔で出さない */
  const [down, setDown] = useState(false);
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    loadState().then((s) => {
      if (s) setNotes(s.notes ?? []);
      else {
        setNotes([]);
        setDown(true);
      }
    });
  }, []);

  const list = useMemo(() => shelves(notes ?? [], ideas ?? []), [notes, ideas]);

  // 読み込みが終わったあとで棚が増えることがあるので、選び直しはここで受ける
  const now = list.find((s) => s.key === pick) ?? list[0];

  if (notes === null || ideas === null) {
    return (
      <section className="panel paper">
        <h2>どこに、どんな意見が来てるか</h2>
        {/* 出てくる付箋と同じ形の灰色。「読み込み中…」の字だけにしない */}
        <ul className="nx-notes is-wait" aria-hidden>
          <li />
          <li />
          <li />
        </ul>
      </section>
    );
  }

  return (
    <section className="panel paper">
      <h2>どこに、どんな意見が来てるか</h2>
      <p className="muted">
        付箋は島のあちこちに貼られています。貼られた場所ごとに、ここでまとめて読めます。
        この板に貼られた企画だけは、すぐ下に並んでいます。
      </p>

      {down && !list.length && (
        <div className="blank is-off">
          <b>いま、付箋を読みに行けなかった</b>
          <p>貼ってある日でも、こういうときは出てきません。少し待って、もう一度。</p>
        </div>
      )}

      {!down && !list.length && (
        <div className="blank">
          <b>まだ、どこにも貼られていません</b>
          <p>これからの企画に1枚貼ると、貼った場所の名前でここに棚ができます。</p>
          <Link className="blank-go" href="/next">
            これからの企画へ
            <Icon name="right" size={14} />
          </Link>
        </div>
      )}

      {!!list.length && now && (
        <>
          {/* 棚の選び札。束ねかたごとに1行にする。
              厚みは1枚ずつ付ける。3.5 の「厚みを付けなくてよい」例外は
              一面ぜんぶが押せるマスの並びのときだけで、ここは紙の面の途中にある
              （`docs/island-world.md` 3.5）。 */}
          {[...new Set(list.map((s) => s.group))].map((g) => (
            <div className="nb-group" key={g}>
              <span className="nb-glabel">{g}</span>
              <div className="nb-tabs">
                {list
                  .filter((s) => s.group === g)
                  .map((s) => (
                    <button
                      key={s.key}
                      className={`nb-tab${s.key === now.key ? " is-on" : ""}`}
                      aria-pressed={s.key === now.key}
                      onClick={() => setPick(s.key)}
                    >
                      <b>{s.name}</b>
                      <i>{s.items.length}</i>
                    </button>
                  ))}
              </div>
            </div>
          ))}

          <div className="nb-board">
            <div className="nb-head">
              <h3 className="sub">{now.name}</h3>
              <span className="bd-count">
                <b>{now.items.length}</b>枚
              </span>
              {now.href && (
                <Link className="nb-go" href={now.href} prefetch={false}>
                  貼ってある場所へ
                  <Icon name="right" size={13} />
                </Link>
              )}
            </div>
            <ul className="nx-notes">
              {now.items.slice(0, SHOW).map((n, i) => (
                <li key={n.id}>
                  <span className="nx-pin">
                    <Pin tone={PINS[i % PINS.length]} size={19} />
                  </span>
                  {n.text}
                  {n.by && <em className="nb-by">{n.by} さん</em>}
                </li>
              ))}
            </ul>
            {now.items.length > SHOW && (
              <p className="nb-more">
                新しいものから{SHOW}枚まで出しています。
                {now.href && (
                  <Link href={now.href} prefetch={false}>
                    貼ってある場所で、ぜんぶ読めます
                  </Link>
                )}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
