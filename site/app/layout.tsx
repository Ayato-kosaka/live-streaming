import type { Metadata, Viewport } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import "./globals.css";
import IslandTheme from "@/components/island/Theme";
import { AuthProvider } from "@/lib/auth";
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
  // 500 はサイトのどこでも使っていない（実測: 900 が238か所、700 が59、
  // 800 が49、600 が8、500 は0）。日本語は文字の範囲ごとにファイルが
  // 分かれていて、太さ1つで70本近く落ちてくるので、使わない太さを持たない。
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
