import IslandStage from "@/components/island/IslandStage";
import { RESIDENTS } from "@/content/residents";

export default function Home() {
  return (
    <main>
      <section className="hero">
        <IslandStage residents={RESIDENTS} />
        <div className="hero-ui">
          <div className="hero-copy">
            <p className="eyebrow">毎晩 22:00 — 世界のどこかから生配信</p>
            <h1>あやと島</h1>
            <p className="lede">
              旅と、ごはんと、アプリ作り。<br />
              あやとと愉快な仲間達が住んでいる島です。
            </p>
            <div className="hero-badges">
              <span className="badge"><em>📍</em> いま ジョージア・トビリシ</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
