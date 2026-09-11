"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Pin } from "@/components/live/art";
import Icon from "@/components/ui/IconCore";
import ReadAgain from "@/components/me/ReadAgain";
import { getStickies, type Sticky } from "@/lib/api";
import { withRead, type Read } from "@/lib/auth";
import type { Theme } from "@/content/themes";

/**
 * 島の板の中に出す掲示板。
 *
 * ## なぜ島の中で読むのか
 *
 * 北欧の島の「この旅の掲示板」は `/board` へ飛ばしていた。あそこは
 * **島じゅうの付箋が全部**並ぶ面なので、北欧の島から押した人が、
 * 関係のない企画の付箋を先に読むことになっていた。
 * あやとの言葉:「北欧周遊島の掲示板には、北欧周遊関連だけ見れれば良い」。
 *
 * 建物を押しても島から出ないのが章の島の決まりなので（`IsleSheet.tsx`）、
 * 読むのも島の上の板の中でよい。北欧以外も見たい人のために、
 * 板の下に `/board` への1本を残してある（`spec.ts` の `more`）。
 *
 * ## 仕分けは宛先の欄でやる
 *
 * 前はここも**本文の頭の `【国名】`** を正規表現で読んで仕分けていた。
 * 宛先が正式な欄（`islandNotes.theme`）になり（#160）、既存の8件も
 * そちらへ移した（#162）ので、**推測で仕分けるところは無くなった。**
 * 棚の名前は `content/themes.ts` の表示名で、並びも渡された順のまま。
 *
 * ## ここでは押せない
 *
 * ハートも書き込みも置いていない。島の板は**その旅に何が来ているかを見る**
 * ところで、押す・書くは掲示板（`components/live/Notes.tsx`）の仕事。
 * 同じ機能を2か所に置くと、押した数がどちらで動いたのか読めなくなる。
 *
 * ## 読めなかったときは、読み直す道を出す（#34 #36 #43）
 *
 * 文言（「いま、付箋を読みに行けなかった」）はここにも書いてあったが、
 * **押しどころが無く、電波が戻っても直らなかった。** ここは島の上の板なので、
 * 開き直すには島ごと読み込み直すことになる。島のほかの読みものと同じ形にする。
 *
 *   - `withRead`（12秒）を通す。**`fetch` は自分では諦めない**ので、
 *     45秒返さない回では灰色の骨がいつまでも残っていた
 *   - 落ちたら黙って読み直す（間隔を倍にしながら30秒まで）。
 *     `online`・画面に戻ってきたでも読み直す
 *   - 骨に戻すのは押されたときだけ（ひとりでに戻すと、灰色と文言が入れ替わる）
 */

/** 画びょうの色。並べたときに同じ色が続かないよう、4色を順に回す */
const PINS = ["#e8879a", "#5fbde0", "#8dd06a", "#f2b53d"];

/** 1つの棚に出す枚数の上限。ここを越えたぶんは、貼ってある場所へ送る */
const SHOW = 24;

type Shelf = Theme & { items: Sticky[] };

/** 渡された棚に、宛先の合う付箋だけを入れる。中身の無い棚は作らない */
function shelves(themes: Theme[], notes: Sticky[]): Shelf[] {
  const out: Shelf[] = [];
  for (const t of themes) {
    const items = notes.filter((n) => n.theme === t.id);
    if (items.length) out.push({ ...t, items });
  }
  return out;
}

export default function IsleBoard({ themes }: { themes: Theme[] }) {
  /** 取りに行っている最中は null。0枚と区別する */
  const [notes, setNotes] = useState<Sticky[] | null>(null);
  /** 読めたかどうか。**「読んでいる最中」と「読めなかった」を混ぜない** */
  const [read, setRead] = useState<Read>("wait");
  /** 「もう一度よみこむ」を押されたら増える。**押されたときだけ骨に戻る** */
  const [again, setAgain] = useState(0);
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    let ok = false;
    let wait: ReturnType<typeof setTimeout> | undefined;
    let miss = 0;

    /* テーマを渡さずに1回だけ引く。棚は多くて7つなので、テーマごとに
       聞きに行くと、板を開いただけで7往復する。 */
    const go = () => {
      withRead(getStickies({ limit: 300 }))
        .then((r) => {
          if (gone) return;
          ok = true;
          miss = 0;
          setNotes(r.notes);
          setRead("ok");
        })
        .catch(() => {
          if (gone) return;
          /* **空の配列にしない。** 空は「読めた上での0枚」のことば。 */
          setRead("down");
          miss += 1;
          wait = setTimeout(go, Math.min(2000 * 2 ** (miss - 1), 30000));
        });
    };

    setNotes(null);
    setRead("wait");
    go();

    /* 電波が戻った合図。**島を読み込み直させないため**に、ここでも読み直す。 */
    const wake = () => {
      if (ok || gone) return;
      clearTimeout(wait);
      miss = 0;
      go();
    };
    const onShow = () => {
      if (document.visibilityState === "visible") wake();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      gone = true;
      clearTimeout(wait);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [again]);

  const list = useMemo(() => shelves(themes, notes ?? []), [themes, notes]);

  /* 取りに行っているあいだは、出てくる付箋と同じ形の灰色を置く。
     「読み込み中…」の字だけだと、何も無いのか取りに行っているのか分からない
     （`docs/island-world.md` 4.1）。 */
  if (read === "wait") {
    return (
      <ul className="nx-notes is-wait" aria-hidden>
        <li />
        <li />
        <li />
      </ul>
    );
  }

  if (!list.length) {
    return read === "down" ? (
      /* 札は島じゅうで1つ（`components/me/ReadAgain.tsx`）。
         **「まだ1枚も無い」とは別の顔にする。** */
      <ReadAgain what="付箋" onRetry={() => setAgain((n) => n + 1)} />
    ) : (
      <div className="blank">
        <b>北欧あての付箋は、まだ1枚も無い</b>
        <p>行きたい場所も、やってほしいことも。いちばん乗りをどうぞ。</p>
        <Link className="blank-go" href="/nordic#say" prefetch={false}>
          この旅に、言う
          <Icon name="right" size={14} />
        </Link>
      </div>
    );
  }

  // 読み込みの順で棚が増えるので、選び直しは毎回ここで受け直す
  const now = list.find((s) => s.id === pick) ?? list[0];

  return (
    <div className="isle-board">
      {/* 棚の選び札。厚みは1枚ずつ付ける（一面ぜんぶ押せる並びではない） */}
      <div className="nb-tabs">
        {list.map((s) => (
          <button
            key={s.id}
            className={`nb-tab${s.id === now.id ? " is-on" : ""}`}
            aria-pressed={s.id === now.id}
            onClick={() => setPick(s.id)}
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
            のこり{now.items.length - SHOW}枚は、貼ってある場所で。
          </p>
        )}
      </div>
    </div>
  );
}
