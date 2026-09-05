/**
 * 1フレームあたりの CPU を測る。
 *
 * ## なぜ rAF の間隔ではだめか
 *
 * この箱では、担当が何人も同時にビルドとブラウザを動かしている。
 * 実測で load average 25（4コア）まで上がる。そのとき rAF の間隔（＝壁の時計）は
 * **同じページを2回測っただけで 33.3ms と 116.6ms が出る。** どちらも本当の値で、
 * 差は島の作りではなく、そのとき隣で誰が何をしていたかで決まっている。
 *
 * 「60fps になった」の誤報は、たぶんこれが原因。壁の時計で測ったものは、
 * 直したかどうかではなく、混み具合を測っている。
 *
 * 代わりにここでは CDP の `Performance.ProcessTime` を取る。
 * **描画プロセスが実際に使った CPU 秒**で、他のプロセスが混んでいても動かない。
 * これをフレーム数で割って「1フレームあたり何ミリ秒の CPU を使ったか」で比べる。
 * 実測、同じ条件を3回で 24 / 25 / 25。壁の時計とちがって読める。
 *
 *   壁の時計（rAF の間隔）… 混み具合しだい。**同じ条件で3倍動く**
 *   ProcessTime          … 混み具合で動かない。**直したかどうかが出る**
 *
 * 60fps は 16.7ms だが、これは**壁の時計**の話。CPU のほうは、ラスタライズが
 * 別スレッドで走るぶん合計が大きく出る。**目安として 1フレーム 16ms を切れば、
 * 空いている実機では 60fps が出る**（メイン 4ms ＋ ラスタ 2スレッド）。
 * 絶対値ではなく、**直す前と後の比**で読むこと。
 *
 * ## 使い方
 *
 *   cd site && NEXT_DIST_DIR=.next-3120 npx next build
 *   python3 -m http.server 4120 --directory site/.next-3120 &
 *   cd tools/sprites && SPORT=4120 node framecpu.mjs            # 島を歩かせて測る
 *   SPORT=4120 THROTTLE=4 node framecpu.mjs                      # スマホ実機に寄せる
 *   SPORT=4120 PAGE=/nordic.html node framecpu.mjs               # 別の面
 *   SPORT=4120 CSS='.sway{animation:none}' node framecpu.mjs     # CSS を足して比べる
 *   SPORT=4120 REPEAT=3 node framecpu.mjs                        # 回数（既定2）
 *   SPORT=4120 WIDE=1 node framecpu.mjs                          # PC 幅(1440×900)で
 *   SPORT=4120 WIDE=1 DSF=1 node framecpu.mjs                    # 同じ幅で、描く画素だけ 1/4 に
 *   SPORT=4120 LOOK=1 node framecpu.mjs                          # 「島をながめる」の引きで
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4120";
const BASE = `http://localhost:${SPORT}`;
const PAGE = process.env.PAGE || "/index.html";
const REPEAT = Number(process.env.REPEAT || 2);
/** CPU を何倍遅くするか。スマホの実機に寄せるなら 4。既定は絞らない */
const THROTTLE = Number(process.env.THROTTLE || 0);
const CSS = process.env.CSS || "";
const WIDE = process.env.WIDE === "1";
/**
 * 画面1pxを何画素で描くか。既定は PC 2・スマホ 3（実機に合わせた値）。
 * ここを動かすと、**幅はそのままで描く画素数だけ**が変わる。
 * 「PC が遅いのは余計なことをしているからか、単に画素が多いからか」は
 * これを 1 にして測ると分かれる。
 */
const DSF = Number(process.env.DSF || 0);
/** 「島をながめる」を押してから測る。引きの絵の重さを見るとき */
const LOOK = process.env.LOOK === "1";

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext(
  WIDE
    ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: DSF || 2 }
    : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: DSF || 3 },
);
// 住人の絵は本番と同じものを1人ずつ返す（`python3 avatars.py` で落としたもの）。
// 全員を同じ絵にすると、画像の解読とラスタが1枚ぶんで済んでしまって数字が嘘になる
await offline(ctx, { photo: "/home/user/live-streaming/tools/sprites/photo-480.jpg" });

/** 1回ぶん。落ち着かせてから、歩かせて6秒ぶんの CPU を取る。 */
async function once() {
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Performance.enable");
  if (THROTTLE) await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await p.addInitScript(
    ({ css }) => {
      // 到着演出は別に測る。ここが見たいのは「降りたあと」なので飛ばす
      try {
        localStorage.setItem("ayato-island-arrived", "2026-09-04");
        localStorage.setItem("ayato-island-walked", "1");
        localStorage.setItem("ayato-island-today", "2026-09-05");
      } catch {}
      if (css)
        document.addEventListener("DOMContentLoaded", () => {
          const s = document.createElement("style");
          s.textContent = css;
          document.head.appendChild(s);
        });
      window.__f = 0;
      const tick = () => {
        window.__f++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    { css: CSS },
  );

  const t0 = Date.now();
  await p.goto(BASE + PAGE, { waitUntil: "load", timeout: 60000 });
  // 到着ぶんの CPU。飛ばす人でも、最初の1枚を描くまでは重い
  await p.waitForTimeout(4000);
  const boot = await metrics(cdp);

  if (LOOK) {
    await p.click(".stage-view").catch(() => {});
    await p.waitForTimeout(2500);
  }
  const get = async () => await metrics(cdp);
  const a = await get();
  const f0 = await p.evaluate(() => window.__f);
  // 島を歩かせる。カメラが動いているあいだがいちばん重い
  const walked = await p.evaluate(() => {
    const el = document.querySelector(".stage");
    if (!el) return false;
    let n = 0;
    const id = setInterval(() => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: r.left + r.width * (0.22 + 0.56 * (n % 2)),
          clientY: r.top + r.height * (0.35 + 0.2 * (n % 3)),
        }),
      );
      if (++n > 11) clearInterval(id);
    }, 500);
    return true;
  });
  await p.waitForTimeout(6000);
  const z = await get();
  const f1 = await p.evaluate(() => window.__f);
  const info = await p.evaluate(() => ({
    nodes: document.querySelectorAll("*").length,
    svg: document.querySelectorAll("svg *").length,
  }));
  await p.close();
  const frames = Math.max(1, f1 - f0);
  return {
    walked,
    frames,
    /** 歩いているあいだの、1フレームあたりの描画プロセスの CPU(ms) */
    cpu: ((z.ProcessTime - a.ProcessTime) * 1000) / frames,
    /** そのうちメインスレッド(ms) */
    main: ((z.ThreadTime - a.ThreadTime) * 1000) / frames,
    /** 開いてから4秒までに使った CPU(ms)。起動の重さ */
    boot: boot.ProcessTime * 1000,
    load: Date.now() - t0,
    ...info,
  };
}

async function metrics(cdp) {
  return Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
}

const runs = [];
for (let i = 0; i < REPEAT; i++) runs.push(await once());
await b.close();

const med = (k) => {
  const s = runs.map((r) => r[k]).sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const all = (k, d = 1) => runs.map((r) => r[k].toFixed(d)).join(" / ");

const dsf = DSF || (WIDE ? 2 : 3);
const dpx = (WIDE ? 1440 * 900 : 390 * 844) * dsf * dsf;
console.log(`■ ${PAGE}  ${WIDE ? "1440×900" : "390×844"}×${dsf}  CPU${THROTTLE ? `${THROTTLE}倍遅` : "絞りなし"}${CSS ? `  CSS: ${CSS}` : ""}`);
if (!runs[0].walked) console.log("  （この面には島が無いので、歩かせずに測っている）");
console.log(`  1フレームのCPU   ${med("cpu").toFixed(1)} ms   (${all("cpu")})`);
console.log(`  うちメイン       ${med("main").toFixed(1)} ms   (${all("main")})`);
console.log(`  6秒のフレーム数  ${med("frames")}        (${runs.map((r) => r.frames).join(" / ")})   ← 混み具合で動く。参考`);
console.log(`  起動4秒までのCPU ${med("boot").toFixed(0)} ms   (${all("boot", 0)})`);
console.log(`  DOM ${runs[0].nodes} / SVG要素 ${runs[0].svg}`);
// 画素あたりで見ないと、幅の違う2つは比べられない。
// PC はスマホの 1.75 倍の画素を描いているので、CPU が 1.75 倍なら「同じ効率」
console.log(`  描く画素 ${(dpx / 1e6).toFixed(2)} M   1msあたり ${(dpx / 1e3 / med("cpu")).toFixed(0)} k画素  ← ここが揃えば、余計なことはしていない`);
