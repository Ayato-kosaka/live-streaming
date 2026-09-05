import type { ReactNode } from "react";
import Icon from "./IconCore";

/**
 * 折りたたみ。
 *
 * 1画面に収まらない説明を、そのまま縦に並べない（`docs/island-design.md`）。
 * 見出しだけが並んでいて、押すと開く。目次から探して、ポンポン開ける感触を作る。
 *
 * JavaScript を使わない `<details>` にしてあるので、
 * 画面が出た瞬間から押せるし、ページ内検索でも中身が見つかる。
 */
export default function Fold({
  title,
  note,
  lead,
  open = false,
  tone,
  children,
}: {
  title: ReactNode;
  /** 見出しの右に小さく出す数など */
  note?: ReactNode;
  /** 閉じているときも見せる一行。ここで中身の見当がつくようにする。 */
  lead?: ReactNode;
  /** 最初から開いておくか。1ページにひとつまで。 */
  open?: boolean;
  /** 見出しの色。国ごとの色などに使う。 */
  tone?: string;
  children: ReactNode;
}) {
  return (
    <details className="fold" open={open}>
      <summary style={tone ? { borderLeftColor: tone } : undefined}>
        <span className="fold-t">
          <b>{title}</b>
          {lead && <i>{lead}</i>}
        </span>
        {note && <em className="fold-n">{note}</em>}
        <Icon name="chevron" size={20} className="fold-c" />
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}
