"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadState } from "@/lib/liveStats";
import { type Idea, type NextNote } from "@/lib/api";
import Icon from "@/components/ui/IconCore";
import { Pin } from "./art";

/**
 * 島じゅうに散らばった付箋を、貼り先ごとに1か所で読む。
 *
 * ## なぜ要るか
 *
 * 視聴者さんが字を書ける場所は、いま島に9か所ある。
 * `/next` の企画ごとの付箋（企画が増えれば増える）、`/board` の掲示板、
 * `/nordic` の「この旅に、言う」、`/nordic/[国]` の6カ国、`/next/new` の下書き。
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
 * ## 棚の並び
 *
 * 枚数の多い順にはしない（`docs/island-play.md` の「順位表を作らない」）。
 * 順番も名前も、面の側（`app/board/page.tsx` の `NOTE_PLACES`）が決めて渡す。
 * **ここは仕分けるだけ。** そうしておくと、`content/nordic.ts` の 44KB を
 * ブラウザまで運ばずに済む（棚の名前と行き先しか要らない）。
 */

/** 本文の頭に付く貼り先の札。`components/nordic/CountryIdeas.tsx` が付けている。 */
const TAG = /^【([^】]{1,20})】/;

/** 画びょうの色。並べたときに同じ色が続かないよう、4色を順に回す */
const PINS = ["#e8879a", "#5fbde0", "#8dd06a", "#f2b53d"];

/** 1つの棚に出す枚数の上限。ここを越えたぶんは、貼ってある場所へ送る。 */
const SHOW = 24;

/** 貼り先ひとつ。棚の名前と行き先は、面の側が決める。 */
export type NotePlace = {
  /** 見分ける鍵。`plan` なら付箋の `planId`、`tag` なら【札】の中の字 */
  key: string;
  /** 棚の名前 */
  name: string;
  /** 棚の束ねかた。札の上に小さく出す */
  group: string;
  /** 貼ってある場所。押すとそこへ行けて、そこで続きが書ける */
  href?: string;
  /** どちらの入れ物から拾うか */
  by: "plan" | "tag";
};

/** 棚に並ぶ1枚。付箋も国あての提案も、読むときは同じ形でよい。 */
type Sticky = { id: string; text: string; by?: string };

type Shelf = NotePlace & { items: Sticky[] };

/**
 * 付箋と提案を、貼り先ごとの棚に分ける。
 *
 * 中身が1枚も無い棚は作らない。空の棚が並ぶと、
 * 「まだありません」だけが延々続く面になる。
 */
function shelves(places: NotePlace[], notes: NextNote[], ideas: Idea[]): Shelf[] {
  const out: Shelf[] = [];

  /* 付箋（islandNotes）は planId で、提案（islandIdeas）は頭の【札】で仕分ける。
     先に全部を鍵ごとの山にしてから、渡された順に棚へ移す。 */
  const byPlan = new Map<string, Sticky[]>();
  for (const n of notes) {
    const list = byPlan.get(n.planId) ?? [];
    list.push({ id: n.id, text: n.text });
    byPlan.set(n.planId, list);
  }
  const byTag = new Map<string, Sticky[]>();
  for (const i of ideas) {
    const m = TAG.exec(i.text);
    if (!m) continue;
    const list = byTag.get(m[1]) ?? [];
    list.push({ id: i.id, text: i.text.slice(m[0].length).trim(), by: i.name });
    byTag.set(m[1], list);
  }

  for (const p of places) {
    const pile = p.by === "plan" ? byPlan : byTag;
    const items = pile.get(p.key);
    if (!items?.length) continue;
    out.push({ ...p, items });
    pile.delete(p.key);
  }

  /* 面の側が知らない貼り先。終わった企画を `content/plans.ts` から外すと
     付箋だけが残るし、`【札】` はあとから増やせる。
     **拾わないと、書いた人の1行がどこからも読めなくなる。** */
  for (const [key, items] of byPlan) {
    out.push({ key, name: "終わった企画", group: "そのほか", by: "plan", items });
  }
  for (const [key, items] of byTag) {
    out.push({ key, name: key, group: "そのほか", by: "tag", items });
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
export default function NoteBoards({
  places,
  ideas,
}: {
  places: NotePlace[];
  /** 取りに行っている最中は null。0件と区別する */
  ideas: Idea[] | null;
}) {
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

  const list = useMemo(
    () => shelves(places, notes ?? [], ideas ?? []),
    [places, notes, ideas],
  );

  /* 取りに行っているあいだは、出てくる付箋と同じ形の灰色を置く。
     「読み込み中…」の字だけだと、何も無いのか取りに行っているのか分からない
     （`docs/island-world.md` 4.1）。 */
  if (notes === null || ideas === null) {
    return (
      <section className="panel paper">
        <h2>どこに、どんな意見が来てるか</h2>
        <ul className="nx-notes is-wait" aria-hidden>
          <li />
          <li />
          <li />
        </ul>
      </section>
    );
  }

  // 読み込みの順で棚が増えるので、選び直しは毎回ここで受け直す
  const now = list.find((s) => s.key === pick) ?? list[0];

  return (
    <section className="panel paper">
      <h2>どこに、どんな意見が来てるか</h2>
      <p className="muted">
        付箋は島のあちこちに貼られています。貼られた場所ごとに、ここでまとめて読めます。
        この板に貼られた企画だけは、そのまま下に並んでいます。
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
          <p>これからの企画に1枚貼ると、貼った場所の名前で、ここに棚ができます。</p>
          <Link className="blank-go" href="/next">
            これからの企画へ
            <Icon name="right" size={14} />
          </Link>
        </div>
      )}

      {!!list.length && now && (
        <>
          {/* 棚の選び札。束ねかたごとに1行にする。
              厚みは1枚ずつ付ける。「付けなくてよい」例外が効くのは
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
