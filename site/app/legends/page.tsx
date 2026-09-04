import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import { Panel } from "@/components/ui/Bits";
import { LEGENDS } from "@/content/legends";

export const metadata: Metadata = {
  title: "伝説の丘",
  description: "イランまで12日間歩いた話、GWエジプト祭り、年越し24時間配信。語り継がれている企画たち。",
};

export default function LegendsPage() {
  return (
    <PageShell current="legends" crumbs={[{ label: "伝説の丘" }]}>
      <PageHead
        icon="hall-museum"
        title="伝説の丘"
        lead="いまでも話に出てくる、大きい企画と大きい日を集めました。だいたいは企画会議から生まれています。"
        say={GUIDE.legends}
      />
      <div className="tiles">
        {LEGENDS.map((l) => (
          <Link key={l.slug} className="tile" href={`/legends/${l.slug}`}>
            <span className="tile-emoji" aria-hidden>{l.emoji}</span>
            <span className="tile-text">
              <b>{l.title}</b>
              <i>{l.span ?? l.date.replace(/-/g, "/")}</i>
            </span>
            <span className="tile-go" aria-hidden>→</span>
          </Link>
        ))}
      </div>
      <Panel style={{ marginTop: 18 }}>
        <h2>いちばん語られているのは</h2>
        <p>
          「怖いイメージを変えたいので、一緒にご飯を食べにイランまで歩く」。2026年のGWに12日間かけて、アルメニアのエレバンからイラン国境まで約380kmを歩いた企画です。
        </p>
        <Link className="tile" href="/legends/iran-walk" style={{ marginTop: 12 }}>
          <img className="tile-icon" src="/sprites/signpost.png" alt="" />
          <span className="tile-text">
            <b>イランまで歩く</b>
            <i>12日間・約380km の記録</i>
          </span>
          <span className="tile-go" aria-hidden>→</span>
        </Link>
      </Panel>
    </PageShell>
  );
}
