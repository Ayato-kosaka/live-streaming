"use client";

import { useEffect, useState } from "react";
import { getDrafts, saveDraft, type PlanDraft } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import SignIn from "./SignIn";
import PlanCard from "./PlanCard";
import type { Plan } from "@/content/plans";

/**
 * 企画ページの下書きを書く道具。
 *
 * 「これからの企画のページは毎回きれいに作る」ための入口。
 * 認可された視聴者さんがここで骨組みを書いて、あやとが Claude Code で仕上げる。
 * だから、この画面が作るのは完成品ではなく「渡せる形の下書き」。
 *
 * 出口はふたつある。
 *   1. 保存 … Firestore の islandDrafts に入る。あとから続きが書ける。
 *   2. 書き出し … content/plans.ts にそのまま貼れる TypeScript を出す。
 *      あやとはこれを Claude Code に渡して磨く。
 *
 * 書いている途中の見た目が右（スマホでは下）にそのまま出る。
 * 完成形が見えないまま書かせると、だいたい情報が足りない下書きになるので。
 */

const EMPTY: PlanDraft = {
  title: "",
  when: "",
  date: "",
  note: "",
  tags: [],
  place: { name: "", area: "", map: "" },
  about: [""],
  links: [],
  photos: [],
  embeds: [],
};

/** 下書きを Plan の形に読み替える。プレビューは本番と同じ部品で描く。 */
function toPlan(d: PlanDraft): Plan {
  return {
    id: d.id ?? "draft",
    title: d.title || "（名前のない企画）",
    when: d.when,
    date: d.date || undefined,
    note: d.note,
    tags: d.tags,
    place: d.place.name ? d.place : undefined,
    about: d.about.filter(Boolean),
    links: d.links.filter((l) => l.label && l.href),
    photos: d.photos.filter((p) => p.src),
    embeds: d.embeds.filter((e) => e.id),
  };
}

/** content/plans.ts に貼れる形に書き出す。 */
function toSource(d: PlanDraft): string {
  const q = (s: string) => JSON.stringify(s);
  const lines: string[] = ["  {"];
  lines.push(`    id: ${q(d.id || "new-plan")},`);
  lines.push(`    title: ${q(d.title)},`);
  lines.push(`    when: ${q(d.when)},`);
  if (d.date) lines.push(`    date: ${q(d.date)},`);
  lines.push(`    note: ${q(d.note)},`);
  lines.push(`    tags: [${d.tags.map(q).join(", ")}],`);
  if (d.place.name) {
    lines.push("    place: {");
    lines.push(`      name: ${q(d.place.name)},`);
    if (d.place.area) lines.push(`      area: ${q(d.place.area)},`);
    if (d.place.map) lines.push(`      map: ${q(d.place.map)},`);
    lines.push("    },");
  }
  const about = d.about.filter(Boolean);
  if (about.length) {
    lines.push("    about: [");
    about.forEach((a) => lines.push(`      ${q(a)},`));
    lines.push("    ],");
  }
  const links = d.links.filter((l) => l.label && l.href);
  if (links.length) {
    lines.push("    links: [");
    links.forEach((l) => lines.push(`      { label: ${q(l.label)}, href: ${q(l.href)} },`));
    lines.push("    ],");
  }
  const photos = d.photos.filter((p) => p.src);
  if (photos.length) {
    lines.push("    photos: [");
    photos.forEach((p) => {
      lines.push("      {");
      lines.push(`        src: ${q(p.src)},`);
      lines.push(`        alt: ${q(p.alt)},`);
      if (p.credit) lines.push(`        credit: ${q(p.credit)},`);
      if (p.creditHref) lines.push(`        creditHref: ${q(p.creditHref)},`);
      lines.push("      },");
    });
    lines.push("    ],");
  }
  const embeds = d.embeds.filter((e) => e.id);
  if (embeds.length) {
    lines.push("    embeds: [");
    embeds.forEach((e) =>
      lines.push(`      { kind: ${q(e.kind)}, id: ${q(e.id)}${e.note ? `, note: ${q(e.note)}` : ""} },`),
    );
    lines.push("    ],");
  }
  lines.push("  },");
  return lines.join("\n");
}

export default function PlanDraftEditor() {
  const { user, token } = useAuth();
  const [d, setD] = useState<PlanDraft>(EMPTY);
  const [mine, setMine] = useState<PlanDraft[] | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "denied" | "error">("idle");
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const t = await token();
      if (!t) return;
      try {
        const r = await getDrafts(t);
        setMine(r.drafts);
      } catch (e) {
        setMine([]);
        if (String(e).includes("403")) setState("denied");
      }
    })();
  }, [user, token]);

  if (!user) {
    return (
      <section className="panel">
        <h2>企画のページを作る</h2>
        <p className="muted">
          これからの企画のページは、視聴者さんも作れます。まずはログインしてください。
        </p>
        <SignIn />
      </section>
    );
  }

  if (state === "denied") {
    return (
      <section className="panel">
        <h2>企画のページを作る</h2>
        <p>
          いまは、あやとが「書いていいよ」と決めた人だけが書けるようになっています。
          書いてみたい人は配信で言ってください。すぐ開けます。
        </p>
      </section>
    );
  }

  const set = (patch: Partial<PlanDraft>) => setD((v) => ({ ...v, ...patch }));

  const save = async () => {
    const t = await token();
    if (!t) return setState("error");
    setState("saving");
    try {
      const r = await saveDraft(d, t);
      setD((v) => ({ ...v, id: r.id }));
      setState("saved");
    } catch (e) {
      setState(String(e).includes("403") ? "denied" : "error");
    }
  };

  return (
    <>
      <section className="panel">
        <h2>企画のページを作る</h2>
        <p className="muted">
          骨組みだけ書いてください。文章の整えと見た目は、あやとが仕上げます。
          「どんなものか」が伝わる材料（写真・公式リンク・SNSの投稿）があるほど、いいページになります。
        </p>

        <div className="dform">
          <label>
            <span>企画の名前</span>
            <input value={d.title} onChange={(e) => set({ title: e.target.value })} maxLength={60} placeholder="例）ヒッチハイクで北欧へ" />
          </label>
          <label>
            <span>いつ（画面に出す言い方）</span>
            <input value={d.when} onChange={(e) => set({ when: e.target.value })} maxLength={40} placeholder="例）2026年9月11日(金) 23:30 出発" />
          </label>
          <label>
            <span>その日（あと何日かを数えるのに使う）</span>
            <input value={d.date} onChange={(e) => set({ date: e.target.value })} placeholder="2026-09-11" maxLength={10} />
          </label>
          <label>
            <span>ひとことで言うと</span>
            <textarea value={d.note} onChange={(e) => set({ note: e.target.value })} maxLength={200} rows={2} placeholder="例）陸路はぜんぶヒッチハイクでつなぐ、一方通行の旅。" />
          </label>
          <label>
            <span>ふだ（カンマ区切り）</span>
            <input
              value={d.tags.join(", ")}
              onChange={(e) => set({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6) })}
              placeholder="北欧, ヒッチハイク"
            />
          </label>
          <label>
            <span>場所</span>
            <input value={d.place.name} onChange={(e) => set({ place: { ...d.place, name: e.target.value } })} placeholder="例）ムタツミンダ公園" maxLength={60} />
          </label>
          <label>
            <span>場所の説明</span>
            <input value={d.place.area} onChange={(e) => set({ place: { ...d.place, area: e.target.value } })} placeholder="例）トビリシ・山の上" maxLength={60} />
          </label>
          <label>
            <span>地図のリンク</span>
            <input value={d.place.map} onChange={(e) => set({ place: { ...d.place, map: e.target.value } })} placeholder="https://maps.google.com/?q=..." />
          </label>

          <span className="dlabel">どんなものか（段落ごとに1つ）</span>
          {d.about.map((a, i) => (
            <textarea
              key={i}
              value={a}
              rows={3}
              maxLength={600}
              onChange={(e) => set({ about: d.about.map((x, j) => (j === i ? e.target.value : x)) })}
              placeholder="そこで何が起きるのか、なぜ面白いのかを書く"
            />
          ))}
          <button className="dadd" onClick={() => set({ about: [...d.about, ""] })}>段落を足す</button>

          <span className="dlabel">リンク（公式サイト・イベント情報）</span>
          {d.links.map((l, i) => (
            <div className="drow" key={i}>
              <input value={l.label} placeholder="名前" onChange={(e) => set({ links: d.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <input value={l.href} placeholder="https://" onChange={(e) => set({ links: d.links.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)) })} />
            </div>
          ))}
          <button className="dadd" onClick={() => set({ links: [...d.links, { label: "", href: "" }] })}>リンクを足す</button>

          <span className="dlabel">写真（借りたものは出どころを必ず書く）</span>
          {d.photos.map((ph, i) => (
            <div className="drow is-col" key={i}>
              <input value={ph.src} placeholder="画像のURL" onChange={(e) => set({ photos: d.photos.map((x, j) => (j === i ? { ...x, src: e.target.value } : x)) })} />
              <input value={ph.alt} placeholder="何が写っているか" onChange={(e) => set({ photos: d.photos.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)) })} />
              <input value={ph.credit} placeholder="出どころ（例: Wikimedia Commons CC BY-SA 4.0）" onChange={(e) => set({ photos: d.photos.map((x, j) => (j === i ? { ...x, credit: e.target.value } : x)) })} />
              <input value={ph.creditHref} placeholder="出どころのURL" onChange={(e) => set({ photos: d.photos.map((x, j) => (j === i ? { ...x, creditHref: e.target.value } : x)) })} />
            </div>
          ))}
          <button className="dadd" onClick={() => set({ photos: [...d.photos, { src: "", alt: "", credit: "", creditHref: "" }] })}>写真を足す</button>

          <span className="dlabel">SNSの埋め込み（Instagram の投稿IDか YouTube の動画ID）</span>
          {d.embeds.map((em, i) => (
            <div className="drow" key={i}>
              <select value={em.kind} onChange={(e) => set({ embeds: d.embeds.map((x, j) => (j === i ? { ...x, kind: e.target.value as "instagram" | "youtube" } : x)) })}>
                <option value="instagram">Instagram</option>
                <option value="youtube">YouTube</option>
              </select>
              <input value={em.id} placeholder="Dcku99gDfv9" onChange={(e) => set({ embeds: d.embeds.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)) })} />
            </div>
          ))}
          <button className="dadd" onClick={() => set({ embeds: [...d.embeds, { kind: "instagram", id: "", note: "" }] })}>埋め込みを足す</button>
        </div>

        <div className="dactions">
          <button className="me-save" onClick={save} disabled={state === "saving" || !d.title}>
            {state === "saving" ? "保存しています…" : "保存する"}
          </button>
          <button className="dadd" onClick={() => setSrc(toSource(d))}>
            Claude Code に渡す形で書き出す
          </button>
        </div>
        {state === "saved" && <p className="me-ok">保存しました。あやとに届いています。</p>}
        {state === "error" && <p className="err">保存できませんでした。もう一度どうぞ。</p>}

        {src && (
          <>
            <p className="muted" style={{ marginTop: 12 }}>
              これを <code>site/content/plans.ts</code> の <code>PLANS</code> に足す。
            </p>
            <pre className="dsrc">{src}</pre>
          </>
        )}

        {mine && mine.length > 0 && (
          <>
            <h3 className="sub">保存してある下書き</h3>
            <div className="chips">
              {mine.map((m) => (
                <button key={m.id} className="chip" onClick={() => setD({ ...EMPTY, ...m })}>
                  {m.title || "（名前なし）"}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h2>できあがり</h2>
        <p className="muted">書いたものが、そのままこの形でページに出ます。</p>
        <PlanCard plan={toPlan(d)} />
      </section>
    </>
  );
}
