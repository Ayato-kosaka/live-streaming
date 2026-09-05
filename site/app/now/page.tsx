import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import NowLive from "@/components/live/NowLive";
import { PROFILE, LINKS } from "@/content/site";
import Icon from "@/components/ui/Icon";
import Link from "next/link";

export const metadata: Metadata = {
  title: "いま何してる",
  description: "あやとが今どこにいて、今週なにをするか。",
};

/**
 * いまのポスト。
 *
 * 上半分は「板の型」。いまどこにいるか、今夜あるか、次の企画はいつか。
 * 押すものと、しらせだけを置く。
 *
 * 下半分は「紙の型」の島だより。今週やること、あやとのこと、この先の話。
 * 読むものは紙に刷ってある、という見え方にする（`docs/ac-reference.md` の 7章）。
 * 同じ形の板が延々と積まれるのを避けるため、この2つは必ず台紙ごと分ける。
 */
export default function NowPage() {
  return (
    <PageShell crumbs={[{ label: "いまのポスト" }]}>
      {/* h1 は場所の名前。島の建物・パンくず・上の帯と1つの名前でそろえる
          （`docs/island-design.md` 6章 / `docs/island-world.md` 7.5）。
          「いま何してる」は問いなので、すぐ下の1行で受ける。
          カモメを出さないのは、ここが読むだけの面だから。遊び方のある面
          （掲示板・これから・キッチン小屋・道しるべ）にだけ出す
          （`docs/island-ux.md` 5.2）。 */}
      <PageHead
        icon="mailbox"
        title="いまのポスト"
        lead="いまどこにいて、今週なにをするか。配信のある日は、22時までの残りもここに出る。"
      />
      <NowLive letter>
        <section className="pap-sec">
          <h2 className="pap-h">あやとって誰</h2>
          <p>
            <b>{PROFILE.lead}</b>
          </p>
          {PROFILE.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <div className="pap-gos" style={{ marginTop: "var(--sp-3)" }}>
            {LINKS.filter((l) => l.id === "youtube" || l.id === "app").map((l) => (
              <a className="pap-go" key={l.id} href={l.href} target="_blank" rel="noopener noreferrer">
                {l.logo ? <img src={l.logo} alt="" /> : <img src={`/sprites/${l.icon}.webp`} alt="" />}
                <span>
                  <b>{l.label}</b>
                  <i>{l.note}</i>
                </span>
                <Icon name="external" size={14} />
              </a>
            ))}
          </div>
        </section>

        <section className="pap-sec">
          <h2 className="pap-h">もっと先の話</h2>
          <p className="pap-note">
            この島だよりは今週ぶんです。もっと先の予定と、これまで歩いた道はこちらに。
          </p>
          <div className="pap-gos" style={{ marginTop: "var(--sp-3)" }}>
            <Link className="pap-go" href="/next">
              <img src="/sprites/tent.webp" alt="" />
              <span>
                <b>これから</b>
                <i>次に行くところ、次にやること</i>
              </span>
              <Icon name="right" size={14} />
            </Link>
            <Link className="pap-go" href="/map">
              <img src="/sprites/canoe.webp" alt="" />
              <span>
                <b>旅の桟橋</b>
                <i>これまでに歩いた国</i>
              </span>
              <Icon name="right" size={14} />
            </Link>
          </div>
        </section>
      </NowLive>
    </PageShell>
  );
}
