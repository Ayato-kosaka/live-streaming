// 日本の海外Vlog・旅・ライブ配信で実際に使われている型を、あやとの配信素材に当てて描く。
// 型の出どころは ref/index.json（YouTube の検索結果から拾った実物）。
// 出力は out/1.jpg 〜 out/8.jpg（1280x720）。
// 素材は先に落としておく:
//   python3 fetch_src.py 5-1bHix5X1s lPCx2VMe4pc v3L539GafQo TGO_a-3ZwHM 9WpNkeeUWs0 \
//     EjRXQuzubLo YjiWI5reVCo ZcchwhRE_Ks xo1eYfB4RyU o3QVUx15mg4 KsRed7PAJ6w v1PRwv1CWO0
//   python3 facecrop.py
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "fs";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const b64 = (p) => "data:image/jpeg;base64," + readFileSync(p).toString("base64");

// 縦フレーム（黒帯を落として撮ったままに戻したもの）
const V = {
  osinko: b64("src/5-1bHix5X1s_vc.jpg"), taki: b64("src/lPCx2VMe4pc_vc.jpg"),
  yama: b64("src/v3L539GafQo_vc.jpg"), katsu: b64("src/TGO_a-3ZwHM_vc.jpg"),
  pizza: b64("src/9WpNkeeUWs0_vc.jpg"), iwashi: b64("src/EjRXQuzubLo_vc.jpg"),
};
// 顔だけ切り出して明るさを上げたもの（縦動画を横サムネに使うための素材）
const F = {
  katsu: b64("src/TGO_a-3ZwHM_faceb.jpg"), iwashi: b64("src/EjRXQuzubLo_faceb.jpg"),
  takikomi: b64("src/YjiWI5reVCo_faceb.jpg"), karaage: b64("src/ZcchwhRE_Ks_faceb.jpg"),
  ojafuri: b64("src/xo1eYfB4RyU_faceb.jpg"),
};
// YouTube が自動で作る 16:9 の候補フレーム
const W = {
  taki: b64("src/lPCx2VMe4pc_2c.jpg"), yama: b64("src/v3L539GafQo_2c.jpg"),
  kyokai: b64("src/o3QVUx15mg4_3c.jpg"), zekkei: b64("src/o3QVUx15mg4_2c.jpg"),
  mise: b64("src/KsRed7PAJ6w_2c.jpg"), tamago: b64("src/ZcchwhRE_Ks_3c.jpg"),
  machi: b64("src/v1PRwv1CWO0_3c.jpg"), osinko: b64("src/5-1bHix5X1s_3c.jpg"),
};

// 文字コードを宣言しないと Chromium が latin-1 と誤認して日本語が壊れる
const head = `<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&family=Noto+Serif+JP:wght@600;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1280px;height:720px;overflow:hidden;background:#000}
.f{position:relative;width:1280px;height:720px;overflow:hidden;font-family:'Noto Sans JP',sans-serif}
img{display:block}
/* 日本のサムネの文字はほぼ全部これ。極太＋黒フチ＋落ち影 */
.t{font-weight:900;color:#fff;-webkit-text-stroke:14px #111;paint-order:stroke fill;
   text-shadow:0 6px 0 rgba(0,0,0,.35);line-height:1.1}
.badge{display:inline-block;font-weight:900;color:#fff;background:#e0182d;padding:6px 16px;border-radius:5px}
</style>`;
const doc = (b) => `<!doctype html><html lang="ja"><head>${head}</head><body>${b}</body></html>`;

// ① 下部テロップ帯 ── たろたん「トルコ狂ってた」/ バカイト「これがアメリカの現実」の型。
//    写真は全面、文字は下 1/3 だけ。縦素材は真ん中に立てて、余白はぼかしで埋める。
const P1 = doc(`<div class="f">
  <img src="${V.taki}" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(3.6);width:404px;height:720px;object-fit:cover;filter:blur(24px) saturate(1.5) brightness(.85)">
  <img src="${V.taki}" style="position:absolute;left:50%;top:0;transform:translateX(-50%);width:404px;height:720px;object-fit:cover">
  <div style="position:absolute;left:0;right:0;bottom:0;height:300px;background:linear-gradient(transparent,rgba(0,0,0,.85) 55%)"></div>
  <div style="position:absolute;left:0;right:0;bottom:58px;text-align:center">
    <div class="t" style="font-size:112px">滝まで歩いて3時間</div>
  </div>
</div>`);

// ② 上下2段コピー ── さきの海外不動産「30年間アメリカのATMだった日本／今後バグり始めます」の型。
//    上段が前フリ（細め・色つき）、下段が落ち（極太・白）。数字だけ黄色にする。
const P2 = doc(`<div class="f" style="background:#0d1526">
  <img src="${W.kyokai}" style="position:absolute;inset:0;width:1280px;height:720px;object-fit:cover;object-position:50% 62%;filter:blur(7px) brightness(.5) saturate(1.35)">
  <img src="${F.takikomi}" style="position:absolute;right:0;bottom:0;height:620px;object-fit:cover;object-position:50% 26%;filter:brightness(1.18) contrast(1.06) saturate(1.1)">
  <div style="position:absolute;right:0;bottom:0;width:420px;height:600px;box-shadow:inset -40px 0 60px -30px rgba(13,21,38,.9)"></div>
  <div style="position:absolute;left:52px;top:112px;width:800px">
    <div style="font-size:56px;font-weight:900;color:#ffd93b;-webkit-text-stroke:11px #111;paint-order:stroke fill">標高2400m・往復6時間</div>
    <div class="t" style="font-size:104px;margin-top:22px">山の上の湖まで<br>歩いてみた</div>
  </div>
</div>`);

// ③ 顔アップ＋左コピー ── 週末海外ノマド「海外在住"税理士"なのですが」/ 埼玉スマホ教室の型。
//    縦動画でも顔だけ切り出せば横位置の主役になる。あやとの素材といちばん相性がいい。
const P3 = doc(`<div class="f" style="background:#fff">
  <img src="${F.katsu}" style="position:absolute;right:0;top:0;height:720px;object-fit:cover;object-position:52% 34%">
  <div style="position:absolute;left:0;top:0;width:800px;height:720px;background:#f4f1ea"></div>
  <div style="position:absolute;left:0;top:0;width:800px;height:720px;background:linear-gradient(90deg,#f4f1ea 78%,rgba(244,241,234,0))"></div>
  <div style="position:absolute;left:56px;top:126px;width:700px">
    <div style="display:inline-block;background:#1b3a6b;color:#fff;font-size:38px;font-weight:900;padding:8px 22px">ジョージア在住</div>
    <div style="margin-top:26px;font-size:104px;font-weight:900;color:#1b1b1b;line-height:1.14">日本の食材<br><span style="color:#d61f3a">ゼロ</span>でカツ丼</div>
    <div style="margin-top:26px;font-size:44px;font-weight:900;color:#1b3a6b">作れるんですか？</div>
  </div>
</div>`);

// ④ 国旗＋地名タグ＋下部テロップ ── よしみ子「トルコひとり旅」/ jomi jomi life の型。
//    旅回の定番。国旗と地名を必ず入れて「どこの話か」を一目で出す。
const P4 = doc(`<div class="f">
  <img src="${W.zekkei}" style="position:absolute;inset:0;width:1280px;height:720px;object-fit:cover;object-position:50% 72%;filter:saturate(1.35) contrast(1.05)">
  <div style="position:absolute;inset:0;background:linear-gradient(transparent 45%,rgba(0,0,0,.72))"></div>
  <div style="position:absolute;left:40px;top:36px;display:flex;align-items:center;gap:14px">
    <div style="width:78px;height:52px;background:#fff;border:3px solid #fff;position:relative;overflow:hidden">
      <div style="position:absolute;inset:0;background:#fff"></div>
      <div style="position:absolute;left:50%;top:0;bottom:0;width:12px;background:#d0021b;transform:translateX(-50%)"></div>
      <div style="position:absolute;top:50%;left:0;right:0;height:12px;background:#d0021b;transform:translateY(-50%)"></div>
    </div>
    <div style="font-size:34px;font-weight:900;color:#fff;-webkit-text-stroke:8px #111;paint-order:stroke fill">ジョージア・カズベキ</div>
  </div>
  <div style="position:absolute;right:40px;top:38px;background:rgba(0,0,0,.72);color:#fff;font-size:28px;font-weight:900;padding:10px 20px;border-radius:8px">滞在 42日目</div>
  <div style="position:absolute;left:0;right:0;bottom:56px;text-align:center">
    <div class="t" style="font-size:118px">カズ滝まで歩く</div>
    <div style="margin-top:18px;font-size:34px;font-weight:900;color:#ffd93b;-webkit-text-stroke:9px #111;paint-order:stroke fill">往復6時間・水は2L持て</div>
  </div>
</div>`);

// ⑤ 引き出し線＋値段 ── バカイト「ラーメン3000円／納豆700円」/ Kira Kira USA の型。
//    買い物・スーパー回はこれ。写真の中の物を指して数字を置くだけで持つ。
const P5 = doc(`<div class="f" style="background:#0b0b0b">
  <img src="${W.mise}" style="position:absolute;inset:0;width:1280px;height:720px;object-fit:cover;object-position:60% 50%;filter:brightness(1.12) contrast(1.05) saturate(1.3)">
  <div style="position:absolute;left:64px;top:46px">
    <div style="display:inline-block;background:#ffd93b;color:#111;font-size:34px;font-weight:900;padding:8px 20px;border-radius:6px">※ 物価しらべ</div>
  </div>
  <div style="position:absolute;left:92px;top:188px;font-size:40px;font-weight:900;color:#fff;-webkit-text-stroke:10px #111;paint-order:stroke fill">トマト 1kg<br>230円</div>
  <div style="position:absolute;left:250px;top:214px;width:210px;height:4px;background:#fff;transform:rotate(14deg);box-shadow:0 0 0 3px rgba(0,0,0,.6)"></div>
  <div style="position:absolute;right:78px;top:132px;text-align:right;font-size:40px;font-weight:900;color:#fff;-webkit-text-stroke:10px #111;paint-order:stroke fill">イワシ 1匹<br>40円</div>
  <div style="position:absolute;right:300px;top:206px;width:200px;height:4px;background:#fff;transform:rotate(-16deg);box-shadow:0 0 0 3px rgba(0,0,0,.6)"></div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:250px;background:linear-gradient(transparent,rgba(0,0,0,.88) 60%)"></div>
  <div style="position:absolute;left:0;right:0;bottom:50px;text-align:center">
    <div class="t" style="font-size:106px">これがジョージアの物価</div>
  </div>
</div>`);

// ⑥ 料理を主役＋袋文字 ── Kay & ZooKatsu「アメリカで日本食を作って振る舞った」/ 無職旅 の型。
//    料理回は皿が主役。人は小さく端に置いて、文字は黄色＋黒フチ。
const P6 = doc(`<div class="f" style="background:#160f08">
  <img src="${W.tamago}" style="position:absolute;inset:0;width:1280px;height:720px;object-fit:cover;object-position:50% 78%;filter:saturate(1.45) contrast(1.08) brightness(1.06)">
  <div style="position:absolute;inset:0;background:radial-gradient(80% 66% at 50% 76%,rgba(0,0,0,.15) 30%,rgba(0,0,0,.78))"></div>
  <div style="position:absolute;left:0;right:0;top:44px;text-align:center">
    <div style="display:inline-block;background:#e0182d;color:#fff;font-size:36px;font-weight:900;padding:8px 24px;border-radius:6px">海外でつくる日本メシ</div>
  </div>
  <div style="position:absolute;left:0;right:0;top:150px;text-align:center">
    <div style="font-size:128px;font-weight:900;color:#ffd93b;-webkit-text-stroke:16px #5b1a06;paint-order:stroke fill;line-height:1.06">炊き込みご飯<br>茶碗蒸し</div>
  </div>
  <div style="position:absolute;left:0;right:0;bottom:46px;text-align:center">
    <div class="t" style="font-size:64px">材料はぜんぶ現地調達</div>
  </div>
  <img src="${F.takikomi}" style="position:absolute;right:34px;bottom:30px;width:196px;height:232px;object-fit:cover;border:6px solid #fff;border-radius:10px;box-shadow:0 14px 34px rgba(0,0,0,.6)">
</div>`);

// ⑦ 明朝＋余白の作品型 ── Maibaru Travel「ウズベキスタン紀行」/ パリちゃうねん「2年ぶりの再会 #5」の型。
//    毎日は使えないが、月末配信や節目の回に効く。あやとは既にこの路線を持っている。
const P7 = doc(`<div class="f" style="background:#0c0f14">
  <img src="${W.machi}" style="position:absolute;inset:0;width:1280px;height:720px;object-fit:cover;object-position:62% 50%;filter:brightness(.66) saturate(.85) contrast(1.05)">
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(8,10,14,.78) 0 42%,transparent 72%)"></div>
  <div style="position:absolute;left:76px;top:196px;width:640px">
    <div style="font-family:'Noto Serif JP',serif;font-size:92px;font-weight:600;color:#f3ece0;line-height:1.3;letter-spacing:.1em">ジョージア<br>紀行</div>
    <div style="margin-top:30px;width:120px;height:2px;background:#c8b38a"></div>
    <div style="margin-top:26px;font-size:26px;font-weight:400;color:#c9c1b4;letter-spacing:.22em;line-height:1.9">９月月末配信<br>１ヶ月ふりかえり授賞式</div>
  </div>
  <div style="position:absolute;right:56px;bottom:44px;font-size:22px;color:#9a927f;letter-spacing:.3em">AYATO / GEORGIA</div>
</div>`);

// ⑧ ライブ箇条書き＋LIVEバッジ ── DK-Travel「旅好きが集まるLIVE」の型。
//    企画会議や雑談ライブはこれ。今日やることを3〜4行、紙に書いたように並べる。
const P8 = doc(`<div class="f" style="background:#12233c">
  <img src="${W.osinko}" style="position:absolute;inset:0;width:1280px;height:720px;object-fit:cover;filter:blur(10px) brightness(.45)">
  <div style="position:absolute;left:44px;top:34px" class="badge" >
    <span style="font-size:38px">● LIVE</span></div>
  <img src="${F.ojafuri}" style="position:absolute;right:36px;bottom:0;height:560px;object-fit:cover;object-position:50% 28%">
  <div style="position:absolute;left:56px;top:126px;width:760px">
    <div style="background:#fffdf5;border-radius:14px;padding:26px 30px;box-shadow:0 16px 40px rgba(0,0,0,.5)">
      <div style="font-size:34px;font-weight:900;color:#12233c;line-height:1.85">
        ・北欧いつ行く？ルート決める<br>
        ・アプリの次の機能、みんなで選ぶ<br>
        ・９月の月末配信なにやる<br>
        ・視聴者さんの相談コーナー
      </div>
    </div>
    <div style="margin-top:24px;font-size:62px;font-weight:900;color:#fff;-webkit-text-stroke:12px #111;paint-order:stroke fill">今週の企画会議や！</div>
  </div>
</div>`);

const pages = { 1: P1, 2: P2, 3: P3, 4: P4, 5: P5, 6: P6, 7: P7, 8: P8 };
const bro = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctx = await bro.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
for (const [k, html] of Object.entries(pages)) {
  writeFileSync(`out/${k}.html`, html);  // 描き直すときの下敷き。中身は .gitignore で外している
  await p.goto(`file://${process.cwd()}/out/${k}.html`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(900);
  // リポジトリに置くので jpg。png のままだと8枚で 6MB を超える
  await p.screenshot({ path: `out/${k}.jpg`, type: "jpeg", quality: 88 });
  console.log(k, "ok");
}
await bro.close();
