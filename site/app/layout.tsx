import type { Metadata, Viewport } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import "./globals.css";
import IslandTheme from "@/components/island/Theme";
import { AuthProvider } from "@/lib/auth";
import Here from "@/components/live/Here";
import { NOW_FALLBACK } from "@/content/site";

/**
 * 島の書体。丸ゴシックは、あつ森の字の「角が無い・字面が大きい・線が均一」に近い。
 *
 * これまでは <link> で Google Fonts を直に読んでいた。描き始める前に外の
 * サーバへ取りにいくので、電波の悪いところで最初の1秒が真っ白になる。
 * next/font はビルド時に取ってきて自分のドメインから配るので、その待ちが消える。
 */
const maru = Zen_Maru_Gothic({
  subsets: ["latin"],
  /**
   * 太さは3つ。**これ以上は減らせない。**
   *
   * 500 は0か所なので落とした。残る3つは、どれも本当に使われている。
   * CSS の指定は 900 が237か所・700 が59・800 が46・600 が8。
   * 800 と 600 は「合成」ではなく、CSS の太さの当てはめで
   * **800 は 900 の実ファイル・600 は 700 の実ファイル**に落ちる
   * （狙いが 500 より上なら、まず上側をいちばん近い順に見る規則）。
   * つまり3つとも実際に使われている。
   *
   * 減らしたらどう見えるかは、配る CSS の @font-face を途中で抜いて撮って比べた。
   *   - 900 を落とす → 700 に寄る。見出しの黒さが消えて、島の字の顔が変わる（237か所）
   *   - 700 を落とす → 900 に寄る。区間の一覧や添え書きまで真っ黒になる（67か所）
   * どちらも絵が落ちるので、3つのまま持つ。
   *
   * 書体はスマホ1面あたり 590〜890KB で、**縮めても小さくならない**（woff2 は
   * もう縮んでいる）。転送でいちばん重いのはここだが、太さを削る方向では直らない。
   * 直すなら、島で実際に使う字だけを集めて自前でサブセットを焼く。
   */
  weight: ["400", "700", "900"],
  display: "swap",
  variable: "--font-maru",
  // 日本語は Google 側が文字の範囲ごとにファイルを分けているので、
  // 使う文字が入っているぶんだけが落ちてくる。preload すると全部先に取りにいってしまう。
  preload: false,
  fallback: ["ui-rounded", "Hiragino Maru Gothic ProN", "sans-serif"],
});

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
    <html lang="ja" className={maru.variable} suppressHydrationWarning>
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
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
