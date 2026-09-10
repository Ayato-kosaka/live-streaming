"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  EMPTY_PLAN,
  PLAN_STATUS_NAME,
  canEditPlan,
  getNextPlan,
  getNextPlans,
  myPlans,
  planEditHoursLeft,
  postNextPlan,
  rememberMyPlan,
  saveNextPlan,
  type NextPlan,
  type NextPlanInput,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useOwner } from "@/components/nordic/log";
import Icon from "@/components/ui/IconCore";
import PlanCard from "./PlanCard";
import type { Plan } from "@/content/plans";

/**
 * 企画のページを書く道具（#161）。
 *
 * ## 何が変わったのか
 *
 * 前はここが `islandDrafts` の下書き置き場で、**ログイン必須のうえ、
 * あやとが「書いていいよ」と決めた人しか書けなかった。** そして掲示板の
 * 一言（`islandIdeas`）とは別の入れ物だったので、一言を出した人が
 * ここへ来ても、書いたものを持ってこられなかった。
 *
 * 入れ物を1つにしたので（`islandNextPlans`）、ここは
 * **「掲示板で出した企画を、あとから育てるところ」**になった。
 * `?id=…` を付けて来ると、その企画の続きから書ける。
 * 何も付けずに来た人は、はじめからページ1枚ぶん書ける。ログインは要らない。
 *
 * ## 直せる時間（あやと承認済み）
 *
 * ログインしていれば、自分が出したものはいつでも直せる。
 * していなければ、本人の証は端末の印（`cid`）しか無いので **24時間だけ**。
 * この画面はそれを**押す前に**言う。押してから 403 を見せない。
 */

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 「2026-9-11」のような桁の揃っていない日付を「2026-09-11」に直す。
 *
 * **`<input type="date">` は桁の揃っていない値を受け取らない。** 空の欄が出て、
 * せっかく書いてあった日が消えたように見える。すでに入っているものも
 * ここを通してから欄に載せる。日付として読めないものは空。
 */
function toDay(v: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec((v || "").trim());
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/**
 * 日付から、画面に出す言い方を作る。
 *
 * 「2026-09-11」と「2026年9月11日」を別々に手で打たせていたので、
 * あやとの2件が「2026年9月11日」と「2026年09月11日」で揺れた。
 * 選んだ日から作れば揺れない。曜日まで出すのは、出発の予定を
 * 見る人がいちばん先に知りたいのがそこだから。
 */
function sayDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // ローカル時刻で作ると、日付だけの値が前日にずれる端末がある
  const w = WEEKDAY[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return `${y}年${mo}月${d}日(${w})`;
}

/** 言い方の頭にある日付。ここだけを差し替えて、書き足した字は残す。 */
const SAID_DAY = /^\d{4}年\d{1,2}月\d{1,2}日(?:\([日月火水木金土]\))?/;

/** 下書きを Plan の形に読み替える。プレビューは本番と同じ部品で描く。 */
function toPlan(d: NextPlanInput): Plan {
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

/** content/plans.ts に貼れる形に書き出す。**あやとが仕上げるときの道具。** */
function toSource(d: NextPlanInput): string {
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

/** サーバーから来た企画を、書く欄の形に落とす。 */
const toInput = (p: NextPlan): NextPlanInput => ({
  id: p.id,
  title: p.title,
  when: p.when,
  date: toDay(p.date),
  note: p.note,
  tags: p.tags,
  place: p.place,
  about: p.about.length ? p.about : [""],
  links: p.links,
  photos: p.photos,
  embeds: p.embeds,
  by: p.by,
});

export default function NextPlanEditor() {
  const { user, token } = useAuth();
  const owner = useOwner();
  const [d, setD] = useState<NextPlanInput>({ ...EMPTY_PLAN, about: [""] });
  /** いま開いている企画。新しく書いているあいだは null */
  const [cur, setCur] = useState<NextPlan | null>(null);
  /** じぶんが出した企画。育てる先を選ばせるために引く */
  const [mineList, setMineList] = useState<NextPlan[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "saving" | "saved" | "error">("idle");
  /** 直せない理由。**押す前に言う。** */
  const [locked, setLocked] = useState<"expired" | "no" | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [mine, setMine] = useState<Set<string>>(new Set());

  /** 開いた企画を、書く欄に載せる。直せるかどうかもここで決める。 */
  const open = useCallback(
    (p: NextPlan, ids: Set<string>) => {
      setCur(p);
      setD(toInput(p));
      const can = canEditPlan(p, user?.uid, ids);
      setLocked(can === "ok" ? null : can);
    },
    [user],
  );

  /* `?id=` は `window.location` から読む。**静的書き出しなので、
     ここでフックを使うと面がまるごとクライアント任せになる。** */
  useEffect(() => {
    const ids = myPlans();
    setMine(ids);
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;
    setState("loading");
    getNextPlan(id)
      .then((r) => {
        open(r.plan, ids);
        setState("idle");
      })
      .catch(() => setState("error"));
  }, [open]);

  /* じぶんが出したもの。端末の控えとログインの両方から拾う。
     一覧を1回引いて手元で絞る（1件ずつ聞くと、出した数だけ往復する）。 */
  useEffect(() => {
    getNextPlans()
      .then((r) => {
        const ids = myPlans();
        setMineList(
          r.plans.filter((p) => ids.has(p.id) || (!!user && p.byUid === user.uid)),
        );
      })
      .catch(() => setMineList([]));
  }, [user]);

  const set = (patch: Partial<NextPlanInput>) => setD((v) => ({ ...v, ...patch }));

  /**
   * 日を選ぶ。**「いつ（言い方）」の日付のところも、いっしょに書きかえる。**
   *
   * 同じ日を2回打たせると、片方だけ直して食い違う（あやとの2件がそうなった）。
   * ただし **書き足した字は消さない。** 頭の日付だけを差し替えるので、
   * 「2026年10月1日(木) 23:30 出発」は「23:30 出発」を残したまま日が変わる。
   * 日付で始まっていない言い方（「桜が咲くころ」）には触らない。
   */
  const pickDay = (v: string) => {
    const say = sayDay(v);
    setD((x) => {
      const when = !x.when.trim() ?
        say :
        SAID_DAY.test(x.when) ?
          x.when.replace(SAID_DAY, say) :
          x.when;
      return { ...x, date: v, when };
    });
  };

  const save = async () => {
    setState("saving");
    try {
      const t = await token();
      const body = { ...d, by: user ? undefined : name.trim() || d.by };
      const r = d.id ?
        await saveNextPlan(d.id, body, t) :
        await postNextPlan(body, t);
      rememberMyPlan(r.plan.id);
      const ids = new Set([...mine, r.plan.id]);
      setMine(ids);
      setCur(r.plan);
      setD((v) => ({ ...v, id: r.plan.id }));
      setState("saved");
      /* 新しく出したものは、この面の URL にも残す。
         **書いたあと更新すると消える**のを止める（1度ここで失っている）。 */
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `?id=${r.plan.id}`);
      }
    } catch (e) {
      const why = String(e);
      if (why.includes("expired")) setLocked("expired");
      else if (why.includes("not yours")) setLocked("no");
      setState("error");
    }
  };

  const hours = cur && !cur.byUid ? planEditHoursLeft(cur) : 0;

  return (
    <>
      <section className="panel paper">
        <h2>{cur ? "この企画を、そだてる" : "企画のページを作る"}</h2>
        {/* 書けない人にこの案内を出さない。すぐ下に「もう直せません」が出るので、
            「あとから足せます」と並ぶと、どちらが本当なのか分からなくなる。 */}
        {!locked && (
          <p className="muted">文章の整えと見た目は、あやとが仕上げます。</p>
        )}

        {/* いま開いている企画が、どの段にいるか。**掲示板と同じ言い方をする。** */}
        {cur && (
          <div className="chips" style={{ marginBottom: "var(--sp-3)" }}>
            <span className="chip">{PLAN_STATUS_NAME[cur.status]}</span>
            <span className="chip">ハート {cur.hearts}</span>
            {cur.by && <span className="chip">{cur.by} さん</span>}
          </div>
        )}

        {/* 直せる時間。**押す前に言う。** ログインしていない人には、
            端末の印しか本人の証が無いので、書いた直後の窓だけを開けてある。 */}
        {locked === "expired" && (
          <div className="blank is-off">
            <b>この企画は、もう直せません</b>
            <p>
              直したいことがあれば、配信で言ってください。
            </p>
          </div>
        )}
        {locked === "no" && (
          <div className="blank is-off">
            <b>これは、ほかの人が出した企画です</b>
            <p>
              言いたいことがあれば、掲示板の付箋へどうぞ。
            </p>
          </div>
        )}
        {!locked && cur && !cur.byUid && hours > 0 && (
          <p className="muted">
            この企画を直せるのは、あと{hours}時間です。ログインして出すと、あとからでも直せます。
          </p>
        )}

        {state === "loading" && <p className="muted">読みこんでいます…</p>}

        {!locked && (
          <>
            <div className="dform">
              {!user && (
                <label>
                  <span>名前（書かなくてもいい）</span>
                  <input
                    value={name || d.by || ""}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={20}
                    placeholder="呼ばれたい名前"
                  />
                </label>
              )}
              <label>
                <span>企画の名前</span>
                <input value={d.title} onChange={(e) => set({ title: e.target.value })} maxLength={60} placeholder="例）ヒッチハイクで北欧へ" />
              </label>
              <label>
                <span>その日</span>
                <input className="dday" type="date" value={d.date} onChange={(e) => pickDay(e.target.value)} />
              </label>
              <label>
                <span>いつ</span>
                <input value={d.when} onChange={(e) => set({ when: e.target.value })} maxLength={40} placeholder="例）2026年9月11日(金) 23:30 出発" />
                <span className="dnote">時刻も書きたせる。</span>
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
              <button className="me-save" onClick={save} disabled={state === "saving" || d.title.trim().length < 4}>
                {state === "saving" ? "保存しています…" : cur ? "書きたす" : "出す"}
              </button>
              {/* 書き出しはあやとの道具。仕上げるときにしか使わないので、
                  書きに来た人の前には置かない（押しどころを1つ減らす）。 */}
              {owner && (
                <button className="dadd" onClick={() => setSrc(toSource(d))}>
                  content/plans.ts に貼る形で書き出す
                </button>
              )}
            </div>
            {state === "saved" && (
              <>
                <p className="me-ok">保存しました。掲示板にも出ています。</p>
                {/* 行き先は板。押せるので板の札にする（`docs/island-world.md` 2.1）。
                    文中の字にすると、色も下線も付いていないので押せると分からない。 */}
                <Link className="bd-go" href="/board" prefetch={false}>
                  みんなの板を見る
                  <Icon name="right" size={13} />
                </Link>
              </>
            )}
            {state === "error" && !locked && <p className="err">保存できませんでした。もう一度どうぞ。</p>}

            {src && (
              <>
                <p className="muted" style={{ marginTop: "var(--sp-3)" }}>
                  これを <code>site/content/plans.ts</code> の <code>PLANS</code> に足す。
                </p>
                <pre className="dsrc">{src}</pre>
              </>
            )}
          </>
        )}

        {/* じぶんが出した企画。**育てる先をここから選ぶ。**
            ログインしていない人は端末の控えから、している人は uid からも拾う。 */}
        {mineList && mineList.length > 0 && (
          <>
            <h3 className="sub">じぶんが出した企画</h3>
            <div className="chips">
              {mineList.map((p) => (
                <button key={p.id} className="chip link" onClick={() => open(p, mine)}>
                  {p.title || "（名前なし）"}
                  <Icon name="right" size={12} />
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {!locked && (
        <section className="panel paper">
          <h2>できあがり</h2>
          <PlanCard plan={toPlan(d)} />
        </section>
      )}
    </>
  );
}
