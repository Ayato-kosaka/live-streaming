import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* 島の空の色を、見ている人の時計に合わせる。
            描き始める前に決めたいので、React を待たずにここで入れておく。 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var h=new Date().getHours();" +
              "document.documentElement.dataset.time=" +
              "h<5?'night':h<10?'morning':h<16?'day':h<19?'evening':'night';})()",
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
