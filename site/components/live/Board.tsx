"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPoll, pollAnswer } from "@/lib/api";
import { THEMES } from "@/content/themes";
/* 伝説の名前と数だけが要る。面の形に組んだ `content/legends.ts` は旅程の表（`content/nordic.ts`）を
   読むので、client のここからは企画の表を直に読む */
import { PROJECTS, isLegend } from "@/content/projects";
import { useAuth } from "@/lib/auth";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/IconCore";
import SignIn from "./SignIn";
import Notes from "./Notes";

const LEGENDS = PROJECTS.filter(isLegend);

/** 「むちゃでも通る」ことが伝わる、実際にやった企画。記録の類ではなく企画だけ選ぶ。 */
const PROOF = ["iran-walk", "egypt-festival", "newyear-24h", "roulette-georgia"];

/**
 * やってほしいこと（掲示板）。**付箋ひとつになった（2026-10-01）。**
 *
 * あやとの言葉:
 *
 * > 企画と付箋がわかりにくいので 企画は消しましょう。付箋だけ集めて、
 * > 「スニーカー探したい」があれば、私があなたにお願いして企画を作る導線に
 * > するので企画提案機能はいらなくない？ どうせ企画提案してもあなたに
 * > お願いしないと行けないよね？
 *
 * ## 札を2枚置いても、選び違いは止まらなかった
 *
 * 前はここに「これやって（付箋）」と「1日つかう企画」の札が並んでいた。
 * 札の字・既定で開く側・紙の形まで変えたが、**視聴者さんが企画の欄に出した
 * 累計3件は、3件とも付箋だった**（アルバニアへの注文2件と、あやとへの
 * ひとこと1件。2026-09-30 に付箋へ移した）。あやと本人も「企画で合ってるのか、
 * イマイチ私もよくわかってない」と言っている。
 *
 * ## 企画の面と道具も畳んだ（#1277）
 *
 * 2026-10-01 に畳んだのは「視聴者さんが出す道」だけだった。あやと（2026-11-18）
 * 「企画というのが要らない。企画を出す人も付箋でやってる」で、企画を並べる面（`/next`）と、
 * あやとが段を動かす道具（`/me` の机）も外した。`/next#<id>` はここの、そのお題の棚に着く。
 * 口（`POST /island-api/nextplans`）の片づけは Functions の側（#1281）。
 *
 * ## ここに残っているもの
 *
 * 付箋（`Notes`）と、むちゃが通った証拠、読む先2つ、ログインの畳み。
 * 「企画はこちらで作ります」のような説明は**書かない**
 * （`docs/island-standards.md` 6章。画面で仕組みの話をしない）。
 */
export default function Board() {
  /** 今夜のおたずねで押した1票。橋を渡ってきた人だけ、ここに入っている。 */
  const [ask, setAsk] = useState<{ question: string; label: string } | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    /* 「押す」から「書く」への橋を、渡ってきた側で受ける。
       島で今夜のおたずねを押した人は、押した直後に「理由も書ける？」で
       ここへ来る（`docs/island-play.md` 7章）。押した札を `Notes` へ渡して、
       その続きから書けるようにする。押していない人には何も出さない。 */
    getPoll()
      .then(({ poll }) => {
        if (!poll) return;
        const mineOption = pollAnswer(poll.id);
        const picked = poll.options.find((o) => o.id === mineOption);
        if (picked) setAsk({ question: poll.question, label: picked.label });
      })
      .catch(() => {
        /* おたずねが読めない日は、ただ橋が出ないだけ。ここで謝らない */
      });
  }, []);

  return (
    <>
      {/* **面の題（「やってほしいこと」）が、ここの名前。**
          `title={null}` で見出しを出さないのは、同じ場所に同じものの名前を
          2つ並べないため。書く欄は開いて出す（`writeOpen`）——この面は
          書くのが用事で、ほかに書く欄が1つも無い。 */}
      <Notes themes={THEMES} writeOpen title={null} ask={ask} />

      <section className="panel paper">
        {/* むちゃでいい、の証拠。**紙に見出しを立てない。**
            言っていることは面の頭（「むちゃなものほど、だいたい通る」）と
            同じなので、見出しを足すと同じ字が2回出る。 */}
        <p className="muted">どれも思いつきから始まって、本当にやった。</p>
        <div className="chips" style={{ marginTop: "var(--sp-2)" }}>
          {PROOF.map((slug) => {
            const l = LEGENDS.find((x) => x.slug === slug);
            if (!l) return null;
            return (
              <Link className="chip link" href={`/legends/${l.slug}`} key={l.slug} prefetch={false}>
                {l.title}
                <Icon name="right" size={12} />
              </Link>
            );
          })}
          <Link prefetch={false} className="chip link" href="/legends">
            ぜんぶ見る
            <Icon name="right" size={12} />
          </Link>
        </div>

        {/* 読む先。**出す先ではない。** 付箋から育った企画のうち、語り継ぐものが並ぶ所。
            企画を並べる面（`/next`）への札は外した（#1277。`/next` は ここ `/board` へ 301）。 */}
        <Link prefetch={false} className="tile" href="/legends" style={{ marginTop: "var(--sp-4)" }}>
          <img className="tile-icon" src="/sprites/hall-museum.webp" alt="" />
          <span className="tile-text">
            <b>伝説の企画</b>
            <i>いまも話に出てくる、終わった企画が{LEGENDS.length}つ</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>

        {/* ログインは「しなくていい」ものなので、書く場所より下に、畳んで置く。

            **入っている人には畳まない（#163）。** 島での見え方とログアウトは
            じぶんのこと（`/me`）へ移したので、ここに残すのは**行き先の1行だけ**。
            畳みの向こうに行き先まで隠すと、移した先が前より遠くなる。 */}
        <div style={{ marginTop: "var(--sp-4)" }}>
          {user ? (
            <SignIn />
          ) : (
            <Fold title="名前とアイコンも島に出したい" lead="絵を貼るのも、ログインしてから">
              <SignIn />
            </Fold>
          )}
        </div>
      </section>
    </>
  );
}
