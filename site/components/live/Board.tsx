"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPoll, pollAnswer } from "@/lib/api";
import { THEMES } from "@/content/themes";
import { LEGENDS } from "@/content/legends";
import { useAuth } from "@/lib/auth";
import Fold from "@/components/ui/Fold";
import Icon from "@/components/ui/IconCore";
import SignIn from "./SignIn";
import Notes from "./Notes";

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
 * ## 畳んだのは「視聴者さんが出す道」だけ
 *
 * 入れ物（`islandNextPlans`）も、あやとが段を動かす道具（`/me` の `PlanCare`）も、
 * 口（`POST /island-api/nextplans`）も残っている。**畳んだのは画面だけ。**
 *
 * 畳める理由は、提案の口があっても工程が1つも減らないから。段を「これから」に
 * 上げても、企画のページは `site/content/plans.ts`（Git）にしか立たない。
 * つまり**どちらにしても、あやとがこちらに言う**。だったら受け口は1つでいい。
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

        {/* 読む先。**出す先ではない。** 付箋から育った企画が、どこに出るか。

            **時制も数も名乗らない**（`docs/island-standards.md` 16章の決めごと1）。
            ここは長いあいだ「これから／いま ◯ つ立っています」と数えていた。
            数え直しは画面が出てからなので、**開いている人の目には合っている。**
            合っていないのは**焼いた HTML のほう**で、出した日の数がそのまま
            配られ続ける。10-12 に焼いた「いま 1 つ立っています」は、企画が
            その日で終わったあとも配りっぱなしになった（#770）。
            札は常設で、中身は日付で動く。**動かないほうに時制を置かない。** */}
        <Link prefetch={false} className="tile" href="/next" style={{ marginTop: "var(--sp-4)" }}>
          <img className="tile-icon" src="/sprites/tent.webp" alt="" />
          <span className="tile-text">
            {/* **「終わったもの」とも書かない。** あれも時制で、`navtruth.mjs` の
                `tenseOf` は過去の札として読む（＝行き先に先の日付が1つでも
                在れば嘘になる）。札が言うのは**行き先が何の置き場か**だけ。 */}
            <b>企画</b>
            <i>付箋から育ったものが出る先</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>
        <Link prefetch={false} className="tile" href="/legends">
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
