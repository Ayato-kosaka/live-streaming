import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { View, Text, Animated, Image, TextStyle } from "react-native";
import { Stack } from "expo-router";
import * as Speech from "expo-speech";
import { settings } from "./config";
import { styles } from "./styles";
import { FireworkDisplay, RainEffect } from "./components";
import { NotificationData, Viewer } from "./types";

const NOTIFICATION_TYPES = [
  "donation",
  "superchat",
  "youtubeSubscriber",
  "membership",
] as const satisfies readonly NotificationData["type"][];

export default function AlertBox() {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [notification, setNotification] = useState<NotificationData | null>(
    null
  );
  const [notificationQueue, setNotificationQueue] = useState<
    NotificationData[]
  >([]);
  const [opacity] = useState(new Animated.Value(0));
  const sessionId = useRef(new Date().getTime());

  useEffect(() => {
    sendLog("mount"); // 👈 画面起動

    // GAS API から viewrs を取得する
    const fetchViewers = async () => {
      try {
        const response = await fetch(process.env.EXPO_PUBLIC_GAS_API_URL!);
        const data = await response.json();
        setViewers(data.viewers || []);
        sendLog("fetchViewersSuccess", {
          viewersCount: data.viewers?.length ?? 0,
        }); // 👈 成功ログ
      } catch (error) {
        sendLog("fetchViewersError", { error }); // 👈 エラーログ
      }
    };
    fetchViewers();

    let socket: WebSocket;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connect = () => {
      socket = new WebSocket(process.env.EXPO_PUBLIC_DONERU_WSS_URL!);

      socket.onopen = () => {
        sendLog("websocketConnected"); // 👈 接続ログ

        // 定期的に "ping" を送る
        const keepAliveInterval = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 30000);

        // クリーンアップ処理
        return () => {
          clearInterval(keepAliveInterval);
        };
      };

      socket.onmessage = (event) => {
        const data: NotificationData = JSON.parse(event.data);
        if (
          typeof data.type !== "string" ||
          !NOTIFICATION_TYPES.includes(data.type)
        ) {
          sendLog("websocketInvalidNotificationReceived", data);
        } else if (settings[data.type].enable !== 1) {
          sendLog("websocketNotificationDisabled", data);
        } else {
          sendLog("websocketMessageReceived", data); // 👈 受信ログ
          setNotificationQueue((prevQueue) => [...prevQueue, data]);
        }
      };

      socket.onerror = (error) => {
        sendLog("websocketError", { error: String(error) }); // 👈 エラーログ
      };

      socket.onclose = () => {
        sendLog("websocketClosed"); // 👈 切断ログ
        // 1秒後に再接続
        reconnectTimeout = setTimeout(connect, 1000);
      };
    };
    connect();

    Promise.all(NOTIFICATION_TYPES.map((v) => Image.prefetch(imageUrl(v))));

    // クリーンアップ
    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      socket.close();
      sendLog("unmount"); // 👈 画面離脱
    };
  }, []);

  useEffect(() => {
    if (!notification && notificationQueue.length > 0) {
      processNotificationQueue();
    }
  }, [notificationQueue, notification]);

  const processNotificationQueue = useCallback(async () => {
    if (notificationQueue.length === 0) return;

    const currentNotification = notificationQueue[0];
    sendLog("notificationDisplayed", currentNotification); // 👈 表示ログ

    iconUrl(currentNotification) &&
      (await Image.prefetch(iconUrl(currentNotification)!));
    // 通知を表示
    setNotification(currentNotification);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
    if (
      currentNotification.type === "donation" ||
      currentNotification.type === "superchat"
    )
      if (settings[currentNotification.type]?.tts.enable === 1)
        speak(currentNotification.message);

    // alertDuration秒後に通知を非表示
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
    }, settings[currentNotification.type]?.alertDuration * 1000 || 3000); // デフォルト値3000ms
  }, [notificationQueue]);

  const speak = (thingToSay: string) => {
    Speech.stop().then(() =>
      Speech.getAvailableVoicesAsync().then((availableVoices) =>
        Speech.speak(thingToSay, {
          language: "ja-JP",
          onError: (e) => {
            sendLog("ttsError", { message: e.message });
          },
          onBoundary: () => {},
          pitch: 1.0, // 声の高さ（0.1 - 2.0）
          rate: 1.0, // 読み上げ速度（0.1 - 10.0）
          voice:
            availableVoices.find((x) => x.language.includes("JP"))
              ?.identifier || "Google 日本語",
          volume: 0.8, // 音量（0.0 - 1.0）
        })
      )
    );
  };

  const mainTextTemplate = useMemo(
    () => (notification ? settings[notification.type].messageTemplate : ""),
    [notification]
  );
  const imageUrl = useCallback(
    (notificationType: NotificationData["type"] | null) =>
      notificationType
        ? `https://d1ewxqdha2zjcd.cloudfront.net/assets/images/${settings[notificationType].imageSource.hash}`
        : "",
    []
  );
  const mainTextStyle: TextStyle = useMemo(
    () =>
      notification
        ? {
            fontFamily: settings[notification.type].font,
            fontSize: settings[notification.type].fontSize,
            lineHeight: 1.5 * settings[notification.type].fontSize,
            fontWeight: settings[
              notification.type
            ].fontWeight.toString() as TextStyle["fontWeight"],
            color: settings[notification.type].fontColor,
          }
        : {},
    [notification]
  );
  const messageStyle: TextStyle = useMemo(
    () =>
      notification?.type === "donation" || notification?.type === "superchat"
        ? {
            fontFamily: settings[notification.type].message.font,
            fontSize: settings[notification.type].message.fontSize,
            lineHeight: 1.5 * settings[notification.type].message.fontSize,
            fontWeight: settings[
              notification.type
            ].message.fontWeight.toString() as TextStyle["fontWeight"],
            color: settings[notification.type].message.fontColor,
          }
        : {},
    [notification]
  );
  const emoji = useMemo(
    () =>
      notification &&
      viewers.find((v) => v.name === notification.nickname)?.emoji,
    [notification]
  );
  const iconUrl = useCallback(
    (notification: NotificationData | null) =>
      notification &&
      viewers.find((v) => v.name === notification.nickname)?.icon &&
      "https://lh3.googleusercontent.com/d/" +
        viewers.find((v) => v.name === notification.nickname)?.icon,
    [viewers]
  );
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

  const sendLog = useCallback(async (event: string, data: any = {}) => {
    try {
      const payload = {
        timestamp: new Date().toISOString(),
        sessionId: sessionId.current,
        screen: "AlertBox",
        event,
        gitCommit: process.env.EXPO_PUBLIC_GIT_COMMIT,
        data,
      };

      console.log(JSON.stringify(payload));
      await fetch(process.env.EXPO_PUBLIC_GAS_LOG_API_URL!, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("Failed to send log:", err);
    }
  }, []);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        {notification && (
          <Animated.View style={[styles.alertBox, { opacity }]}>
            {notification.type === "donation" && (
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
                    alertDuration={settings[notification.type].alertDuration}
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
                          ((settings[notification.type].alertDuration * 1000 -
                            2000) /
                            (effectCounts?.rainsCount || 1)) *
                          i
                        }
                      />
                    )
                  )}
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
                  <Text style={{ ...styles.message, ...messageStyle }}>
                    {notification.message}
                  </Text>
                </View>
              </View>
            )}
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
                    alertDuration={settings[notification.type].alertDuration}
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
                          ((settings[notification.type].alertDuration * 1000 -
                            2000) /
                            (effectCounts?.rainsCount || 1)) *
                          i
                        }
                      />
                    )
                  )}
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
                  <Text style={{ ...styles.message, ...messageStyle }}>
                    {notification.message}
                  </Text>
                </View>
              </View>
            )}
            {notification.type === "youtubeSubscriber" && (
              <View style={{ ...styles.alertContainer, flexDirection: "row" }}>
                <View style={{ height: "30%", width: "20%" }}></View>
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
