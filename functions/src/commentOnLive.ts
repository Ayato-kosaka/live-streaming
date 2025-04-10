import {getRemoteConfigStringValue} from "./remoteConfig";
import {youtube, oauth2Client} from "./youtubeClient";

/**
 * ライブ配信中のチャットに定期コメントを投稿します。
 * ライブがアクティブでない場合は何もしません。
 */
export async function commentOnLive(): Promise<void> {
  try {
    const youtubeRegularlyComment =
            await getRemoteConfigStringValue("youtube_regularly_comment");

    // アクセストークンを取得・更新（これは副作用として内部的にトークンが更新される）
    await oauth2Client.getAccessToken();
    console.log("AccessToken:", tokenInfo?.token);
    console.log("ExpiryDate:", oauth2Client.credentials.expiry_date);

    // 配信中のライブ配信を取得
    const liveRes = await youtube.liveBroadcasts.list({
      part: ["id", "snippet", "status"],
      broadcastStatus: "active",
    });

    if (liveRes.data.items?.length === 0) {
      console.log("ライブ配信は現在行われていません。");
      return;
    }

    const liveChatId = liveRes.data.items?.[0].snippet?.liveChatId;
    if (!liveChatId) {
      console.warn("liveChatId が取得できませんでした。");
      return;
    }

    await youtube.liveChatMessages.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          liveChatId: liveChatId,
          type: "textMessageEvent",
          textMessageDetails: {
            messageText: youtubeRegularlyComment || "チャンネル登録お願いします！",
          },
        },
      },
    });

    console.log("コメントを投稿しました。");
  } catch (error) {
    console.error("コメント投稿中にエラー:", error);
  }
}
