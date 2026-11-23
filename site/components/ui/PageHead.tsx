import type { ReactNode } from "react";
import { Gull } from "../island/Guide";

/**
 * 面の頭（見出し・前置き・案内役のひとこと）。
 *
 * **`PageShell.tsx` から1枚に分けてある。** あちらは器（パンくずの JSON-LD・足もとのガイド）まで
 * 抱えていて、`lib/jsonld.tsx` → `content/guidebook` → ソフィアのガイドブック（読み込んだだけで
 * 中身を確かめる `throw` を持つので、束から削れない）と繋がっている。画面の部品（`"use client"`）が
 * `PageShell` から `PageHead` を読むと、**ソフィアの中身まるごと（圧して約47KB）が、
 * 旅の面の束に乗る**（2026-11-23。`/travel/latvia` の最初の1画面が上限を超えた原因）。
 * client から見出しを使うときは、こちらを読む。`PageShell` は同じものを出し直している。
 */
export function PageHead({
  icon,
  emoji,
  mark,
  logo,
  title,
  lead,
  say,
  meta,
}: {
  /** 見出しの絵。島に置いてあるスプライト名。 */
  icon?: string;
  /** 中身そのものを表す印(国旗や料理)。UIの飾りには使わない。 */
  /** 絵文字。もう使わない。残っているのは移行中のページだけ。 */
  emoji?: string;
  /** 自前の印（国旗やアイコン）。emoji の置き換え。 */
  mark?: ReactNode;
  /** 公式のアプリアイコンなど */
  logo?: string;
  /** 面の名前。**パンくずの最後と同じ字にする**（`docs/island-ux.md` 4.3）。
      折ってよい場所を選びたい面は `Phrase` を渡す（`components/ui/Phrase.tsx`）。 */
  title: ReactNode;
  /** 前置き。**「いま」を言う面では、そこだけリンクを混ぜられるように節で受ける**
      （`app/travel/parts.tsx`）。旅のあいだだけ言い方の変わる1行（`Say`）も部品で来る。
      ほとんどの面は文字列のまま渡す。 */
  lead?: ReactNode;
  /** 案内役のひとこと。 */
  say?: string;
  meta?: ReactNode;
}) {
  return (
    <div className="phead">
      {logo && <img className="phead-logo" src={logo} alt="" />}
      {!logo && icon && <img className="phead-icon" src={`/sprites/${icon}.webp`} alt="" />}
      {!logo && !icon && mark && <span className="phead-mark" aria-hidden>{mark}</span>}
      {!logo && !icon && !mark && emoji && <span className="phead-mark" aria-hidden>{emoji}</span>}
      <h1>{title}</h1>
      {lead && <p className="phead-lead">{lead}</p>}
      {say && (
        <div className="gsay phead-say">
          <span className="gsay-bird"><Gull size={52} /></span>
          <p className="gsay-bubble">{say}</p>
        </div>
      )}
      {meta && <div className="phead-meta">{meta}</div>}
    </div>
  );
}
