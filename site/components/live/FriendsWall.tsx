"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { RESIDENTS } from "@/content/residents";
import { VOICES } from "@/content/chatter";
import { useResidentShow } from "@/lib/liveStats";
import { createVillagers } from "@/components/island/villagers";
import { placeById } from "@/components/island/layout";
import Icon from "@/components/ui/IconCore";
import { Pedestal } from "./art";

/** キャラクター画像は Google ドライブに置いてある。s の後ろが取り出す大きさ。 */
const drive = (id: string, size: number) => `https://lh3.googleusercontent.com/d/${id}=s${size}`;

/**
 * 今日、島に出ている人。
 *
 * 顔ぶれは日替わりで、よく来てくれている人ほど島にいる日が多い
 * （`components/island/villagers.ts`）。**その選び方をここで写さない。**
 * 島と図鑑で別々に抽選すると、図鑑に「今日いる」と書いてある人が島にいない。
 * 島を作っているのと同じ関数を呼んで、同じ答えをもらう。
 *
 * 静的書き出しなので、今日が何日かはビルド時には決められない。
 * 画面が出てから数える（出るまでは誰にも印が付かない）。
 */
function useOnIslandToday(): Map<string, string> {
  const [m, setM] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    const out = new Map<string, string>();
    for (const v of createVillagers(RESIDENTS)) {
      if (v.icon) out.set(v.icon, placeById(v.post).label);
    }
    setM(out);
  }, []);
  return m;
}

/**
 * 島を歩いている仲間の図鑑。
 *
 * ## なぜ一覧をやめて、見開き＋マスにしたか
 *
 * 前は 22人ぶんの札を2列で積んでいて、面の高さが 5,155px（6.1画面）あった。
 * それだけ縦を使っても、1人について言えていたのは**名前と日数だけ**で、
 * 「絵と名前の一覧」から出られていなかった。
 *
 * 本物の図鑑（`docs/ac-reference.md` 7章、いきもの図鑑のシーラカンスの面）は
 * **一覧と1枚を分けている。** 一覧は小さいマスをぎっしり並べるだけ。
 * 選んだ1匹だけが、絵が縦の半分を占める大きな紙になる。
 * この形にすると、22人ぶんの縦を使わずに、1人あたりの中身は増える。
 *
 * 題名の札は**絵の上**（実測。白い紙を少し傾けて貼ってある）。
 * 欄は罫で割って、見出しに蛍光ペンの帯を敷く。影は落とさない。
 *
 * ## 何を書いて、何を書かないか
 *
 * 島にいるのは視聴者さんご本人なので、**こちらが書いた人物評は出さない。**
 * `chatter.ts` の `note` には「毒舌」「夜勤明けが多い」のような、
 * セリフを書くための手控えが入っている。あれは本人の紹介文ではない。
 *
 * 出すのは**その人が島で実際に言うこと**だけにする。口調はその人のものを
 * 写してあるので（`content/chatter.ts`）、セリフを並べれば人柄はそれで伝わる。
 * はじめての人への1言目と、久しぶりの人への1言目も、島で出るものと同じ。
 *
 * 名前を出すか出さないかは本人が決める（`docs/island-concept.md`）。
 * `/island-api/state` の residents に載っている人だけ名札を付け、
 * そのほかは通し番号だけ。誰が誰かは、絵だけが示す。
 *
 * ここは紙の型。押すのはマスと送りだけなので、そこにしか厚みを付けない。
 */
export default function FriendsWall() {
  const show = useResidentShow();
  const here = useOnIslandToday();
  const list = useMemo(() => RESIDENTS.filter((r) => r.icon), []);
  const [at, setAt] = useState(0);
  // 送りで見開きが差し替わったとき、目が迷子にならないよう見出しへ焦点を戻す。
  // ただし最初に開いたときは動かさない（勝手にスクロールしない）。
  const first = useRef(true);
  const head = useRef<HTMLParagraphElement>(null);

  const say = useMemo(() => Object.fromEntries(VOICES.map((v) => [v.icon, v])), []);
  const r = list[at];
  const v = r?.icon ? say[r.icon] : undefined;
  const name = r?.icon ? show.get(r.icon)?.name : undefined;
  const spot = r?.icon ? here.get(r.icon) : undefined;
  const named = list.filter((x) => show.get(x.icon!)?.name).length;

  const go = (n: number) => {
    setAt((n + list.length) % list.length);
    if (!first.current) head.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    first.current = false;
  };

  if (!r) return null;

  return (
    <>
      {/* 図鑑の1枚。絵が縦の半分以上を占めるのが本物の型（ac-reference 7章 4）。 */}
      <div className="rzk">
        <div className="rzk-page">
          {/* 題名の札は絵の上。テープで貼ったように少し傾ける。
              名前を出していない人は通し番号が題名になる。 */}
          <p className="rzk-tag" ref={head}>
            {name ?? `No.${at + 1}`}
          </p>

          <div className="rzk-art">
            <Pedestal w={150} />
            {/* 22人ぶんを先読みさせない。見開きに出ている1枚だけ取りに行く */}
            <img key={r.icon} src={drive(r.icon!, 512)} alt="" />
          </div>

          <dl className="rzk-fields">
            {/* いっしょにいた日数は出さない。日数は BigQuery から正しく数えられるが、
                その数字がこの絵の人のものだ、とは言えない。キャラクターの絵と
                YouTube のチャンネルを結ぶ表がまだどこにも無いため（issue #113）。
                手で書いた値が並んでいて、実在する人の順番を間違えて出していた。
                表ができたら python/build_residents.py が焼くので、そのとき戻す。 */}
            <div className="rzk-wide">
              <dt>今日いるところ</dt>
              {/* 島の顔ぶれは日替わり。画面が出るまでは分からないので、
                  分からないあいだは何も言わない（island-world.md 4.3 ④）。 */}
              <dd>
                {here.size === 0 ? (
                  <span className="rzk-quiet">数えています</span>
                ) : spot ? (
                  <span className="rzk-spot">
                    <Icon name="pin" size={13} />
                    {spot}のあたり
                  </span>
                ) : (
                  <span className="rzk-quiet">今日は出ていません</span>
                )}
              </dd>
            </div>
            {v && (
              <>
                <div className="rzk-wide">
                  <dt>島で言うこと</dt>
                  <dd>
                    <ul className="rzk-lines">
                      {v.lines.slice(0, 2).map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div>
                  <dt>はじめての人に</dt>
                  <dd className="rzk-say">{v.greet.first}</dd>
                </div>
                <div>
                  <dt>久しぶりの人に</dt>
                  <dd className="rzk-say">{v.greet.back}</dd>
                </div>
              </>
            )}
          </dl>

          {/* 送り。詳細ページの `.pager` と同じ役なので、同じ向きの印を使う */}
          <nav className="rzk-pager" aria-label="図鑑を送る">
            <button type="button" onClick={() => go(at - 1)}>
              <Icon name="left" size={14} />
              まえの人
            </button>
            <span>
              <b>{at + 1}</b> / {list.length}
            </span>
            <button type="button" onClick={() => go(at + 1)}>
              つぎの人
              <Icon name="right" size={14} />
            </button>
          </nav>
        </div>

        {/* 一覧のマス。押すと上の1枚が差し替わる。
            選んでいるものは塗りを変えず、細い枠だけで示す（ac-reference 7章 6）。 */}
        <div className="rzk-grid" role="tablist" aria-label="島の住人">
          {list.map((x, i) => {
            const on = i === at;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={on}
                className={`rzk-cell${on ? " is-on" : ""}${here.get(x.icon!) ? " is-here" : ""}`}
                key={x.icon}
                onClick={() => go(i)}
              >
                <span className="rzk-cell-no">{i + 1}</span>
                <img src={drive(x.icon!, 128)} alt={`${i + 1}人目`} loading="lazy" />
              </button>
            );
          })}
        </div>
      </div>

      {/* 島へ戻る道。図鑑で顔を覚えた人に会いに行けるのが、この面のいちばんの用事。 */}
      {here.size > 0 && (
        <p className="rz-today">
          <b>今日、島を歩いているのは{here.size}人。</b>
          マスの角が光っているのが、その人たちです。近くまで行くと、向こうから話しかけてきます。
          <Link href="/">
            島へ会いに行く
            <Icon name="right" size={13} />
          </Link>
        </p>
      )}

      <p className="pap-note" style={{ marginTop: "var(--sp-3)" }}>
        いま{list.length}人ぶんの絵があります。
        {named > 0
          ? `そのうち${named}人が、島に名前を出すことにしてくれました。`
          : "名前を出すかどうかは本人が決めるので、いまは誰も出していません。"}
        セリフは、その人が配信で書いてきたコメントから口調だけを写したものです。
      </p>
    </>
  );
}
