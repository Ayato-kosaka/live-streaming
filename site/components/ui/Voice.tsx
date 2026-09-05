/**
 * 引用の吹き出し。**視聴者さんが書いた文章を、書かれたまま出す**ための部品。
 *
 * 島で絵文字を出していいのは、配信のタイトルの引用と、この中の文章だけ
 * （`docs/island-design.md` 1章の例外）。誤字も全角カンマも直さない。
 * 直したらもう引用ではない。
 *
 * 押せないので厚みは付けない。押せる合図は厚み1種類だけと決めてある
 * （`docs/island-world.md` 3.4）。
 *
 * `/about`（島のみんなから見た、あやと）と
 * `/kitchen/[品]`（チャットから飛んできた、作りかた）の2面で使う。
 * 見た目は `app/css/ui.css` の `.avoice`。
 */
export default function Voice({
  icon,
  name,
  meta,
  text,
  flip,
}: {
  /** YouTube のアイコン。取れなかったときは頭文字の丸に落とす */
  icon?: string;
  /** YouTube の表示名 */
  name: string;
  /** 名前の右に小さく置く一言（いつの配信か、どの日か） */
  meta?: string;
  /** 書かれたままの本文 */
  text: string;
  /** 右に寄せる。並べるときに1つおきで渡すと、チャットが流れている形になる */
  flip?: boolean;
}) {
  return (
    <li className={`avoice${flip ? " is-r" : ""}`}>
      {/* 絵が届かないときのために alt は空にして、名前は隣に文字で置く。
          （このサンドボックスからは googleusercontent に出られない） */}
      {icon ? (
        <img
          className="avoice-face"
          src={icon}
          alt=""
          width={32}
          height={32}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="avoice-face is-none" aria-hidden="true">
          {name.replace(/^@/, "").slice(0, 1)}
        </span>
      )}
      <div className="avoice-body">
        {/* 名前といつかを1行にまとめて、吹き出しの上に置く。
            日付を吹き出しの下に置くと、次の人の名前と近くなって、
            どちらの言葉に付いた日付なのか読み取れなくなる */}
        <span className="avoice-who">
          {name}
          {meta && <em>{meta}</em>}
        </span>
        <p className="avoice-say">{text}</p>
      </div>
    </li>
  );
}
