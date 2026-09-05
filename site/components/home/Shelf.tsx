import Link from "next/link";
import type { ReactNode } from "react";
import Icon from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import { LiveNumber, type StatKey } from "@/lib/liveStats";
import { COUNTRIES } from "@/content/countries";
import { RECIPES } from "@/content/recipes";
import { LEGENDS } from "@/content/legends";
import { STREAM_TYPES } from "@/content/streamTypes";
import { APPS } from "@/content/apps";
import { STATS_FALLBACK } from "@/content/site";
import { ACTIVE_FRIENDS } from "@/content/residents";

/**
 * これまでの棚。「これまで」の章の顔。
 *
 * ## 何を消したか
 *
 * 前はここに、行き先カード3枚（道しるべ・キッチン・伝説）と、
 * 国旗18個の一覧と、料理12品の帯があった。国旗18は `/map` の1画面目そのもので、
 * 料理12品は `/kitchen` の1画面目そのもの（`docs/island-ux.md` 3.4）。
 * **行き先のページを開く前に、そのページを読ませていた。**
 * それだけで 2,000px 近くあって、しかも押しどころは 36px と 21px だった。
 *
 * ## 何に置き換えたか
 *
 * 格子。1マスに「数・場所の名前・1行・中身の見本」を入れる。
 * 見本は一覧ではなく**手前の数個だけ**。全部出すのが行き先のページの仕事で、
 * ここの仕事は「何がどれだけあるか」を1目で見せること。
 *
 * 縦に並ぶ横長カードを積むのをやめて格子にしたのは、
 * 章ごとに違う顔をさせるため。上の章は名刺（横組み1枚）、ここは棚（格子）。
 * 同じ形が4章つづくと、看板の文字しか変わらない面になる。
 */

type Box = {
  href: string;
  name: string;
  note: string;
  /** 数。Firestore から来るものは statKey を持たせて、届いたら静かに差し替える */
  n: ReactNode;
  statKey?: StatKey;
  unit: string;
  /** マスの中に置く見本。数個だけ */
  sample: ReactNode;
};

export default function Shelf() {
  const s = STATS_FALLBACK;
  // 新しく行った国から。古い順に出すと、いま追いかけている旅がいちばん後ろになる
  const flags = [...COUNTRIES].sort((a, b) => b.order - a.order).slice(0, 6);
  const dishes = [...RECIPES].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 4);

  const boxes: Box[] = [
    {
      href: "/map",
      name: "旅の桟橋",
      note: "パリからトビリシまで、どこをどう通ってきたか",
      n: s.countries,
      unit: "カ国",
      sample: (
        <span className="shelf-flags">
          {flags.map((c) => (
            <Flag key={c.slug} slug={c.slug} size={22} />
          ))}
        </span>
      ),
    },
    {
      href: "/kitchen",
      name: "キッチン小屋",
      note: "その土地のものを、買い出しから作って食べる",
      n: RECIPES.length,
      unit: "品",
      sample: (
        <span className="shelf-dishes">
          {dishes.map((r) => (
            <img key={r.slug} src={`/sprites/${r.icon}.webp`} alt="" loading="lazy" />
          ))}
        </span>
      ),
    },
    {
      href: "/streams",
      name: "配信やぐら",
      note: "配信は5つの型でできてる。型ごとにまとめて見られる",
      n: <LiveNumber statKey="streams" fallback={s.streams} />,
      unit: "本",
      sample: (
        <span className="shelf-types">
          {STREAM_TYPES.map((t) => (
            <em key={t.slug} style={{ ["--hb" as string]: t.color }}>
              {t.name.replace(/配信$/, "")}
            </em>
          ))}
        </span>
      ),
    },
    {
      href: "/legends",
      name: "伝説の丘",
      note: LEGENDS[0]?.title ?? "いまも話に出てくる企画",
      n: LEGENDS.length,
      unit: "つの伝説",
      sample: (
        <span className="shelf-line">
          {LEGENDS.slice(0, 3).map((l) => (
            <em key={l.slug}>{l.title}</em>
          ))}
        </span>
      ),
    },
    {
      href: "/apps",
      name: "アプリ工房",
      note: "旅先で、配信しながら作っている",
      n: APPS.length,
      unit: "つのアプリ",
      sample: (
        <span className="shelf-apps">
          {APPS.map((a) => (
            <em key={a.slug}>{a.name}</em>
          ))}
        </span>
      ),
    },
    {
      href: "/friends",
      name: "愉快な仲間達",
      note: "配信に来てくれる人が、そのまま島の住人になる",
      n: <LiveNumber statKey="activeFriends" fallback={ACTIVE_FRIENDS} />,
      unit: "人",
      sample: <span className="shelf-line"><em>キャラクターは自分で作れる</em></span>,
    },
  ];

  return (
    <div className="shelf">
      {boxes.map((b) => (
        <Link className="shelf-box" key={b.href} href={b.href}>
          <span className="shelf-n">
            <em>{b.n}</em>
            <i>{b.unit}</i>
          </span>
          <b className="shelf-name">{b.name}</b>
          <span className="shelf-note">{b.note}</span>
          {b.sample}
          <span className="shelf-go" aria-hidden>
            <Icon name="right" size={14} />
          </span>
        </Link>
      ))}
    </div>
  );
}
