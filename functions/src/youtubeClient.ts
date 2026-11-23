import {google} from "googleapis";

/** YouTube の窓口の型（`google.youtube` が返すもの）。 */
type YouTube = ReturnType<typeof google.youtube>;

/** OAuth の戻り先。鍵は OAuth Playground で出したので、どちらの鍵もここ。 */
const REDIRECT = "https://developers.google.com/oauthplayground";

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  REDIRECT
);

oauth2Client.setCredentials({
  refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
});

/** **あやと本人**の窓口。配信を探す・チャットを読むのはこちら。 */
export const youtube = google.youtube({
  version: "v3",
  auth: oauth2Client,
});

export {oauth2Client};

/** 案内鳥の窓口。鍵ごとに1つ。温かいインスタンスで毎回作り直さない。 */
let guide: {token: string; yt: YouTube} | null = null;

/**
 * チャンネル「あやと島案内鳥」の窓口（#1405）。**書くのだけに使う。**
 *
 * **配信を探すのに使わない。** `broadcastStatus` で探すと、鍵の持ち主の
 * 配信が返る。案内鳥の鍵で探すと、案内鳥の（無い）配信を探してしまう。
 * 探すのは上の `youtube`（あやとの鍵）。
 *
 * **鍵は呼ばれたときに読む**（入れ替えたあとの1回目から効く。`tip.ts` の
 * Stripe の鍵と同じ形）。鍵は、あやとの鍵と同じ OAuth のクライアント
 * （`YOUTUBE_CLIENT_ID`）で出したもの。だから1日の割り当ても同じ枠を使う。
 * @return {YouTube | null} 窓口。鍵が無ければ null
 */
export function guideYoutube(): YouTube | null {
  const token = process.env.YOUTUBE_GUIDE_REFRESH_TOKEN ?? "";
  if (!token) return null;
  if (!guide || guide.token !== token) {
    const auth = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      REDIRECT,
    );
    auth.setCredentials({refresh_token: token});
    guide = {token, yt: google.youtube({version: "v3", auth})};
  }
  return guide.yt;
}
