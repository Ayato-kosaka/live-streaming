import type { Metadata } from "next";
import { share } from "@/lib/share";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import Notes from "@/components/live/Notes";
import { UPDATES } from "@/content/updates";
import "./updates.css";

export const metadata: Metadata = share({
  key: "updates",
  title: "島をなおしたところ",
  description:
    "あやと島のどこが変わったか。こうしてほしいところも、ここから。",
  path: "/updates",
});

/**
 * 日付を、読む形に。**年を落とさない。**
 *
 * 年の無い「10/9」は、来年の同じ日に書いたものと見分けが付かない。
 * この表は増えつづけるので、下まで送ると去年の行が並ぶ日が来る。
 */
const day = (on: string) => {
  const [y, m, d] = on.split("-");
  return `${y}/${Number(m)}/${Number(d)}`;
};

/**
 * 島をなおしたところ。
 *
 * あやとの言葉（2026-10-13）:
 *
 * > あやと島案内鳥からのアップデートをお知らせするページ欲しい。
 * > （気にしてる人少ないのでさりげなく。）
 *
 * ## さりげなく、とは
 *
 * **表紙に帯を立てない。島の上にも建てない。** 入口は「島のなか ぜんぶ」の
 * 棚に1行と、掲示板の「あやと島へ」の札から（`content/themes.ts`）。
 * 探しに来た人だけが着く場所で、島に降りた人の目の前には出てこない。
 *
 * 面の中も、厚みのある板を積まない。**日付と1行が並ぶだけ**にする。
 * 押せるものを1つも混ぜないので、行に厚みも付けない
 * （`docs/island-design.md` 3-3。押せないものは完全に平ら）。
 *
 * ## 読んだ流れで、そのまま書ける
 *
 * 「こんな変化が出た」を読んだすぐ下に、付箋の欄を置く。
 * **宛先は増やしていない**——島への要望を受ける先は「あやと島へ」が
 * もう持っていて、似た宛先が2つあると、どちらに書けばいいか読む人が迷う
 * （`docs/island-standards.md` 8章）。
 *
 * ## 中身は焼き込み
 *
 * `output: "export"` なので、この面に出るのは**焼いた時点の表**
 * （`content/updates.ts`）。足し忘れたら `python/upkeep_watch.py` が
 * 整備の札に出す。
 */
export default function UpdatesPage() {
  return (
    <PageShell crumbs={[{ label: "島をなおしたところ" }]}>
      <PageHead
        icon="mailbox"
        title="島をなおしたところ"
        lead="すこしずつ、島をなおしています。こうしてほしいところは、下の付箋へ。"
      />

      <section className="panel paper">
        <ol className="upd">
          {UPDATES.map((u, i) => (
            /* 同じ日に2つ出る日があるので、日付だけでは鍵にならない。
               並びは `content/updates.ts` の順がそのままなので、
               そこでの位置をいっしょに鍵にする */
            <li key={`${u.on}-${i}`}>
              <time className="upd-on" dateTime={u.on}>
                {day(u.on)}
              </time>
              <p className="upd-t">{u.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* **宛先は「あやと島へ」**（`content/themes.ts` の `island`）。
          この面を指しているのもその札なので、掲示板から来ても、ここから
          書いても、入る棚は同じ1つ。 */}
      <Notes theme="island" title="こうしてほしい" />
    </PageShell>
  );
}
