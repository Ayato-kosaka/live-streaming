/**
 * **古いドメインから 301 で来た人の、手元の記録（`localStorage`）を持ってくる。**（#1202 の段 B）
 *
 * `localStorage` はドメインごとに別。古い `live-streaming-d3cac.web.app` の島の面を
 * 新しいドメインへ 301 で送ると、歩いた記録・いいね済み・会った住人が空から始まる。
 *
 * ## 流れ（1つのブラウザで1回だけ）
 *
 * 1. 古いドメインの島の面 → 301 → `https://ayato-arigato.com/<道>#from-legacy`
 *    （元のクエリは Firebase が後ろに足すので `#from-legacy?from=yt` になる。ここで URL へ戻す）
 *    （目印は `python/legacy_hosting.py` が規則に付ける）
 * 2. ここが目印を見て、古いドメインの `/handoff#n=<合言葉>&to=<道>` へ移る
 * 3. `/handoff`（`public/handoff.html`）が古いドメインの記録を読んで、
 *    `https://ayato-arigato.com/<道>#handoff=<記録>&n=<合言葉>` へ戻す
 * 4. ここが合言葉を確かめて、記録を足し、URL から `#…` を消す
 *
 * ## 決めたこと
 *
 * - **目印が無ければ何もしない。** 新しいドメインに直に来た人（検索から来た人も）を
 *   往復させない。Google はフラグメントを URL の一部として扱わない
 * - **iframe では読めない。** ブラウザが埋め込みの保存領域を分けるので、
 *   上の画面ごと移る形しか無い
 * - **合言葉はこのタブの `sessionStorage` に置く。** 誰かが `#handoff=…` 付きの
 *   リンクを作って踏ませても、合言葉が無いので書き込まない
 * - **往復は1回きり。** 戻ってこられなかったとき（古いドメインが落ちている等）に
 *   何度も往復しないよう、出る前に「済み」を置く
 * - **新しいドメインに在るものは上書きしない。** 配列（JSON の `[...]`）だけ合わせる
 *   （いいね済み・自分の企画）
 * - **ログインの状態は持ってこない**（`SKIP`）。ログインそのもの（Firebase Auth）は
 *   持ってこられないので、印だけ持ってくると「ログインしているつもり」の画面になる
 *
 * 古いドメイン側の字（`public/handoff.html`）と、301 の目印（`python/legacy_hosting.py`）は
 * `python/legacy_hosting_selftest.py` が突き合わせる。
 */
import { SITE } from "@/content/site";

export const MARK = "#from-legacy";
export const LEGACY = "https://live-streaming-d3cac.web.app";
/** 持ってこない鍵（ログインの印）。`public/handoff.html` も同じ字を持つ */
export const SKIP = "^ayato-(island-(signedin|signin-away|owner)|handoff-.*)$";

const HOST = new URL(SITE.url).hostname;

export const HANDOFF_SCRIPT =
  "(function(){try{" +
  `var H=${JSON.stringify(HOST)},L=${JSON.stringify(LEGACY)},M=${JSON.stringify(MARK)},S=new RegExp(${JSON.stringify(SKIP)});` +
  "if(location.hostname!==H)return;" +
  'var ls=localStorage,ss=sessionStorage,N="ayato-handoff-nonce",D="ayato-handoff-done",h=location.hash;' +
  'function clean(){history.replaceState(history.state,"",location.pathname+location.search)}' +
  // 戻ってきたとき
  "var m=/^#handoff=([A-Za-z0-9_-]*)&n=([a-f0-9]{8,64})$/.exec(h);" +
  "if(m){var want=ss.getItem(N);ss.removeItem(N);clean();if(!want||want!==m[2])return;" +
  'var o=JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g,"+").replace(/_/g,"/"))))),k,cur,a,b,seen,u;' +
  "for(k in o){if(!/^ayato-/.test(k)||S.test(k)||typeof o[k]!=='string')continue;cur=ls.getItem(k);" +
  "if(cur===null){ls.setItem(k,o[k]);continue}" +
  "try{a=JSON.parse(cur);b=JSON.parse(o[k]);if(Array.isArray(a)&&Array.isArray(b)){seen={};u=[];" +
  "a.concat(b).forEach(function(x){var t=JSON.stringify(x);if(!seen[t]){seen[t]=1;u.push(x)}});ls.setItem(k,JSON.stringify(u))}}catch(e){}}" +
  "return}" +
  // 古いドメインから 301 で来たとき
  // Firebase は元のクエリを行き先の後ろに足すので、`#from-legacy?from=yt` の形で届く。
  // フラグメントに落ちたクエリを、アプリが読む前に URL へ戻す
  "if(h!==M&&h.indexOf(M+'?')!==0)return;" +
  'history.replaceState(history.state,"",location.pathname+(h.length>M.length?h.slice(M.length):location.search));' +
  "if(ls.getItem(D)||/bot|crawl|spider|slurp|lighthouse|inspectiontool|headless/i.test(navigator.userAgent))return;" +
  'var r=new Uint8Array(12),n="",i;crypto.getRandomValues(r);for(i=0;i<r.length;i++)n+=(r[i]+256).toString(16).slice(1);' +
  'ss.setItem(N,n);ls.setItem(D,"1");' +
  'location.replace(L+"/handoff#n="+n+"&to="+encodeURIComponent(location.pathname+location.search))' +
  "}catch(e){}})()";
