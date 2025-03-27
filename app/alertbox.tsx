import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image, TextStyle, StyleProp, Easing, ViewStyle, Dimensions } from 'react-native';
import { Stack } from 'expo-router';
import * as Speech from 'expo-speech';


export default function AlertBox() {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [notification, setNotification] = useState<NotificationData | null>(null);
  const [notificationQueue, setNotificationQueue] = useState<NotificationData[]>([]);
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
        sendLog("fetchViewersSuccess", { viewersCount: data.viewers?.length ?? 0 }); // 👈 成功ログ
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
        if (typeof data.type !== 'string' || !['donation', 'superchat', 'youtubeSubscriber', 'membership'].includes(data.type)) sendLog("websocketInvalidNotificationReceived", data);
        sendLog("websocketMessageReceived", data); // 👈 受信ログ
        setNotificationQueue((prevQueue) => [...prevQueue, data]);
      };
  
      socket.onerror = (error) => {
        sendLog("websocketError", { error: String(error) }); // 👈 エラーログ
      };
  
      socket.onclose = () => {
        sendLog("websocketClosed"); // 👈 切断ログ
        // 1秒後に再接続
        reconnectTimeout = setTimeout(connect, 1000);
      };
    }

    connect();

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

  const processNotificationQueue = useCallback(() => {
    if (notificationQueue.length === 0) return;

    const currentNotification = notificationQueue[0];
    sendLog("notificationDisplayed", currentNotification); // 👈 表示ログ

    // 通知を表示
    setNotification(currentNotification);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
    if (currentNotification.type === "donation" || currentNotification.type === "superchat") speak(currentNotification.message);

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
  }, [notificationQueue,])

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
          voice: availableVoices.find(x => x.language.includes("JP"))?.identifier || "Google 日本語",
          volume: 0.8, // 音量（0.0 - 1.0）
        })
      ))
  };

  const mainTextTemplate = useMemo(
    () => notification ? settings[notification.type].messageTemplate : '', [notification]);
  const imageUrl = useMemo(
    () => notification ? `https://d1ewxqdha2zjcd.cloudfront.net/assets/images/${settings[notification.type].imageSource.hash}` : '', [notification]);
  const mainTextStyle: TextStyle = useMemo(
    () => notification ? { fontFamily: settings[notification.type].font, fontSize: settings[notification.type].fontSize, lineHeight: 1.5 * settings[notification.type].fontSize, fontWeight: settings[notification.type].fontWeight.toString() as TextStyle["fontWeight"], color: settings[notification.type].fontColor } : {}, [notification]);
  const messageStyle: TextStyle = useMemo(
    () => notification?.type === "donation" || notification?.type === "superchat" ? { fontFamily: settings[notification.type].message.font, fontSize: settings[notification.type].message.fontSize, lineHeight: 1.5 * settings[notification.type].message.fontSize, fontWeight: settings[notification.type].message.fontWeight.toString() as TextStyle["fontWeight"], color: settings[notification.type].message.fontColor } : {}, [notification]);
  const emoji = useMemo(
    () => notification && viewers.find(v => v.name === notification.nickname)?.emoji, [notification]);
  const iconUrl = useMemo(
    () => notification &&
      viewers.find(v => v.name === notification.nickname)?.icon && 'https://lh3.googleusercontent.com/d/' + viewers.find(v => v.name === notification.nickname)?.icon
    , [viewers, notification]);
  const effectCounts = useMemo(
    () => notification?.type === "donation" || notification?.type === "superchat" ? {
      fireworksCount: Math.floor(notification.amount / 10000),
      rainsCount: Math.floor((notification.amount % 10000) / 100),
    } : null, [notification])

  const sendLog = useCallback(async (event: string, data: any = {}) => {
    try {
      const payload = {
        timestamp: new Date().toISOString(),
        sessionId: sessionId.current,
        screen: 'AlertBox',
        event,
        gitCommit: process.env.EXPO_PUBLIC_GIT_COMMIT,
        data
      };

      console.log(JSON.stringify(payload));
      await fetch(process.env.EXPO_PUBLIC_GAS_LOG_API_URL!, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
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
            {notification.type === 'donation' && (
              <View style={styles.alertContainer}>
                <Image resizeMode="contain" style={{ ...styles.image }} source={{ uri: iconUrl || imageUrl }} />
                {emoji && <FireworkDisplay style={styles.fireworkExplosion} emoji={emoji} count={effectCounts?.fireworksCount || 0} alertDuration={settings[notification.type].alertDuration} />}
                {emoji && Array.from({ length: effectCounts?.rainsCount || 0 }).map((_, i) => (<RainEffect key={i} index={i} emoji={emoji} delay={(settings[notification.type].alertDuration * 1000 - 2000) / (effectCounts?.rainsCount || 1) * i} />))}
                <View style={styles.textContainer}>
                  <Text style={{ ...styles.message, ...mainTextStyle }}>
                    {mainTextTemplate.split(/(\{.*?\})/).map((part, index) => {
                      if (part === '{名前}') {
                        return (<Text key={index} style={{ color: settings[notification.type].fontHighlightColor }}>{notification.nickname}</Text>);
                      } else if (part === '{金額}') {
                        return (<Text key={index} style={{ color: settings[notification.type].fontHighlightColor }}>{notification.amount.toLocaleString()}</Text>);
                      }
                      return part; // 通常のテキスト
                    })}
                  </Text>
                  <Text style={{ ...styles.message, ...messageStyle }}>{notification.message}</Text>
                </View>
              </View>
            )}
            {notification.type === 'superchat' && (
              <View style={styles.alertContainer}>
                <Image resizeMode="contain" style={{ ...styles.image }} source={{ uri: iconUrl || imageUrl }} />
                {emoji && <FireworkDisplay style={styles.fireworkExplosion} emoji={emoji} count={effectCounts?.fireworksCount || 0} alertDuration={settings[notification.type].alertDuration} />}
                {emoji && Array.from({ length: effectCounts?.rainsCount || 0 }).map((_, i) => (<RainEffect key={i} index={i} emoji={emoji} delay={(settings[notification.type].alertDuration * 1000 - 2000) / (effectCounts?.rainsCount || 1) * i} />))}
                <View style={styles.textContainer}>
                  <Text style={{ ...styles.message, ...mainTextStyle }}>
                    {mainTextTemplate.split(/(\{.*?\})/).map((part, index) => {
                      if (part === '{名前}') {
                        return (<Text key={index} style={{ color: settings[notification.type].fontHighlightColor }}>{notification.nickname}</Text>);
                      } else if (part === '{金額}') {
                        return (<Text key={index} style={{ color: settings[notification.type].fontHighlightColor }}>{notification.amount.toLocaleString()}</Text>);
                      } else if (part === '{単位}') {
                        return (<Text key={index} style={{ color: settings[notification.type].fontHighlightColor }}>{notification.currency}</Text>);
                      }
                      return part; // 通常のテキスト
                    })}
                  </Text>
                  <Text style={{ ...styles.message, ...messageStyle }}>{notification.message}</Text>
                </View>
              </View>
            )}
            {notification.type === 'youtubeSubscriber' && (
              <View style={{ ...styles.alertContainer, flexDirection: "row" }}>
                <View style={{ height: "30%", width: "20%" }}></View>
                <Image resizeMode="contain" style={{ height: "30%", width: "30%" }} source={{ uri: imageUrl }} />
                <View style={{ width: "40%", }}>
                  <Text style={{ ...styles.message, ...mainTextStyle }}>
                    {mainTextTemplate.split(/(\{.*?\})/).map((part, index) => {
                      if (part === '{名前}') {
                        return (<Text key={index} style={{ color: settings[notification.type].fontHighlightColor }}>{notification.nickname}</Text>);
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

const RainEffect: React.FC<{ index: number, emoji: string, delay: number }> = ({ index, emoji, delay }) => {
  const fallAnimation = new Animated.Value(-50);
  const windAnimation = new Animated.Value(0);
  const windowHeight = useRef(Dimensions.get("window").height).current;

  useEffect(() => {
    const startAnimation = () => {
      Animated.loop(
        Animated.timing(fallAnimation, {
          toValue: windowHeight + 50,
          duration: Math.random() * 2000 + 5000, // 5秒～7秒で落ちる
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();

      Animated.loop(
        Animated.timing(windAnimation, {
          toValue: Math.random() * 200 - 100, // 左右に揺れる（風の影響）
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        })
      ).start();
    }
    const timeout = setTimeout(startAnimation, delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  return (
    <Animated.Text
      style={{
        position: "absolute",
        fontSize: 80,
        left: `${Math.floor(Math.random() * (90 - 10 + 1)) + 10}%`,
        top: -50, // 画面外から落とす
        transform: [{ translateY: fallAnimation }, { translateX: windAnimation }],
      }}
    >
      {emoji}
    </Animated.Text>
  );
};

const FireworkEffect: React.FC<{ index: number, emoji: string }> = ({ index, emoji }) => {
  const animation = new Animated.Value(0);

  useEffect(() => {
    Animated.timing(animation, {
      toValue: 1,
      duration: 15000,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, []);

  const angle = (index / 16) * (2 * Math.PI); // 16方向均等配置
  const distance = 1500; // 飛び散る距離

  const translateX = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.cos(angle) * distance],
  });

  const translateY = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.sin(angle) * distance],
  });

  return (
    <Animated.Text
      style={{
        position: "absolute",
        fontSize: 60,
        left: '50%',
        top: '50%',
        transform: [{ translateX }, { translateY }],
      }}
    >
      {emoji}
    </Animated.Text>
  );
};

const FireworkExplosion: React.FC<{ emoji: string, delay: number }> = ({ emoji, delay }) => {
  const [triggerFireworks, setTriggerFireworks] = useState(false);
  const [isVisible, setIsVisible] = useState(true); // 表示状態を管理

  const left = useRef(Math.floor(Math.random() * (90 - 10 + 1)) + 10).current
  const maxBottom = useRef(Math.floor(Math.random() * (90 - 40 + 1)) + 40).current

  const opacityAnimated = useRef(new Animated.Value(1)).current; // 透明度のアニメーション
  const bottomPercentAnimated = useRef(new Animated.Value(0)).current;
  const bottomPercent = bottomPercentAnimated.interpolate({
    inputRange: [0, maxBottom],
    outputRange: ["-10%", `${maxBottom}%`],
  });

  useEffect(() => {
    const startAnimation = () => {
      Animated.timing(bottomPercentAnimated, {
        toValue: maxBottom,
        duration: 1000,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start(() => {
        setTriggerFireworks(true); // 上昇後に花火が弾ける
      });

      // 8秒後に非表示にする
      setTimeout(() => {
        Animated.timing(opacityAnimated, {
          toValue: 0,
          duration: 1000, // 1秒かけてフェードアウト
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start(() => {
          setIsVisible(false); // 完全にフェードアウトしたら削除
        });
      }, 8000);
    }

    // `delay` ミリ秒後に開始
    const timer = setTimeout(startAnimation, delay);

    return () => clearTimeout(timer); // クリーンアップ
  }, [delay]);

  if (!isVisible) return null;
  return (
    <Animated.View style={{ position: "absolute", left: `${left}%`, bottom: bottomPercent, opacity: opacityAnimated }} >
      <Text style={{ position: "absolute", fontSize: 180, left: -90, top: -90 }}>{emoji}</Text>
      {triggerFireworks && <View style={{ position: "absolute", alignItems: "center" }}>
        {Array.from({ length: 16 }).map((_, j) => (<FireworkEffect key={j} index={j} emoji={emoji} />))}
        <Text style={{ position: "absolute", fontSize: 180, left: -90, top: -90 }}>{emoji}</Text>
      </View>}
    </Animated.View>
  );
};

const FireworkDisplay: React.FC<{ style?: ViewStyle, emoji: string, count: number, alertDuration: number }> = ({ style, emoji, count, alertDuration }) => {
  return (
    <View style={{ ...style, position: "absolute", height: '100%', width: '100%' }}>
      {Array.from({ length: count }).map((_, index) => (
        <FireworkExplosion key={index} emoji={emoji} delay={index * Math.min(500, (alertDuration * 1000 - 2000) / count)} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertBox: {
    width: '100%',
    height: '100%',
  },
  alertContainer: {
    display: 'flex',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  image: {
    height: '100%',
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  textContainer: {
    zIndex: 3,
    textAlign: 'center',
    padding: 10,
  },
  fireworkExplosion: {
    zIndex: 2,
  },
  message: {
    margin: 0,
    padding: 0,
    textAlign: 'center',
    textShadowColor: 'black',
    textShadowOffset: { width: 2, height: 3 }, // Y 軸方向の影のオフセット
    textShadowRadius: 2, // 影の広がり（適切に調整）
    flexWrap: 'wrap', // `word-wrap: break-word;` に対応
  },
});


export interface Viewer {
  icon?: string;
  emoji?: string;
  name: string;
}

// {"amount":500,"assetID":null,"message":"こんにちは。これは通知テストです。","messageType":1,"nickname":"Doneru","test":true,"type":"donation"} 
// {"amount":500,"currency":"¥","jpy":500,"message":"こんにちは。これは通知テストです。","nickname":"Doneru","test":true,"type":"superchat"}
// {"nickname":"Doneru","test":true,"type":"youtubeSubscriber"}
// {"level":"test","nickname":"Doneru","test":true,"type":"membership"}

interface DonationNotification {
  amount: number;
  assetID: string | null;
  message: string;
  messageType: number;
  nickname: string;
  test: boolean;
  type: 'donation';
}

interface SuperChatNotification {
  amount: number;
  currency: string;
  jpy: number;
  message: string;
  nickname: string;
  test: boolean;
  type: 'superchat';
}

interface YouTubeSubscriberNotification {
  nickname: string;
  test: boolean;
  type: 'youtubeSubscriber';
}

interface MembershipNotification {
  level: string;
  nickname: string;
  test: boolean;
  type: 'membership';
}

type NotificationData =
  | DonationNotification
  | SuperChatNotification
  | YouTubeSubscriberNotification
  | MembershipNotification;

const settings = {
  "alertDelay": 5,
  "alertOrder": [
    "donation",
    "superchat",
    "youtubeSubscriber",
    "membership",
    "raid",
    "twitchSubscriber",
    "bit",
    "follower",
    "trialDonation",
    "support"
  ],
  "backgroundColor": "#ffffff",
  "customCss": "h1[data-v-0eb18151], h2[data-v-0eb18151] {\n    display: block;\n    margin: 0;\n    padding: 0;\n    line-height: 1.5;\n    text-align: center;\n    text-shadow: 0 0 1px blue;\n    word-wrap: break-word;\n}",
  "donation": {
    "enable": 1,
    "layout": 2,
    "startAnimation": "fadeIn",
    "endAnimation": "fadeOut",
    "minAmount": 0,
    "textAnimation": "headShake",
    "font": "Kosugi Maru",
    "fontSize": 32,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#37a9fd",
    "messageTemplate": "{名前} 様、{金額} 円の投げ銭ありがとうございます！",
    "imageSource": {
      "hash": "2b8554b15282b1xnx11m5ikor9y.png",
      "name": "1tkeBy9mMwKZPYn1736018521_1736018626.png"
    },
    "soundSource": {
      "name": "Coins.mp3",
      "hash": "Coins.mp3"
    },
    "soundVolume": 80,
    "alertDuration": 20,
    "message": {
      "enable": 1,
      "minAmount": 0,
      "font": "Kosugi Maru",
      "fontSize": 24,
      "fontWeight": 800,
      "fontColor": "#ffffff",
      "emote": 1
    },
    "tts": {
      "enable": 1,
      "minAmount": 0,
      "volume": 80,
      "speed": 100,
      "spamProtectedLevel": 0
    },
    "customAlert": []
  },
  "bit": {
    "enable": 0,
    "layout": 1,
    "startAnimation": "fadeIn",
    "endAnimation": "fadeOut",
    "minAmount": 100,
    "font": "Kosugi Maru",
    "fontSize": 64,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#32c3a6",
    "messageTemplate": "{名前}さんが{ビッツ}ビッツで応援しました!",
    "textAnimation": "headShake",
    "imageSource": {
      "name": "1000.gif",
      "hash": "1000.gif"
    },
    "soundSource": {
      "name": "bit.ogg",
      "hash": "bit.ogg"
    },
    "soundVolume": 80,
    "alertDuration": 10,
    "message": {
      "enable": 1,
      "minAmount": 0,
      "font": "Kosugi Maru",
      "fontSize": 24,
      "fontWeight": 400,
      "fontColor": "#ffffff"
    },
    "tts": {
      "enable": 1,
      "minAmount": 0,
      "volume": 80
    },
    "customAlert": []
  },
  "follower": {
    "enable": 0,
    "layout": 1,
    "startAnimation": "fadeIn",
    "endAnimation": "fadeOut",
    "messageTemplate": "{名前}さんがフォローしました!",
    "textAnimation": "headShake",
    "imageSource": {
      "name": "doneru.gif",
      "hash": "doneru.gif"
    },
    "soundSource": {
      "name": "Positive_Game_Sound_4.mp3",
      "hash": "Positive_Game_Sound_4.mp3"
    },
    "soundVolume": 50,
    "alertDuration": 8,
    "font": "Kosugi Maru",
    "fontSize": 64,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#32c3a6"
  },
  "raid": {
    "enable": 0,
    "layout": 1,
    "startAnimation": "fadeIn",
    "endAnimation": "fadeOut",
    "minAmount": 10,
    "messageTemplate": "{名前}さんが{人数}人をraidしました!",
    "textAnimation": "headShake",
    "imageSource": {
      "name": "doneru.gif",
      "hash": "doneru.gif"
    },
    "soundSource": {
      "name": "Positive_Game_Sound_4.mp3",
      "hash": "Positive_Game_Sound_4.mp3"
    },
    "soundVolume": 50,
    "alertDuration": 8,
    "font": "Kosugi Maru",
    "fontSize": 64,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#32c3a6",
    "customAlert": []
  },
  "loadOnReload": 0,
  "membership": {
    "enable": 0,
    "layout": 1,
    "startAnimation": "fadeIn",
    "endAnimation": "fadeOut",
    "messageTemplate": "{名前}さんが{レベル}のメンバーになりました!",
    "textAnimation": "headShake",
    "imageSource": {
      "name": "doneru.gif",
      "hash": "doneru.gif"
    },
    "soundSource": {
      "name": "Positive_Game_Sound_4.mp3",
      "hash": "Positive_Game_Sound_4.mp3"
    },
    "soundVolume": 50,
    "alertDuration": 8,
    "font": "Kosugi Maru",
    "fontSize": 64,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#32c3a6",
    "customAlert": []
  },
  "superchat": {
    "enable": 1,
    "layout": 2,
    "startAnimation": "fadeIn",
    "endAnimation": "fadeOut",
    "minAmount": 100,
    "font": "Kosugi Maru",
    "fontSize": 32,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#37a9fd",
    "messageTemplate": "{名前} 様、{単位}{金額}の投げ銭ありがとうございます！",
    "textAnimation": "headShake",
    "imageSource": {
      "hash": "2b8554b15282b1xnx11m5ikor9y.png",
      "name": "1tkeBy9mMwKZPYn1736018521_1736018626.png"
    },
    "soundSource": {
      "name": "Coins.mp3",
      "hash": "Coins.mp3"
    },
    "soundVolume": 80,
    "alertDuration": 10,
    "message": {
      "enable": 1,
      "minAmount": 0,
      "font": "Kosugi Maru",
      "fontSize": 24,
      "fontWeight": 400,
      "fontColor": "#ffffff"
    },
    "tts": {
      "enable": 1,
      "minAmount": 0,
      "volume": 80
    },
    "customAlert": []
  },
  "support": {
    "enable": 1,
    "layout": 1,
    "startAnimation": "fadeIn",
    "endAnimation": "fadeOut",
    "minAmount": 0,
    "textAnimation": "headShake",
    "font": "Kosugi Maru",
    "fontSize": 64,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#32c3a6",
    "messageTemplate": "{名前}さんが{月数}ヶ月目{金額}どねをサポートしました！",
    "imageSource": {
      "name": "doneru.gif",
      "hash": "doneru.gif"
    },
    "soundSource": {
      "name": "Coins.mp3",
      "hash": "Coins.mp3"
    },
    "soundVolume": 80,
    "alertDuration": 10,
    "message": {
      "enable": 1,
      "minAmount": 0,
      "font": "Kosugi Maru",
      "fontSize": 24,
      "fontWeight": 800,
      "fontColor": "#ffffff",
      "emote": 1
    },
    "tts": {
      "enable": 1,
      "minAmount": 0,
      "volume": 80,
      "speed": 100,
      "spamProtectedLevel": 0
    },
    "customAlert": []
  },
  "twitchSubscriber": {
    "enable": 0,
    "layout": 1,
    "startAnimation": "fadeIn",
    "endAnimation": "fadeOut",
    "messageTemplate": "{名前}さんが{ティア}をサブスクしました!",
    "textAnimation": "headShake",
    "imageSource": {
      "name": "doneru.gif",
      "hash": "doneru.gif"
    },
    "soundSource": {
      "name": "Positive_Game_Sound_4.mp3",
      "hash": "Positive_Game_Sound_4.mp3"
    },
    "soundVolume": 50,
    "alertDuration": 8,
    "font": "Kosugi Maru",
    "fontSize": 64,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#32c3a6",
    "message": {
      "enable": 1,
      "font": "Kosugi Maru",
      "fontSize": 24,
      "fontWeight": 400,
      "fontColor": "#ffffff"
    },
    "tts": {
      "enable": 1,
      "volume": 80,
      "spamProtectedLevel": 0
    },
    "customAlert": []
  },
  "youtubeSubscriber": {
    "enable": 1,
    "layout": 3,
    "startAnimation": "slideInLeft",
    "endAnimation": "slideOutRight",
    "messageTemplate": "{名前}様、チャンネル登録いただき感謝いたします。\nお茶とお菓子をお供に、ゆっくりとお楽しみくださいませ。",
    "textAnimation": "headShake",
    "imageSource": {
      "hash": "bda4b50da7d5b1xnx11m6as6l5o.png",
      "name": "YoP5WY4mGKBaRK01737724157_1737724259.png"
    },
    "soundSource": {
      "name": "Positive_Game_Sound_4.mp3",
      "hash": "Positive_Game_Sound_4.mp3"
    },
    "soundVolume": 50,
    "alertDuration": 8,
    "font": "Kosugi Maru",
    "fontSize": 17,
    "fontWeight": 800,
    "fontColor": "#ffffff",
    "fontHighlightColor": "#37a9fd"
  }
}