/**
 * 図鑑（`/friends`）の「もらったカード」欄から、**その人のカードぜんぶへ
 * 行けるか**を見る。
 *
 *   node tools/sprites/cardgo.mjs                    # 本番の面。**ビルド要らず**（既定）
 *   ORIGIN=https://… node tools/sprites/cardgo.mjs   # 向け先を変える
 *
 *   tools/build.sh 3170                              # 手元の書き出しを見るとき
 *   python3 -m http.server 4170 --directory site/.next-3170 &
 *   PORT=4170 node tools/sprites/cardgo.mjs
 *
 * 0＝通った / 1＝行けない人がいた・札の字が行き先と食い違っていた /
 * 2＝数えるものが無い（本番の口が引けない・図鑑が出ない・外に出られなかった
 *   先がある・対照が外れた）
 *
 * ## 既定は本番。手元の書き出しは `PORT=` を渡したときだけ
 *
 * 立てた日（#587）は `localhost` しか開けなかった。**誰かが先にビルドしない
 * かぎり、この見張りは一度も走らない**——`ERR_CONNECTION_REFUSED` で落ちるだけ。
 * 人が居ないと走らない見張りは、無いのと同じ。なので**既定を本番**にした。
 *
 * 向け先の決め方は `kdfit.mjs` と同じ形にしてある。あちらは `ORIGIN=` を
 * 渡したときだけ本番を見る（手元が既定）。ここは**逆向き**で、`ORIGIN` は
 * 前から**口を引く先**として既定を持っている（数えるもとは、いつでも本番の
 * 口から取る）。だから**渡されたほう＝在りかを名指ししたほう**を見る、という
 * 同じ決め方で `PORT=` があれば手元、無ければ本番にした。
 * 前からの `PORT=4170 node …` は、そのまま今までどおり動く。
 *
 * **面の名前は拡張子で分かれる。** 静的に配ったものは `.html` を付けないと
 * 引けないが、本番の Hosting は拡張子なしで配る（`kdfit.mjs` と同じ）。
 *
 * **この箱のブラウザは本番に直接届かない**（proxy が ERR_CONNECTION_RESET）。
 * `prod.mjs` の `viaCurl(ctx)` に要求を横取りさせて curl から取る。
 * 止めた先・たどった先・小さすぎた本文は**表に出して、止めた先が1つでも
 * あれば数字を出さずに 2 で止まる。** 通っていない先があると、面は壊れるのでは
 * なく**飢える**——束ねた JS が1本来ないだけで図鑑は0マスになり、
 * 「行けない人 0件」という嘘の合格になる（#157）。
 *
 * **住人の絵は本番モードでも `offline` で差し替える。** ここは画素ではなく
 * **どこへ行けるか**を数える道具なので、本物の絵は要らない（`kdfit.mjs` が
 * 差し替えないのは、あちらが画素を測るから）。**`viaCurl` より後に登録する**
 * ——Playwright はあとに登録した route から当てる。
 *
 * ## なぜ要るか
 *
 * 欄は「この人がもらったカード」なのに、下に置いてあった字は
 * 「あやと島カードを、ぜんぶ見る」で、**行き先は島ぜんぶの一覧**だった。
 * 出ていたのは先頭2枚だけなので、**3枚目から先へ行く道が1本も無い。**
 * 本番の387枚で数えると、3枚以上持っている人は22人中17人いた。
 *
 * **見つけたのは人の目で、機械は1つも鳴っていなかった。** 字と行き先が
 * 食い違っても、巡回（`crawl.mjs`）は「リンク切れ0」と言う。行き先は
 * 生きているし、字も日本語として通っているので。
 *
 * ## 何を見るか（足は2本）
 *
 *   1. **たどれるか** — 欄を開いて、押せるだけ押して、出てきた枚数が
 *      口（`GET /cards`）の言う枚数とそろうか。1人ずつ当てる
 *   2. **札の字** — 欄の中の行き先が、**その人のカード以外**へ送っていないか。
 *      「この人のカード」と読める字で島ぜんぶへ送るものを落とす
 *
 * ## 数えるもとは、本番の口から取る
 *
 * 差し込み（`asme.mjs`）のカードは1人3枚までなので、**43枚の人が居ない。**
 * 溜まったときに壊れるものを、溜まっていない種で測ることになる。
 * だから本番の `/cards` と `/characters` を curl で1回引いて、
 * **名前は落として**（この箱に素性を残さない）画面へ返す。
 * 引けない箱では、数字を出さずに 2 で止まる。
 *
 * ## 対照（`BREAK=`）
 *
 * `BREAK=cut2` … 直す前の姿。3枚目から先と押しどころを隠す
 * `BREAK=golink` … 欄に「この人のカードを、ぜんぶ見る」を置いて `/cards` へ送る
 *
 * どちらも**当てると落ちる**（1）。当てずに落ちないことも毎回見る——
 * 片側だけは対照ではない（`docs/island-standards.md` §15）。
 * **足は1本ずつ折る。** `cut2` はたどれるかだけ、`golink` は札の字だけを
 * 落とす（本番の実測で 17件 / 22件、もう一方は 0件）。2本まとめて落ちる対照は、
 * 死んだ足を隠す（`docs/island-misses.md` #128）。
 *
 * 本番モードには足がもう1本ある。**通していない先があると面は飢える**ので、
 * そこに気づけるかを `STARVE=` で確かめる（`kdfit.mjs` と同じ形）。
 *
 *   STARVE='_next/static' node tools/sprites/cardgo.mjs   # 2 で落ちる
 *
 * 止められるのは **curl が運んでいるもの**（面と、束ねた JS）だけ。絵と口は
 * あとから登録した差し替えが受けるので、ここでは止まらない——そこは
 * 手元のファイルから来ていて、外に出ていないので飢えようが無い。
 *
 * ## 判定そのものは、毎 PR で回る
 *
 * この道具は**書き出しとブラウザと本番の口**が要るので、PR ごとには回せない
 * （34秒＋書き出し1分10秒。2026-09-19 実測）。回らないあいだに腐るのは
 * **判定の側**なので、判定だけを関数に出して
 * `tools/sprites/cardgo_selftest.mjs` から毎 PR で当てている
 * （`preclaim.mjs` と同じ形）。判定にも `BREAK=` があり、
 * `nolabel` / `nogap` を当てると足が1本ずつ折れる。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { blocked, redirects, thin, viaCurl } from "./prod.mjs";
import { goesElsewhere, reachGap, verdict } from "./cardgojudge.mjs";


/** この本を直に回したときだけ、本番を見に行く */
const RUN =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (RUN) {
  /** 渡されたら手元の書き出しを見る。**空なら本番**（既定） */
  const PORT = process.env.PORT || "";
  /** 口を引く先。面も（`PORT` が無ければ）ここから開く */
  const ORIGIN = (process.env.ORIGIN || "https://live-streaming-d3cac.web.app").replace(/\/$/, "");
  const HERE = Boolean(PORT);
  /* 静的に配ったものは `.html` が要るが、本番の Hosting は拡張子なしで配る。
     間違えると 404 を掴んで「図鑑のマスが0」になり、出ているものが壊れて見える */
  const PAGE = HERE ? `http://localhost:${PORT}/friends.html` : `${ORIGIN}/friends`;
  /** curl 経由は1本ずつ取ってくるので、本番は待ちを長く取る */
  const TMO = HERE ? 15000 : 120000;
  const OUT = process.env.OUT || join(tmpdir(), "cardgo");
  const BREAK = process.env.BREAK || "";
  /** 対照の足。本番モードでこの先を止めて、**飢えに気づくか**を見る */
  const STARVE = process.env.STARVE || "";
  /* **手元モードでは、この足は付いていない。** localhost しか叩かないので
     止める先が無く、当てても緑のまま通る。**緑を「足が効いた」と読まれると、
     死んだ足をそのまま置くことになる**ので、当てられた時点で止める */
  if (STARVE && HERE) {
    console.error("見つからなかった: STARVE= は本番モードの足です（PORT= を外してください）");
    process.exit(2);
  }
  const SHOT = process.env.SHOT === "1";
  mkdirSync(OUT, { recursive: true });

  /** 数えるものが無かった。**空でなければ 2 で落ちる。** */
  const missing = [];
  /** 見つけた食い違い。**空でなければ 1 で落ちる。** */
  const bad = [];

  /** 本番の口を1回だけ引く。引けなければ 2（0件として先へ進まない）。 */
  function fromProd(path) {
    try {
      const raw = execFileSync("curl", ["-sS", "--max-time", "60", `${ORIGIN}/island-api${path}`], {
        maxBuffer: 1 << 26,
      });
      return JSON.parse(raw);
    } catch (e) {
      missing.push(`本番の ${path} が引けない（${String(e).slice(0, 80)}）`);
      return null;
    }
  }

  const prodCards = fromProd("/cards");
  const prodChars = fromProd("/characters");
  if (!prodCards || !prodChars) {
    console.error(`見つからなかった: ${missing.join(" / ")}`);
    process.exit(2);
  }

  /* **名前は落とす。** 公開の口はいま `name: null` を返すが、返す日が来ても
     この箱の画面とログに素性を出さない（`asme.mjs` の `CHARACTERS` と同じ）。 */
  const CARDS = (prodCards.cards ?? []).map((c) => ({ ...c, name: null }));
  const CHARS = (prodChars.characters ?? []).map((c, i) => ({
    ...c,
    channelName: `@みほん${i + 1}`,
    channelId: null,
  }));

  /** 図鑑に並ぶ人。**並び順は画面から読む**（下の `AT`）。 */
  const IN = new Set(CHARS.map((c) => c.id));
  /** 絵の id → 枚数。**図鑑に並ばない人のカードは、画面に出しようが無い** */
  const HAVE = new Map();
  let 図鑑に居ない = 0;
  for (const c of CARDS) {
    if (!c.icon) continue;
    if (!IN.has(c.icon)) {
      図鑑に居ない += 1;
      continue;
    }
    HAVE.set(c.icon, (HAVE.get(c.icon) ?? 0) + 1);
  }
  const 持っている人 = [...HAVE.entries()].sort((a, b) => b[1] - a[1]);
  const 枚数 = 持っている人.map(([, n]) => n);
  const median = (v) => {
    const s = [...v].sort((a, b) => a - b);
    if (!s.length) return 0;
    const h = s.length >> 1;
    return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
  };
  console.log(
    "本番の口:",
    JSON.stringify({
      図鑑の人: CHARS.length,
      カード: CARDS.length,
      持っている人: 持っている人.length,
      図鑑に居ない人のカード: 図鑑に居ない,
      中央値: median(枚数),
      いちばん多い人: 枚数[0] ?? 0,
      "3枚以上の人": 枚数.filter((n) => n >= 3).length,
    }),
  );
  if (!CHARS.length) missing.push("本番の図鑑が0人");
  if (!持っている人.length) missing.push("カードを持っている人が0人");
  if (!枚数.some((n) => n >= 3)) missing.push("3枚以上持っている人が居ない（畳みを試せない）");

  const stop = async (b, code, msg) => {
    console.error(msg);
    if (b) await b.close();
    process.exit(code);
  };

  if (missing.length) await stop(null, 2, `見つからなかった: ${missing.join(" / ")}`);

  const b = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });
  const ctx = await b.newContext({
    viewport: { width: Number(process.env.W || 390), height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  /* **本番モードは curl 越しに取る。** この箱のブラウザは本番に届かない。
     **いちばん先に登録する**——あとから登録した route が先に当たるので、
     下の差し替え（絵・口）が全部こちらより優先される */
  if (!HERE) {
    await viaCurl(ctx);
    if (STARVE) {
      /* **`viaCurl` が使っているのと同じ数えもの**に足す（`blocked()` は写しではなく
         本体を返す）。別の数えものを立てると、通してあるのに気づかない穴を
         そのまま残すことになる */
      await ctx.route(new RegExp(STARVE), (r) => {
        const m = blocked(ctx);
        const h = (() => {
          try {
            return new URL(r.request().url()).host;
          } catch {
            return STARVE;
          }
        })();
        m.set(h, (m.get(h) || 0) + 1);
        return r.abort();
      });
    }
  }
  // キャラクターの絵は落としてあるものを1人ずつ返す（`avatars.py` / `chars.py`）
  await offline(ctx);

  /* 旅の写真は置き場（firebasestorage）にある。**この箱からは出られない。**
     `offline` があとから来る絵をまとめて受けるので、**写真だけ**を横取りして
     1枚ずつ違う絵を返す（同じ絵で埋めると、並びを見ても何も分からない）。
     **`offline` より後に登録する**——Playwright はあとに登録した route から当てる。 */
  await ctx.route(/firebasestorage\.googleapis\.com/, (r) => {
    const m = /photos%2F(?:[^%]*%2F)?([^.%]+)\.jpe?g/.exec(r.request().url());
    if (!m) return r.fallback();
    let v = 0x811c9dc5;
    for (let i = 0; i < m[1].length; i++) v = Math.imul(v ^ m[1].charCodeAt(i), 0x01000193) >>> 0;
    v ^= v >>> 15;
    v = Math.imul(v, 0x2545f491) >>> 0;
    v ^= v >>> 13;
    const h = v % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
      <rect width="1200" height="1600" fill="hsl(${h},42%,38%)"/>
      <rect y="1100" width="1200" height="500" fill="hsl(${(h + 24) % 360},38%,26%)"/>
      <circle cx="900" cy="320" r="150" fill="hsl(${(h + 40) % 360},60%,72%)"/>
    </svg>`;
    r.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      headers: { "access-control-allow-origin": "*" },
      body: svg,
    });
  });

  /** カードの口を落として開くか。**0枚と見分けが付くか**を見るときに立てる */
  let cardsDown = false;

  await ctx.route(/\/island-api\//, (r) => {
    const path = new URL(r.request().url()).pathname.replace("/island-api", "");
    // 絵は差し替えない。`offline` に渡す
    if (/^\/characters\/[^/]+\/(plain|scene)-[\w]+\.webp$/.test(path)) return r.fallback();
    const json = (body, status = 200) =>
      r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/characters") return json({ characters: CHARS, total: CHARS.length });
    if (path === "/cards") {
      if (cardsDown) return json({ error: "down" }, 503);
      return json({ cards: CARDS });
    }
    /* 図鑑がほかに読む口（`/state` など）は、**落ちた形で返す。**
       「読めなかった」の欄は元から出ない作りなので、ここが出るか出ないかは
       この道具の見るところではない（見ているのはカードの欄だけ）。 */
    return json({ error: "notfound" }, 404);
  });

  /**
   * **飢えていないか。** 止めた先・たどった先・小さすぎた本文を表に出して、
   * 止めた先が1つでもあれば `missing` に入れる（＝数字を出さずに 2）。
   *
   * 取れなかった束ねた JS の先には**図鑑そのものが出ない**ので、
   * 「行けない人 0件」という合格に化ける（#157）。手元モードでは何も見ない
   * （localhost しか叩かないので、止める先が無い）。
   */
  const fed = (label) => {
    if (HERE) return;
    for (const [from, to] of redirects(ctx)) console.log(`   ⇢ ${label} たどった ${from} → ${to}`);
    for (const [u, n] of thin(ctx)) missing.push(`${label} 本文が ${n}B しかない: ${u}`);
    for (const [host, n] of blocked(ctx)) {
      missing.push(`${label} 外に出られなかった先: ${host} ×${n}（prod.mjs の PASS を見る）`);
    }
  };

  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));

  /** 図鑑を開いて、マスが並ぶまで待つ。**本番は curl 越しなので待ちが長い** */
  async function openFriends(after = 600) {
    const res = await p
      .goto(PAGE, { waitUntil: HERE ? "networkidle" : "domcontentloaded", timeout: TMO })
      .catch(() => null);
    if (!res || res.status() >= 400) {
      missing.push(`${PAGE} が開けません（${res ? res.status() : "届かない"}）`);
    }
    await p.waitForSelector(".rzk-cell", { timeout: TMO }).catch(() => {});
    if (after) await p.waitForTimeout(after);
  }

  /**
   * 直す前の姿を作り直す（対照）。
   *
   * **React が持っている節を取り除かない。** 消すと次の描き直しで React が
   * 自分の子を見失って、面ごと真っ白になる（実際にそうなって、判定ではなく
   * 例外で 1 が返っていた。**落ちた理由が違えば対照ではない**）。
   * 2枚で切るほうは、紙（`<style>`）を1枚かぶせて隠す。
   *
   * @param {import("playwright-core").Page} page
   * @param {string} how `cut2` = 3枚目から先と押しどころを隠す（直す前の姿） /
   *   `golink` = その人のカードと読める字で `/cards` へ送る
   */
  const breakField = (page, how) =>
    page.evaluate((h) => {
      if (h === "cut2") {
        if (document.getElementById("cardgo-break")) return true;
        const st = document.createElement("style");
        st.id = "cardgo-break";
        st.textContent =
          ".rzk-cards .akd-grid > *:nth-child(n+3){display:none}.rzk-cards .longer{display:none}";
        document.head.appendChild(st);
        return true;
      }
      if (h === "golink") {
        const box = document.querySelector(".rzk-cards dd");
        if (!box) return false;
        if (box.querySelector(".cardgo-break")) return true;
        const a = document.createElement("a");
        a.href = "/cards";
        a.className = "rz-cards-go cardgo-break";
        a.textContent = "この人のカードを、ぜんぶ見る";
        box.appendChild(a);
        return true;
      }
      return false;
    }, how);

  console.log("見たもの:", HERE ? `手元 ${PAGE}` : `本番 ${PAGE}`);
  await openFriends();
  /* **飢えを、数える前に見る。** 束ねた JS が1本来ないだけで図鑑は0マスになり、
     「マスが0」という別の理由で落ちて、通っていない先に気づけない */
  fed("図鑑");
  if (missing.length) await stop(b, 2, `見つからなかった: ${missing.join(" / ")}`);

  const cells = await p.locator(".rzk-cell").count();
  console.log("図鑑のマス:", cells);
  if (cells !== CHARS.length) {
    missing.push(`図鑑のマス=${cells} だが、口は ${CHARS.length}人ぶん返している`);
  }
  if (cells === 0) {
    await stop(b, 2, "見つからなかった: 図鑑のマス（.rzk-cell）が0。口の差し替えを見てください。");
  }

  /* **並び順は画面に決めさせる。** 図鑑は口の返した配列のままではなく、
     作った順（`lib/characters.ts`）に並べ替えて出す。ここで同じ並べ替えを
     写すと、あちらを直した日に**黙って別の人を押しに行く**（`island-misses.md`
     #165 の決めごと2「見張りが見る場所の一覧を、手で持たない」）。
     マスの絵は `/island-api/characters/<絵のid>/plain-128.webp` なので、
     そこから引く。 */
  const AT = new Map(
    Object.entries(
      await p.evaluate(() => {
        const out = {};
        [...document.querySelectorAll(".rzk-cell")].forEach((c, i) => {
          const m = /\/characters\/([^/]+)\//.exec(c.querySelector("img")?.getAttribute("src") ?? "");
          if (m) out[decodeURIComponent(m[1])] = i;
        });
        return out;
      }),
    ),
  );
  console.log("マスから引けた人:", AT.size);
  if (AT.size !== cells) missing.push(`マスから絵の id を引けたのは ${AT.size}/${cells}`);
  const 迷子 = 持っている人.filter(([icon]) => !AT.has(icon)).length;
  if (迷子) missing.push(`カードを持っているのにマスが見つからない人が ${迷子}人`);
  if (missing.length) {
    await stop(b, 2, `見つからなかった: ${missing.join(" / ")}`);
  }

  /** 1人ぶん見る。@returns {{出た:number, 押した:number, 行き先:string[]}} */
  async function walk(icon, want) {
    const at = AT.get(icon);
    await p.locator(".rzk-cell").nth(at).click();
    await p.waitForTimeout(140);
    if (BREAK) await breakField(p, BREAK);
    /* 押せるだけ押す。**「たたむ」に変わったら終わり**（`Longer`）。
       枚数ぶん以上は回らないので、上限は出ている枚数から決める */
    let 押した = 0;
    for (let i = 0; i < 40; i++) {
      /* **見えているものだけ押す。** 隠れている押しどころは、その人には
         無いのと同じ（押せないので、待っても出てこない） */
      const more = p.locator(".rzk-cards .longer:visible", { hasText: "だす" });
      if ((await more.count()) === 0) break;
      await more.first().click();
      押した += 1;
      await p.waitForTimeout(60);
      if (BREAK) await breakField(p, BREAK);
    }
    /* **見えている1枚だけ数える。** 隠してあるカードは、その人には無いのと
       同じ（畳んだ中の絵と同じ考え。`CLAUDE.md`「畳んだ中の絵を数えない」）。 */
    return p.evaluate(() => {
      const 見える = (x) => x.getClientRects().length > 0;
      return {
        出た: [...document.querySelectorAll(".rzk-cards .akd")].filter(見える).length,
        行き先: [...document.querySelectorAll(".rzk-cards a[href]")].filter(見える).map((a) => ({
          字: a.textContent.replace(/\s+/g, ""),
          先: a.getAttribute("href"),
        })),
      };
    }).then((x) => ({ ...x, 押した, want, at }));
  }

  let 見た人 = 0;
  let 見たカード = 0;
  for (const [icon, want] of 持っている人) {
    const got = await walk(icon, want);
    見た人 += 1;
    見たカード += got.出た;
    if (reachGap(want, got.出た)) {
      bad.push(`No.${got.at + 1}（${want}枚のはず）から ${got.出た}枚にしか行けない`);
    }
    /* 欄の中の行き先。**その人のカード以外へ送るものを落とす。**
       行き先が「その人ぶん」だと分かるのは、その人を指す値を持つときだけ
       （`?who=` のような）。島ぜんぶの一覧（`/cards`）は誰のぶんでもない。 */
    for (const g of got.行き先) {
      if (goesElsewhere(g)) {
        bad.push(`No.${got.at + 1} の欄の「${g.字}」が ${g.先} へ送っている（誰のぶんでもない）`);
      }
    }
  }
  console.log(
    "たどれるか:",
    JSON.stringify({ 見た人, 見たカード, "口の言う枚数": 枚数.reduce((a, c) => a + c, 0) }),
  );
  if (見た人 === 0) missing.push("見られた人が0人");
  if (見たカード === 0) missing.push("出たカードが0枚");

  /* 持っていない人。**欄ごと出ない**のが正しい（0枚を並べても何も分からない）。 */
  const なし = CHARS.find((c) => !HAVE.has(c.id));
  let 持っていない人 = null;
  if (なし) {
    await p.locator(".rzk-cell").nth(AT.get(なし.id)).click();
    await p.waitForTimeout(160);
    持っていない人 = await p.evaluate(() => ({
      欄: document.querySelectorAll(".rzk-cards").length,
      カード: document.querySelectorAll(".rzk-cards .akd").length,
    }));
    console.log("1枚も持っていない人:", JSON.stringify(持っていない人));
    if (持っていない人.欄 !== 0) {
      bad.push(`1枚も持っていない人に、カードの欄が ${持っていない人.欄} 個出ている`);
    }
  } else {
    missing.push("1枚も持っていない人が図鑑に居ない（欄ごと消えるかを試せない）");
  }

  if (SHOT) {
    await p.screenshot({ path: `${OUT}/friends-カード欄.png`, fullPage: false });
  }

  /* 読めなかったとき。**0枚と同じ絵にしない**（`docs/island-standards.md` §10）。
     カードの口を落として開き直して、いちばん多く持っている人の札を見る。 */
  cardsDown = true;
  await openFriends(0);
  await p.locator(".rzk-cell").nth(AT.get(持っている人[0][0])).click();
  await p.waitForTimeout(1200);
  const 落ちたとき = await p.evaluate(() => ({
    欄: document.querySelectorAll(".rzk-cards").length,
    カード: document.querySelectorAll(".rzk-cards .akd").length,
    読めなかったの札: document.querySelectorAll(".rzk-cards .blank.is-off").length,
    字: (document.querySelector(".rzk-cards")?.textContent ?? "").replace(/\s+/g, "").slice(0, 40),
  }));
  console.log("カードの口が落ちたとき:", JSON.stringify(落ちたとき));
  if (落ちたとき.欄 === 0) {
    bad.push("カードの口が落ちたときに、欄ごと消えている（1枚も持っていない人と同じ絵）");
  }
  if (落ちたとき.読めなかったの札 === 0) {
    bad.push("カードの口が落ちたときに、読めなかったと言っていない（0枚と同じ絵）");
  }

  fed("読めなかったとき");
  await b.close();

  const code = verdict({ missing, bad });
  if (code === 2) {
    console.error(`\n見つからなかった: ${missing.join(" / ")}`);
    process.exit(2);
  }
  if (code === 1) {
    console.error(`\n行けない／食い違い ${bad.length}件:`);
    for (const x of bad) console.error(`  - ${x}`);
    console.error(
      "\nsite/components/live/FriendsWall.tsx の「もらったカード」の欄を見てください。",
    );
    process.exit(1);
  }
  console.log(`\n${見た人}人 / ${見たカード}枚、ぜんぶその人のカードへ行けました。`);
}
