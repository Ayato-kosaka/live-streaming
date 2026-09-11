"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCharacters,
  putCharacter,
  deleteCharacter,
  type Character,
  type CharacterUpload,
} from "@/lib/api";
import { useAuth, withRead, type Read } from "@/lib/auth";
import ReadAgain from "./ReadAgain";
import Icon from "@/components/ui/Icon";

/* キャラクターの絵と呼び名（#284 の C 群）。

   ## 原本がここに来た

   スプレッドシートの Viewers 表と、Google ドライブのフォルダ2つに割れて
   いたものを `islandCharacter` に寄せた。**割れていたころは、絵を1人ぶん
   足すのに表とドライブの両方を触る必要があって、片方だけ触ると
   「名前はあるのに絵が出ない人」が静かに増えた。**

   ## 旅先の親指で足せること

   あやとは17日間スマホ1台で、その間もキャラクターを作ると言っている。
   だから**この面だけで完結する**：絵を選ぶ・名前を打つ・呼び名を足す・
   保存する。ドライブにもスプレッドシートにも行かせない。 */

/** 置いておく幅。Functions 側の `WIDTHS` と同じ並び。 */
const WIDTHS = [128, 256, 640];

/** `full` の長辺の上限。**ここから両方の版を落として使う**ので、粗くしない。 */
const FULL_LONG = 2048;

/** 絵の役どころ。 */
type Role = "plain" | "scene";
const ROLE_NAME: Record<Role, string> = {
  plain: "背景なし",
  scene: "背景あり",
};

/**
 * 1枚を、幅ごとに焼く。
 *
 * ## `stamp.ts` の `shrink` を使わない理由
 *
 * あちらは webp が出ない端末で **jpeg に落とす**。旅の写真ならそれでいいが、
 * **背景なしの絵は透明を持っている。** jpeg に落ちた瞬間に背景が黒か白で
 * 塗り潰されて、島に「四角い板を背負った住人」が並ぶ。
 * だから、webp が出ないときの逃げ先を役どころで変える。
 *
 *   背景なし → png（透明が残る。絵が平らなので、写真ほど太らない）
 *   背景あり → jpeg（透明を持たないので、軽いほうを取る）
 *
 * ## 1回だけ解いて、そこから全部の幅を焼く
 *
 * 幅ごとに `createImageBitmap` を呼ぶと、4MB の元絵を4回解くことになる。
 * 走っている車の中の iPhone でそれをやると、目に見えて待つ。
 */
async function bake(
  file: File,
  role: Role,
): Promise<CharacterUpload | null> {
  let src: ImageBitmap | HTMLImageElement | null = null;
  try {
    /* スマホの縦写真は Exif の回転を持ったまま入ってくる。
       素朴に描くと倒れる（`stamp.ts` の `shrink` と同じ）。 */
    src = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    src = await new Promise<HTMLImageElement | null>((ok) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => ok(null);
      im.src = URL.createObjectURL(file);
    });
  }
  if (!src) return null;
  const sw = "width" in src ? src.width : 0;
  const sh = "height" in src ? src.height : 0;
  if (!sw || !sh) return null;

  /** 幅を決めて1枚焼く。返すのは base64 の中身だけ（data: の頭は落とす）。 */
  const one = (targetW: number): string | null => {
    const k = sw > targetW ? targetW / sw : 1;
    const w = Math.max(1, Math.round(sw * k));
    const h = Math.max(1, Math.round(sh * k));
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const g = cv.getContext("2d");
    if (!g) return null;
    g.drawImage(src as CanvasImageSource, 0, 0, w, h);
    let url = cv.toDataURL("image/webp", 0.92);
    if (!url.startsWith("data:image/webp")) {
      url = cv.toDataURL(role === "plain" ? "image/png" : "image/jpeg", 0.9);
    }
    return url.slice(url.indexOf(",") + 1);
  };

  /* `full` は長辺で抑える。縦長の絵を幅で抑えると、縦が 2048 を大きく
     超えて Functions 側の 8MB に当たることがある。 */
  const fullK = Math.max(sw, sh) > FULL_LONG ? FULL_LONG / Math.max(sw, sh) : 1;
  const full = one(Math.max(1, Math.round(sw * fullK)));
  if (!full) return null;

  const sizes: Record<string, string> = {};
  for (const w of WIDTHS) {
    /* **元より大きい幅は焼かない。** 引き伸ばしたものを置いても、
       置き場と回線を食うだけで、見た目は元のままより悪くなる。 */
    if (sw <= w) continue;
    const b = one(w);
    if (b) sizes[String(w)] = b;
  }
  return {
    full,
    sizes,
    w: Math.max(1, Math.round(sw * fullK)),
    h: Math.max(1, Math.round(sh * fullK)),
  };
}

/**
 * 1枚を端末に落とす。
 *
 * **`<a download>` だけでは足りない。** 絵は置き場（別のドメイン）に
 * あるので、`download` の指定は無視されて、ただそのページへ飛ぶ。
 * いったん取ってから blob にすると名前を付けて落とせる。
 * 取れなかったときは、新しい面で開くところまでは必ずやる
 * （スマホなら、そこから長押しで保存できる）。
 */
async function save(url: string, name: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

/** 絵の URL を、小さいほうから選ぶ。無ければ元のまま。 */
const thumb = (c: Character, role: Role) => {
  const p = c[role];
  if (!p) return null;
  return p.sizes?.["128"] ?? p.sizes?.["256"] ?? p.url ?? null;
};

/** 打ったものと当たるか。名前と呼び名の**どちらでも**探せるようにする。 */
const hit = (c: Character, q: string) => {
  if (!q) return true;
  const n = q.trim().toLowerCase();
  return (
    c.channelName.toLowerCase().includes(n) ||
    c.aliases.some((a) => a.toLowerCase().includes(n)) ||
    c.lookupKeys.some((k) => k.includes(n))
  );
};

/** 編集中の1人。**新しく作るときは `id` が空。** */
type Draft = {
  id: string;
  channelName: string;
  emoji: string;
  aliases: string[];
  /** 選び直したぶんだけ入る。触っていない役どころは送らない */
  files: Partial<Record<Role, File>>;
};

const EMPTY: Draft = {
  id: "",
  channelName: "",
  emoji: "",
  aliases: [],
  files: {},
};

/**
 * キャラクター。**あやとだけ。**
 *
 * 一覧（図鑑）から1人を押すと、その場で開いて直せる。別の面へ飛ばさない
 * のは、旅先で「戻る」を押すたびに一覧を引き直すことになるため。
 */
export default function Characters() {
  const { token, owner } = useAuth();
  const [rows, setRows] = useState<Character[]>([]);
  const [read, setRead] = useState<Read>("wait");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [err, setErr] = useState("");
  const [alias, setAlias] = useState("");
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async (again = false) => {
      if (again) setRead("wait");
      try {
        const t = await token();
        const r = await withRead(getCharacters(t));
        if (!alive.current) return;
        setRows(r.characters ?? []);
        setRead("ok");
      } catch {
        if (alive.current) setRead("down");
      }
    },
    [token],
  );

  useEffect(() => {
    if (owner === "yes") void load();
  }, [owner, load]);

  const shown = useMemo(() => {
    const list = rows.filter((c) => hit(c, q));
    /* **直したばかりの人を先に出す。** 旅先で1人直したあと、
       同じ人をもう一度開くのがいちばん多い（絵を入れ替えて見直す）。 */
    return list.sort((a, b) => (b.editedAt ?? "").localeCompare(a.editedAt ?? ""));
  }, [rows, q]);

  const open = (c: Character) =>
    setDraft({
      id: c.id,
      channelName: c.channelName,
      emoji: c.emoji,
      aliases: [...c.aliases],
      files: {},
    });

  const cur = draft?.id ? rows.find((c) => c.id === draft.id) ?? null : null;

  const send = async () => {
    if (!draft) return;
    setBusy(true);
    setErr("");
    setDone("");
    try {
      const t = await token();
      if (!t) throw new Error("入り直してください");

      /* **役どころを1つずつ送る。** 2048px を2枚まとめると、
         base64 にした本体が数MBになって、細い電波で落ちる。
         Functions 側は送ったぶんだけ差し替えるので、分けて送っても
         触っていない役どころは消えない。 */
      const roles = (["plain", "scene"] as Role[]).filter((r) => draft.files[r]);
      const first = roles.shift();
      let out = await putCharacter(
        {
          id: draft.id || undefined,
          channelName: draft.channelName.trim(),
          emoji: draft.emoji.trim(),
          aliases: draft.aliases,
          ...(first
            ? { [first]: (await bake(draft.files[first]!, first)) ?? undefined }
            : {}),
        },
        t,
      );
      for (const r of roles) {
        out = await putCharacter(
          {
            id: out.character.id,
            channelName: draft.channelName.trim(),
            emoji: draft.emoji.trim(),
            aliases: draft.aliases,
            [r]: (await bake(draft.files[r]!, r)) ?? undefined,
          },
          t,
        );
      }
      if (!alive.current) return;
      setRows((was) => {
        const next = was.filter((c) => c.id !== out.character.id);
        return [out.character, ...next];
      });
      setDraft(null);
      setDone("入れました");
    } catch (e) {
      if (alive.current) setErr(String(e instanceof Error ? e.message : e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const drop = async () => {
    if (!draft?.id) return;
    if (!window.confirm(`${draft.channelName || draft.id} を消します。絵も消えます。`)) {
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const t = await token();
      if (!t) throw new Error("入り直してください");
      await deleteCharacter(draft.id, t);
      if (!alive.current) return;
      setRows((was) => was.filter((c) => c.id !== draft.id));
      setDraft(null);
      setDone("消しました");
    } catch (e) {
      if (alive.current) setErr(String(e instanceof Error ? e.message : e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  if (draft) {
    return (
      <div className="dform mp-tool ch-edit">
        <button className="ch-back" onClick={() => setDraft(null)}>
          <Icon name="left" /> 図鑑へもどる
        </button>

        <label className="nph-post-row">
          <span>チャンネル名</span>
          <input
            value={draft.channelName}
            placeholder="スパチャに出てくる名前"
            onChange={(e) =>
              setDraft({ ...draft, channelName: e.target.value })
            }
          />
        </label>

        <label className="nph-post-row">
          <span>絵文字</span>
          <input
            value={draft.emoji}
            placeholder="🐧"
            maxLength={8}
            onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
          />
        </label>

        <div className="nph-post-row">
          <span>ほかの呼び名</span>
          <div className="ch-aliases">
            {draft.aliases.map((a, i) => (
              <button
                key={`${a}-${i}`}
                className="ch-alias"
                onClick={() =>
                  setDraft({
                    ...draft,
                    aliases: draft.aliases.filter((_, j) => j !== i),
                  })
                }
              >
                {a} <Icon name="close" />
              </button>
            ))}
          </div>
          <div className="ch-alias-add">
            <input
              value={alias}
              placeholder="Doneru で名乗っている名前など"
              onChange={(e) => setAlias(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !alias.trim()) return;
                e.preventDefault();
                setDraft({ ...draft, aliases: [...draft.aliases, alias.trim()] });
                setAlias("");
              }}
            />
            <button
              className="trip-week-plus"
              disabled={!alias.trim()}
              onClick={() => {
                setDraft({ ...draft, aliases: [...draft.aliases, alias.trim()] });
                setAlias("");
              }}
            >
              足す
            </button>
          </div>
        </div>

        {(["plain", "scene"] as Role[]).map((role) => {
          const now = cur?.[role];
          const picked = draft.files[role];
          return (
            <div className="ch-pic" key={role}>
              <span className="ch-pic-h">{ROLE_NAME[role]}</span>
              {now?.url && !picked && (
                <img
                  className="ch-pic-now"
                  src={thumb(cur!, role) ?? now.url}
                  alt=""
                />
              )}
              {picked && <p className="ch-pic-new">{picked.name} を入れます</p>}
              <div className="ch-pic-row">
                <label className="ch-pick">
                  {now?.url || picked ? "入れ替える" : "選ぶ"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setDraft({ ...draft, files: { ...draft.files, [role]: f } });
                    }}
                  />
                </label>
                {now?.url && (
                  <button
                    className="ch-get"
                    onClick={() =>
                      save(now.url!, `${draft.channelName || draft.id}-${role}`)
                    }
                  >
                    <Icon name="download" /> 落とす
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <button className="mp-send" disabled={busy} onClick={send}>
          {busy ? "入れています…" : draft.id ? "直す" : "作る"}
        </button>
        {draft.id && (
          <button className="ch-drop" disabled={busy} onClick={drop}>
            この人を消す
          </button>
        )}
        {err && <p className="err">{err}</p>}
      </div>
    );
  }

  return (
    <div className="dform mp-tool ch-list">
      <div className="ch-top">
        <input
          className="ch-find"
          value={q}
          placeholder="名前でさがす"
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="trip-week-plus" onClick={() => setDraft({ ...EMPTY })}>
          <Icon name="plus" /> 作る
        </button>
      </div>

      {done && <p className="nph-ok">{done}</p>}
      {read === "down" && (
        <ReadAgain what="キャラクター" onRetry={() => load(true)} />
      )}
      {read === "wait" && <p className="trip-week-none">読んでいます…</p>}
      {read === "ok" && shown.length === 0 && (
        <p className="trip-week-none">
          {q ? "その名前の人はいません。" : "まだ1人もいません。"}
        </p>
      )}

      <div className="ch-grid">
        {shown.map((c) => {
          const src = thumb(c, "plain") ?? thumb(c, "scene");
          return (
            <button key={c.id} className="ch-cell" onClick={() => open(c)}>
              {src ? (
                <img src={src} alt="" loading="lazy" />
              ) : (
                <span className="ch-cell-none">絵なし</span>
              )}
              {c.emoji && <span className="ch-cell-emoji">{c.emoji}</span>}
              <span className="ch-cell-name">{c.channelName || "名前なし"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
