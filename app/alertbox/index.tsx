// AlertBox コンポーネント
// - 視聴者情報(GAS)の取得と名前正規化
// - WebSocket からの通知受信とキュー処理
// - 通知の表示/非表示アニメーション、画像プリフェッチ
// - 寄付金額に応じた表示時間の調整、TTS 読み上げ
// - 視聴者設定に応じた絵文字エフェクト表示

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { View, Text, Animated, Image, TextStyle } from "react-native";
import { Stack } from "expo-router";
import { settings } from "./config";
import { styles } from "./styles";
import { FireworkDisplay, RainEffect } from "./components";
import { NotificationData, Viewer } from "./types";
import { sendLog } from "@/lib/log";
import {
  matchViewerByNickname,
  normalizeName,
  normalizeNameNoEmoji,
} from "./matching.utils";
import { speak } from "./tts.utils";
import { getMainTextStyle, getSubMessageStyle } from "./styles.utils";

// 受け付け可能な通知タイプのリスト（ガードに利用）
const NOTIFICATION_TYPES = [
  "donation",
  "superchat",
  "youtubeSubscriber",
  "membership",
] as const satisfies readonly NotificationData["type"][];

export default function AlertBox() {
  // 視聴者情報（名前の正規化済み）
  const [normViewers, setNormViewers] = useState<
    (Viewer & { norm: string; normNoEmoji: string })[]
  >([]);

  // 現在表示中の通知（なければ null）
  const [notification, setNotification] = useState<NotificationData | null>(
    null
  );

  // 未処理の通知キュー（受信順に積まれて処理される）
  const [notificationQueue, setNotificationQueue] = useState<
    NotificationData[]
  >([]);

  // メインメッセージのスタイル（通知タイプに応じて切り替え）
  const mainTextStyle: TextStyle = useMemo(
    () => getMainTextStyle(notification ?? undefined),
    [notification]
  );

  // サブメッセージ（本文）のスタイル（寄付系のみ表示）
  const messageStyle: TextStyle = useMemo(
    () => getSubMessageStyle(notification ?? undefined),
    [notification]
  );

  // フェードイン/アウト用アニメーション値
  const [opacity] = useState(new Animated.Value(0));

  // セッション識別子（ログ相関用）
  const sessionId = useRef(new Date().getTime());

  // エラーメッセージ
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 画面起動ログ
    sendLog("AlertBox", sessionId, "mount");

    // 視聴者情報を GAS API から取得し、名前の正規化結果も持たせる
    const fetchViewers = async () => {
      try {
        const response = await fetch(process.env.EXPO_PUBLIC_GAS_API_URL!);
        const data = await response.json();
        const normViewers = (data.viewers ?? []).map((v: Viewer) => ({
          ...v,
          norm: normalizeName(v.name),
          normNoEmoji: normalizeNameNoEmoji(v.name),
        }));
        setNormViewers(normViewers);
        // 成功ログ（取得データのサマリを送信）
        sendLog("AlertBox", sessionId, "fetchViewersSuccess", {
          viewers: data.viewers,
          normViewers,
        });
      } catch (error) {
        // 失敗ログ
        sendLog("AlertBox", sessionId, "fetchViewersError", { error });
        setError("視聴者情報の取得に失敗しました");
      }
    };
    fetchViewers();

    // WebSocket 接続と再接続制御
    let socket: WebSocket;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connect = () => {
      // Doneru の WSS へ接続
      socket = new WebSocket(process.env.EXPO_PUBLIC_DONERU_WSS_URL!);

      socket.onopen = () => {
        // 接続ログ
        sendLog("AlertBox", sessionId, "websocketConnected");

        // 接続維持のため定期 ping を送信
        const keepAliveInterval = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 30000);

        // onopen のクリーンアップ関数（接続クローズ時に interval 解除）
        return () => {
          clearInterval(keepAliveInterval);
        };
      };

      socket.onmessage = (event) => {
        // 受信データをパースし、型と有効設定をチェック
        const data: NotificationData = JSON.parse(event.data);
        if (
          typeof data.type !== "string" ||
          !NOTIFICATION_TYPES.includes(data.type)
        ) {
          // 不正データの受信ログ
          sendLog(
            "AlertBox",
            sessionId,
            "websocketInvalidNotificationReceived",
            data
          );
        } else if (settings[data.type].enable !== 1) {
          // 設定で無効になっている通知タイプの場合はスキップ
          sendLog("AlertBox", sessionId, "websocketNotificationDisabled", data);
        } else {
          // 有効な通知はキューへ積む
          sendLog("AlertBox", sessionId, "websocketMessageReceived", data);
          setNotificationQueue((prevQueue) => [...prevQueue, data]);
        }
      };

      socket.onerror = (error) => {
        // 通信エラーログ
        sendLog("AlertBox", sessionId, "websocketError", {
          error: JSON.stringify(error),
        });
      };

      socket.onclose = () => {
        // 切断ログ → 1 秒後に再接続
        sendLog("AlertBox", sessionId, "websocketClosed");
        reconnectTimeout = setTimeout(connect, 1000);
      };
    };
    connect();

    // 通知画像のプリフェッチ（体感を滑らかに）
    Promise.all(NOTIFICATION_TYPES.map((v) => Image.prefetch(imageUrl(v))));

    // アンマウント時のクリーンアップ
    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      // 接続が存在すればクローズ
      socket.close();
      // 画面離脱ログ
      sendLog("AlertBox", sessionId, "unmount");
    };
  }, []);

  /**
   * 金額に応じてアラート時間を調整
   * donation/superchat のみ延長対象
   * - 10,000 以上: +30 秒
   * - 1,000 以上: +15 秒
   */
  const calculateAdjustedAlertDuration = (
    notification: NotificationData
  ): number => {
    const baseDuration = settings[notification.type]?.alertDuration || 3;

    // donation と superchat のみ金額による延長を適用
    if (notification.type === "donation" || notification.type === "superchat") {
      const amount = notification.amount || 0;

      if (amount >= 10000) {
        return baseDuration + 30; // +30秒
      } else if (amount >= 1000) {
        return baseDuration + 15; // +15秒
      }
    }

    return baseDuration; // 元の時間
  };

  useEffect(() => {
    // 表示中の通知がない場合のみ、次の通知を処理開始
    if (!notification && notificationQueue.length > 0) {
      processNotificationQueue();
    }
  }, [notificationQueue, notification]);

  // 通知キューの先頭を取り出して表示→一定時間後に非表示→キューから削除
  const processNotificationQueue = useCallback(async () => {
    if (notificationQueue.length === 0) return;

    const currentNotification = notificationQueue[0];
    // 表示ログ
    sendLog(
      "AlertBox",
      sessionId,
      "notificationDisplayed",
      currentNotification
    );

    // 視聴者アイコンがあれば先にプリフェッチ
    iconUrl(currentNotification) &&
      (await Image.prefetch(iconUrl(currentNotification)!));

    // 表示開始（フェードイン）
    setNotification(currentNotification);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();

    // 読み上げ（設定が有効な donation/superchat のみ）
    if (
      currentNotification.type === "donation" ||
      currentNotification.type === "superchat"
    )
      if (settings[currentNotification.type]?.tts.enable === 1)
        speak(currentNotification.message, (e) =>
          sendLog("AlertBox", sessionId, "ttsError", { message: e.message })
        );

    // 金額に応じて調整された表示時間
    const adjustedAlertDuration =
      calculateAdjustedAlertDuration(currentNotification);

    // 指定時間後にフェードアウト→完了後に通知をクリア＆キュー先頭を削除
    setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start();
      setTimeout(() => {
        setNotification(null);
        setNotificationQueue((prevQueue) => prevQueue.slice(1)); // キューから通知を削除
      }, 500);
    }, adjustedAlertDuration * 1000);
  }, [notificationQueue]);

  // テンプレート本文（通知タイプに紐づくテンプレートを取得）
  const mainTextTemplate = useMemo(
    () => (notification ? settings[notification.type].messageTemplate : ""),
    [notification]
  );

  // 通知タイプごとの画像 URL を生成
  const imageUrl = useCallback(
    (notificationType: NotificationData["type"] | null) =>
      notificationType
        ? `https://d1ewxqdha2zjcd.cloudfront.net/assets/images/${settings[notificationType].imageSource.hash}`
        : "",
    []
  );

  // 視聴者ニックネームから表示用の視聴者情報（絵文字/アイコン）を検索
  const matchedViewer = useMemo(() => {
    return notification
      ? (matchViewerByNickname(
          normViewers,
          notification.nickname
        ) as (typeof normViewers)[0])
      : null;
  }, [normViewers, notification?.nickname]);

  // エフェクト用絵文字
  const emoji = matchedViewer?.emoji;

  // 視聴者のカスタムアイコン URL（存在する場合のみ差し替え）
  const iconUrl = useCallback(
    (n: NotificationData | null) =>
      n && matchedViewer?.icon
        ? "https://lh3.googleusercontent.com/d/" + matchedViewer.icon
        : null,
    [matchedViewer]
  );

  // 金額に比例したエフェクト回数（花火/雨）を算出
  const effectCounts = useMemo(
    () =>
      notification?.type === "donation" || notification?.type === "superchat"
        ? {
            fireworksCount: Math.floor(notification.amount / 10000),
            rainsCount: Math.floor((notification.amount % 10000) / 100),
          }
        : null,
    [notification]
  );

  if (error) {
    return (
      <View style={styles.container}>
        <Text>{error}</Text>
      </View>
    );
  }

  return (
    <>
      {/* 画面ヘッダーを非表示 */}
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.container}>
        {notification && (
          <Animated.View style={[styles.alertBox, { opacity }]}>
            {/* 寄付（donation）用の表示 */}
            {notification.type === "donation" && (
              <View style={styles.alertContainer}>
                <Image
                  resizeMode="contain"
                  style={{ ...styles.image }}
                  source={{
                    uri: iconUrl(notification) || imageUrl(notification.type),
                  }}
                />

                {/* 視聴者に絵文字設定がある場合の花火エフェクト */}
                {emoji && (
                  <FireworkDisplay
                    style={styles.fireworkExplosion}
                    emoji={emoji}
                    count={effectCounts?.fireworksCount || 0}
                    alertDuration={calculateAdjustedAlertDuration(notification)}
                  />
                )}

                {/* 視聴者に絵文字設定がある場合の雨エフェクト */}
                {emoji &&
                  Array.from({ length: effectCounts?.rainsCount || 0 }).map(
                    (_, i) => (
                      <RainEffect
                        key={i}
                        index={i}
                        emoji={emoji}
                        // 表示時間全体に均等配置（最初と最後を少し余白）
                        delay={
                          ((calculateAdjustedAlertDuration(notification) *
                            1000 -
                            2000) /
                            (effectCounts?.rainsCount || 1)) *
                          i
                        }
                      />
                    )
                  )}

                {/* テキスト部（テンプレートの {名前} / {金額} を置換） */}
                <View style={styles.textContainer}>
                  <Text style={{ ...styles.message, ...mainTextStyle }}>
                    {mainTextTemplate.split(/(\{.*?\})/).map((part, index) => {
                      if (part === "{名前}") {
                        return (
                          <Text
                            key={index}
                            style={{
                              color:
                                settings[notification.type].fontHighlightColor,
                            }}
                          >
                            {notification.nickname}
                          </Text>
                        );
                      } else if (part === "{金額}") {
                        return (
                          <Text
                            key={index}
                            style={{
                              color:
                                settings[notification.type].fontHighlightColor,
                            }}
                          >
                            {notification.amount.toLocaleString()}
                          </Text>
                        );
                      }
                      return part; // 通常のテキスト
                    })}
                  </Text>

                  {/* メッセージ本文（寄付時のコメント） */}
                  <Text style={{ ...styles.message, ...messageStyle }}>
                    {notification.message}
                  </Text>
                </View>
              </View>
            )}

            {/* スーパーチャット（superchat）用の表示 */}
            {notification.type === "superchat" && (
              <View style={styles.alertContainer}>
                <Image
                  resizeMode="contain"
                  style={{ ...styles.image }}
                  source={{
                    uri: iconUrl(notification) || imageUrl(notification.type),
                  }}
                />

                {emoji && (
                  <FireworkDisplay
                    style={styles.fireworkExplosion}
                    emoji={emoji}
                    count={effectCounts?.fireworksCount || 0}
                    alertDuration={calculateAdjustedAlertDuration(notification)}
                  />
                )}

                {emoji &&
                  Array.from({ length: effectCounts?.rainsCount || 0 }).map(
                    (_, i) => (
                      <RainEffect
                        key={i}
                        index={i}
                        emoji={emoji}
                        delay={
                          ((calculateAdjustedAlertDuration(notification) *
                            1000 -
                            2000) /
                            (effectCounts?.rainsCount || 1)) *
                          i
                        }
                      />
                    )
                  )}

                {/* テンプレートの {名前} / {金額} / {単位} を置換 */}
                <View style={styles.textContainer}>
                  <Text style={{ ...styles.message, ...mainTextStyle }}>
                    {mainTextTemplate.split(/(\{.*?\})/).map((part, index) => {
                      if (part === "{名前}") {
                        return (
                          <Text
                            key={index}
                            style={{
                              color:
                                settings[notification.type].fontHighlightColor,
                            }}
                          >
                            {notification.nickname}
                          </Text>
                        );
                      } else if (part === "{金額}") {
                        return (
                          <Text
                            key={index}
                            style={{
                              color:
                                settings[notification.type].fontHighlightColor,
                            }}
                          >
                            {notification.amount.toLocaleString()}
                          </Text>
                        );
                      } else if (part === "{単位}") {
                        return (
                          <Text
                            key={index}
                            style={{
                              color:
                                settings[notification.type].fontHighlightColor,
                            }}
                          >
                            {notification.currency}
                          </Text>
                        );
                      }
                      return part; // 通常のテキスト
                    })}
                  </Text>

                  {/* メッセージ本文（スパチャ時のコメント） */}
                  <Text style={{ ...styles.message, ...messageStyle }}>
                    {notification.message}
                  </Text>
                </View>
              </View>
            )}

            {/* 新規チャンネル登録（YouTube Subscriber）用の表示 */}
            {notification.type === "youtubeSubscriber" && (
              <View style={{ ...styles.alertContainer, flexDirection: "row" }}>
                {/* 左側スペーサー */}
                <View style={{ height: "30%", width: "20%" }}></View>

                {/* 固定画像（YouTube 購読のアイコン） */}
                <Image
                  resizeMode="contain"
                  style={{ height: "30%", width: "30%" }}
                  source={{ uri: imageUrl(notification.type) }}
                />

                <View style={{ width: "40%" }}>
                  <Text style={{ ...styles.message, ...mainTextStyle }}>
                    {mainTextTemplate.split(/(\{.*?\})/).map((part, index) => {
                      if (part === "{名前}") {
                        return (
                          <Text
                            key={index}
                            style={{
                              color:
                                settings[notification.type].fontHighlightColor,
                            }}
                          >
                            {notification.nickname}
                          </Text>
                        );
                      }
                      return part; // 通常のテキスト
                    })}
                  </Text>
                </View>
              </View>
            )}

            {/* membership は未使用。必要になれば上記と同様の方針で実装 */}
            {/* {notification.type === 'membership' && (
              <View>
                <Text>{`New Membership from ${notification.nickname} at level: ${notification.level}`}</Text>
                <Text style={styles.message}>{getMessage()}</Text>
                <Image style={styles.image} source={{ uri: getImageUrl() }} />
              </View>
            )} */}
          </Animated.View>
        )}
      </View>
    </>
  );
}
