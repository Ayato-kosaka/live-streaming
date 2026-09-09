import type { Metadata, Viewport } from "next";
import "./globals.css";
import IslandTheme from "@/components/island/Theme";
import { AuthProvider } from "@/lib/auth";
import Here from "@/components/live/Here";
import IslandRemote from "@/components/live/IslandRemote";
import { NOW_FALLBACK } from "@/content/site";

/* 島の書体は `app/css/fonts.css`（自動生成。`tools/fonts/subset.py`）が持っている。
 * 丸ゴシックは、あつ森の字の「角が無い・字面が大きい・線が均一」に近い。
 *
 * **Google Fonts を <link> で直に読むのに戻さない。** 描き始める前に外のサーバへ
 * 取りにいくので、電波の悪いところで最初の1秒が真っ白になる。焼いたものを
 * 自分のドメインから配る、といういまの形はそのため。
 *
 * 太さは 400 / 700 / 900 の3つ。**これ以上は減らせない。**
 * CSS の指定は 900 が237か所・700 が59・800 が46・600 が8で、800 は 900 の実ファイル、
 * 600 は 700 の実ファイルに落ちる（狙いが 500 より上なら上側を近い順に見る規則）。
 * 900 を落とすと見出しの黒さが消え、700 を落とすと添え書きまで真っ黒になる。
 *
 * ## next/font の Zen Maru Gothic を外した
 *
 * 焼いた束から漏れた字の受け皿として、ここに next/font を置いていた。
 * **受け皿のほうが島の入口を遅くしていた。**
 *
 * next/font は日本語を Google の切り分けのまま渡してくる。太さ3つで
 * `@font-face` が **367 本**、CSS だけで 266KB。字を並べるたびに
 * 「その字はどの1本に入っているか」を 367 本に当てにいくので、
 * 最初の Layout がそのぶん伸びる。390×844 で交互に4往復して測った中央値:
 *
 *   置いたまま  最初のLayout 1,543ms  FCP 1,912ms  CSS 550KB
 *   外す        最初のLayout   203ms  FCP   632ms  CSS 284KB
 *
 * 漏れる字は site 全体で 83 字（竹・停・，など。多くは料理の引用文）と、
 * 掲示板や付箋に視聴者さんがその場で書く字。どちらも端末の丸ゴシック
 * （iPhone・Mac は Hiragino Maru Gothic ProN）で出る。Android には丸ゴシックが
 * 無いので、そこだけ普通のゴシックになる。順番は `app/css/tokens.css`。
 */

export const metadata: Metadata = {
  metadataBase: new URL("https://live-streaming-d3cac.web.app"),
  title: {
    default: "あやと島 — あやとと愉快な仲間達",
    template: "%s｜あやと島",
  },
  description:
    "毎晩22時、世界のどこかから生配信。旅とごはんとアプリ作りを、愉快な仲間達と一緒に進めている島です。",
  openGraph: {
    type: "website",
    siteName: "あやと島",
    locale: "ja_JP",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "あやと島" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
  // Google Search Console でのドメイン所有権確認。YouTubeログインのOAuth審査に、
  // ホームページURLの所有証明として要る（`docs/`には置かない。すぐ終わる1回きりの確認）。
  verification: { google: "6p-lWEfzAS0TNvI5F0bf-huSu1JuO_6eLE7UraOscYI" },
};

export const viewport: Viewport = {
  themeColor: "#3aa8c8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // 下のスクリプトが data-time を足すぶんサーバの出力と食い違うが、
    // それは承知のうえなので suppressHydrationWarning で黙らせる
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* 島の空の色を見ている人の時計に、島の景色をあやとの現在地に合わせる。
            描き始める前に決めたいので、React を待たずにここで入れておく。
            現在地はこのあと IslandTheme が本物の値で上書きする。 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var d=document.documentElement,h=new Date().getHours();" +
              "d.dataset.time=h<5?'night':h<10?'morning':h<16?'day':h<19?'evening':'night';" +
              `d.dataset.theme=${JSON.stringify(NOW_FALLBACK.theme)};})()`,
          }}
        />
      </head>
      <body>
        <IslandTheme />
        <AuthProvider>
          {/* 「いま、このページを見ている」を置いてくる（`docs/island-here.md`）。
              どのページからも動かないと、`/board` を読んでいる人が島に出ない。
              ログインしていない人には何も起きない（取りにいくものも無い）。 */}
          <Here />
          {/* 島の遠隔操作を受ける側（#165）。**`?remote=` が付いていない面では
              タイマーも張らず、1回も聞きにいかない。** ふつうの訪問者に
              代金を乗せないため、器に置いてあっても何も起きない。 */}
          <IslandRemote />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
