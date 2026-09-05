import type { Metadata } from "next";
import PageShell from "@/components/ui/PageShell";
import PhotoWall from "@/components/nordic/PhotoWall";
import { DAYS } from "@/content/nordic";

export const metadata: Metadata = {
  title: "旅の写真",
  description:
    "スウェーデンまでヒッチハイクで行く旅の、その日に撮った写真。持って帰るときに、その日いた人のキャラクターを1人だけ入れられます。",
};

/**
 * 旅の写真（`docs/nordic-photos.md`）。
 *
 * 1日が終わったら、あやとがその日の写真を貼る。見た人は持って帰れて、
 * 持って帰るときに、**その日の配信でスパチャしてくれた人のキャラクターを
 * 1人だけ**入れられる。順位でも点数でもなく、その日そこにいたという
 * 事実だけが、持って帰れるものになる。
 *
 * **面を分けた理由。** `/nordic` はすでに 7.13画面ぶんある。写真は1日に
 * 何枚でも貼るので、あの旅程表の行の中に混ぜると、旅程表が写真置き場に
 * 変わる。あちらには、貼られたときだけ出る1行の入口だけを置いた
 * （`components/nordic/TripPhotos.tsx`）。
 *
 * 中身はぜんぶ画面が出てから取りにいく。旅はまだ始まっていないので、
 * いま焼き込めるものが1枚も無い。
 */
export default function NordicPhotosPage() {
  return (
    <PageShell
      current="next"
      crumbs={[
        { label: "これから", href: "/next" },
        { label: "北欧ヒッチハイク", href: "/nordic" },
        { label: "旅の写真" },
      ]}
    >
      <section className="panel paper">
        <h1>旅の写真</h1>
        {/* 句点のうしろで改行しない。JSX が改行と字下げを半角空白1つに畳む。 */}
        <p className="muted">
          その日に撮ったものです。持って帰れます。持って帰るときに、その日いた人のキャラクターを1人だけ入れられます。
        </p>
      </section>
      {/* 出発の日だけを渡す。`content/nordic.ts` をそのまま client 側で
          読むと、しおりも見どころ161件もこの面の JS に乗る（実測 +9KB）。 */}
      <PhotoWall depart={DAYS[0].date ?? "2026-09-11"} />
    </PageShell>
  );
}
