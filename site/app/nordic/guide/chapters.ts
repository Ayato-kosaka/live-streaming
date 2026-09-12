import type { IconName } from "@/components/ui/Icon";

/**
 * しおりのコーナーの並びと、それぞれの絵。
 *
 * 番号だけの目次は、同じ形の行が積み上がる。どこに何が書いてあるかを探すのに、
 * 行の数だけ字を読まないといけない。**章ごとに違う絵を1つ置く。**
 * 絵は目次と章の見出しの両方に同じものを出して、目次で見た絵を
 * 本文でもう一度見つけられるようにする。
 *
 * **すべて別の絵にする。** 1つでも使い回すと、その2章が同じ話に見える。
 *
 * ## 面（`./page.tsx`）から外に出してある理由
 *
 * **入口の札が「10のコーナー」と手で書いてあって、しおりは11本あった**
 * （`app/nordic/page.tsx`）。コーナーを1つ足すたびに、入口と中身が食い違う。
 * 数える先を1つにするために、並びをここに置いて、入口も面もここから数える
 * （`docs/island-standards.md` 8章）。
 */
export const GUIDE_CHAPTERS: { id: string; title: string; note: string; icon: IconName }[] = [
  { id: "basic", title: "まず知っておくこと", note: "ビザ、入国、物価", icon: "passport" },
  { id: "money", title: "お金", note: "通貨4種類、カードと現金", icon: "currency" },
  { id: "connect", title: "通信", note: "eSIM、フリーWi-Fi", icon: "sim" },
  { id: "clothes", title: "服装", note: "季節ごとの重ね方と持ち物", icon: "jacket" },
  { id: "move", title: "国から国への移動", note: "時間とお金", icon: "border" },
  { id: "sauna", title: "サウナの入り方", note: "手順、やってはいけないこと", icon: "sauna" },
  { id: "food", title: "食べもの", note: "何で、どこで食べるか", icon: "eat" },
  { id: "souvenir", title: "おみやげ", note: "値段とどこで買うか", icon: "souvenir" },
  { id: "light", title: "白夜と極夜とオーロラ", note: "明るい時期と暗い時期", icon: "aurora" },
  { id: "phrases", title: "現地のことば", note: "挨拶と、通じる一言", icon: "phrase" },
  { id: "trouble", title: "困ったとき", note: "緊急番号、盗難、病気", icon: "firstaid" },
];
