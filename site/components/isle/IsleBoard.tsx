"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { NotePlace } from "@/components/live/NoteBoards";
import { Pin } from "@/components/live/art";
import Icon from "@/components/ui/IconCore";
import { getIdeas, type Idea } from "@/lib/api";

/**
 * 島の板の中に出す掲示板。
 *
 * ## なぜ島の中で読むのか
 *
 * 北欧の島の「この旅の掲示板」は `/board` へ飛ばしていた。あそこは
 * **島じゅうの提案が全部**並ぶ面なので、北欧の島から押した人が、
 * 関係のない企画の付箋を先に読むことになっていた。
 * あやとの言葉:「北欧周遊島の掲示板には、北欧周遊関連だけ見れれば良い」。
 *
 * 建物を押しても島から出ないのが章の島の決まりなので（`IsleSheet.tsx`）、
 * 読むのも島の上の板の中でよい。北欧以外も見たい人のために、
 * 板の下に `/board` への1本を残してある（`spec.ts` の `more`）。
 *
 * ## 仕分けは `/board` と同じ
 *
 * 分けかたは**本文の頭に付く `【国名】` の札**（`NoteBoards.tsx` と同じ規則）。
 * 棚の名前と並びも、あちらと同じものを渡してもらう
 * （`components/isle/spec.ts` の `nordicShelves`）。新しい分けかたは作っていない。
 * 見た目も `NoteBoards` と同じ class をそのまま使うので、CSS も増えていない。
 *
 * ## `NoteBoards` をそのまま呼べなかった理由
 *
 * あちらは**知らない貼り先を拾って棚を足す。** 島じゅうの付箋を1か所で読む
 * 面ではそれが正しい（拾わないと、書いた人の1行がどこからも読めなくなる）。
 * ここでそれをやると、知らない `【札】` と、企画に貼られた付箋ぜんぶが
 * 「もう表に無い企画」の棚になって出てくる。**北欧だけ、が崩れる。**
 * 実際に試すと、渡していない「ドイツ」の棚と付箋の棚が並んだ。
 *
 * `NoteBoards` が「渡された棚だけ出す」を選べるようになれば、ここは消して
 * あちらを呼べる。あのファイルは担当が別なので、報告に回した。
 */

/**
 * 本文の頭に付く貼り先の札。前後の空白は食わせる（手で打ち直す人がいる）。
 * **同じ形を `components/live/NoteBoards.tsx` と `Board.tsx` も見ている。
 * 変えるときは3つとも。**
 */
const TAG = /^\s*【\s*([^】]{1,20}?)\s*】/;

/** 画びょうの色。並べたときに同じ色が続かないよう、4色を順に回す */
const PINS = ["#e8879a", "#5fbde0", "#8dd06a", "#f2b53d"];

/** 1つの棚に出す枚数の上限。ここを越えたぶんは、貼ってある場所へ送る */
const SHOW = 24;

type Sticky = { id: string; text: string; by?: string };
type Shelf = NotePlace & { items: Sticky[] };

/** 渡された棚に、札の合う提案だけを入れる。中身の無い棚は作らない */
function shelves(places: NotePlace[], ideas: Idea[]): Shelf[] {
  const byTag = new Map<string, Sticky[]>();
  for (const i of ideas) {
    const m = TAG.exec(i.text);
    if (!m) continue;
    const list = byTag.get(m[1]) ?? [];
    list.push({ id: i.id, text: i.text.slice(m[0].length).trim(), by: i.name });
    byTag.set(m[1], list);
  }
  const out: Shelf[] = [];
  for (const p of places) {
    const items = byTag.get(p.key);
    if (items?.length) out.push({ ...p, items });
  }
  return out;
}

export default function IsleBoard({ places }: { places: NotePlace[] }) {
  /** 取りに行っている最中は null。0件と区別する */
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  /** 読めなかったか。空っぽと読めなかったを、同じ顔で出さない */
  const [down, setDown] = useState(false);
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getIdeas()
      .then((r) => {
        if (alive) setIdeas(r.ideas);
      })
      .catch(() => {
        if (!alive) return;
        setIdeas([]);
        setDown(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const list = useMemo(() => shelves(places, ideas ?? []), [places, ideas]);

  /* 取りに行っているあいだは、出てくる付箋と同じ形の灰色を置く。
     「読み込み中…」の字だけだと、何も無いのか取りに行っているのか分からない
     （`docs/island-world.md` 4.1）。 */
  if (ideas === null) {
    return (
      <ul className="nx-notes is-wait" aria-hidden>
        <li />
        <li />
        <li />
      </ul>
    );
  }

  if (!list.length) {
    return down ? (
      <div className="blank is-off">
        <b>いま、提案を読みに行けなかった</b>
        <p>貼ってある日でも、こういうときは出てきません。少し待って、もう一度。</p>
      </div>
    ) : (
      <div className="blank">
        <b>北欧あての提案は、まだ1枚も無い</b>
        <p>行きたい場所も、やってほしいことも出せます。いちばん乗りをどうぞ。</p>
        <Link className="blank-go" href="/nordic#say" prefetch={false}>
          この旅に、言う
          <Icon name="right" size={14} />
        </Link>
      </div>
    );
  }

  // 読み込みの順で棚が増えるので、選び直しは毎回ここで受け直す
  const now = list.find((s) => s.key === pick) ?? list[0];

  return (
    <div className="isle-board">
      {/* 棚の選び札。厚みは1枚ずつ付ける（一面ぜんぶが押せる並びではない） */}
      <div className="nb-tabs">
        {list.map((s) => (
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
        {/* ここに全部は出さない。棚が長くなるほど、下の棚が見えなくなる。
            続きは上の「貼ってある場所へ」から。**行き先を2つ置かない** */}
        {now.items.length > SHOW && (
          <p className="nb-more">
            新しいものから{SHOW}枚まで。残り{now.items.length - SHOW}枚は、貼ってある場所で読めます。
          </p>
        )}
      </div>
    </div>
  );
}
