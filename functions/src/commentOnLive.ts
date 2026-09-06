import {getRemoteConfigStringValue} from "./remoteConfig";
import {sayOnLive} from "./liveChat";

/**
 * ライブ配信中のチャットに定期コメントを投稿します。
 * ライブがアクティブでない場合は何もしません。
 *
 * 配信を探すところとチャットに書くところは `liveChat.ts` に移した。
 * ルーレット(#164)が同じことを必要とするので、配信の探しかたを
 * 2か所に持たない。
 */
export async function commentOnLive(): Promise<void> {
  try {
    const youtubeRegularlyComment =
            await getRemoteConfigStringValue("youtube_regularly_comment");
    const posted = await sayOnLive(
      youtubeRegularlyComment || "チャンネル登録お願いします！"
    );
    if (posted) console.log("コメントを投稿しました。");
  } catch (error) {
    console.error("コメント投稿中にエラー:", error);
  }
}
