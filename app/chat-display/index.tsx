import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  Animated,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Stack } from "expo-router";
import { Send } from "lucide-react-native";
import { ChatBubble } from "./components";
import { ChatPair, ChatDisplayProps } from "./types";
import { createChatPair } from "./utils";
import { sendLog } from "@/lib/log";

export default function ChatDisplay({
  displayDuration = 20,
}: ChatDisplayProps) {
  const [inputText, setInputText] = useState("");
  const [currentPair, setCurrentPair] = useState<ChatPair | null>(null);
  const [pairQueue, setPairQueue] = useState<ChatPair[]>([]);
  const [opacity] = useState(new Animated.Value(0));
  const [showUserMessage, setShowUserMessage] = useState(false);
  const [showBotReply, setShowBotReply] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const sessionId = useRef(new Date().getTime());

  // キューから次のペアを処理
  const processQueue = useCallback(async () => {
    if (pairQueue.length === 0 || currentPair) return;

    const nextPair = pairQueue[0];
    sendLog("ChatDisplay", sessionId, "pairDisplayed", nextPair);
    setCurrentPair(nextPair);

    // フェードイン開始
    Animated.timing(opacity, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();

    // ユーザーメッセージを表示
    setShowUserMessage(true);

    // 1秒後にボット返信を表示
    setTimeout(() => {
      setShowBotReply(true);
    }, 1000);

    // 指定時間後にフェードアウト
    setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        // アニメーション完了後にクリーンアップ
        setCurrentPair(null);
        setShowUserMessage(false);
        setShowBotReply(false);
        setPairQueue((prevQueue) => prevQueue.slice(1));
      });
    }, displayDuration * 1000);
  }, [pairQueue, currentPair, displayDuration, opacity]);

  // キューの変化を監視して処理を開始
  useEffect(() => {
    if (!currentPair && pairQueue.length > 0) {
      processQueue();
    }
  }, [pairQueue, currentPair, processQueue]);

  const handleSendMessage = useCallback(async () => {
    if (!inputText.trim()) return;

    try {
      const trimmed = inputText.trim();
      sendLog("ChatDisplay", sessionId, "userMessageSent", { text: trimmed });
      const newPair = await createChatPair(trimmed, sessionId);
      setPairQueue((prevQueue) => [...prevQueue, newPair]);
      sendLog("ChatDisplay", sessionId, "pairEnqueued", newPair);
      setInputText("");
    } catch (e) {
      sendLog("ChatDisplay", sessionId, "handleSendMessageError", {
        error: String(e),
      });
    }

    // キーボードを閉じる
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: true });
    }
  }, [inputText]);

  const handleKeyPress = useCallback(
    (event: any) => {
      if (event.nativeEvent.key === "Enter") {
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  useEffect(() => {
    sendLog("ChatDisplay", sessionId, "mount");
    let isCancelled = false;

    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    const fetchChat = async () => {
      sendLog("ChatDisplay", sessionId, "fetchChatStart");
      try {
        let liveId: string | null = null;
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${process.env.EXPO_PUBLIC_YOUTUBE_CHANNEL}&eventType=live&type=video&key=${process.env.EXPO_PUBLIC_YOUTUBE_API_KEY}`
        );
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          liveId = data.items[0].id.videoId as string;
          sendLog("ChatDisplay", sessionId, "liveIdFound", { liveId });
        } else {
          sendLog("ChatDisplay", sessionId, "liveNotStarted");
        }
        if (!liveId || isCancelled) return;

        const videoRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${liveId}&key=${process.env.EXPO_PUBLIC_YOUTUBE_API_KEY}`
        );
        const videoData = await videoRes.json();
        const chatId: string | undefined =
          videoData.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
        if (!chatId) return;
        sendLog("ChatDisplay", sessionId, "chatIdFound", { chatId });

        let pageToken: string | undefined;
        let isFirstFetch = true;
        let emptyFetchCount = 0;
        while (!isCancelled) {
          const chatRes = await fetch(
            `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${chatId}&part=snippet,authorDetails&key=${
              process.env.EXPO_PUBLIC_YOUTUBE_API_KEY
            }${pageToken ? `&pageToken=${pageToken}` : ""}`
          );
          const chatData = await chatRes.json();
          pageToken = chatData.nextPageToken;
          const chats = chatData.items || [];
          if (!isFirstFetch && chats.length > 10) {
            sendLog("ChatDisplay", sessionId, "tooMuchChats", {
              count: chats.length,
            });
            return;
          }
          sendLog("ChatDisplay", sessionId, "chatsFetched", {
            count: chats.length,
            pollingIntervalMillis: chatData.pollingIntervalMillis,
          });

          // チャットが空の場合、
          if (chats.length === 0) {
            emptyFetchCount++;
            // 10回連続で空のチャットが返ってきたら、30秒待機
            if (emptyFetchCount > 10) {
              sendLog("ChatDisplay", sessionId, "pauseDueToEmptyChats", {
                emptyFetchCount,
              });
              await sleep(30000);
            }
          } else {
            emptyFetchCount = 0;
          }

          if (!isFirstFetch && chats.length > 0) {
            const newPairs = await Promise.all(
              chats.map((c: any) =>
                createChatPair(
                  c.snippet?.displayMessage || "",
                  sessionId,
                  c.authorDetails?.profileImageUrl,
                  c.snippet?.publishedAt
                    ? Date.parse(c.snippet.publishedAt)
                    : undefined
                )
              )
            );
            setPairQueue((prev) => [...prev, ...newPairs]);
            sendLog("ChatDisplay", sessionId, "chatsFetched", {
              count: chats.length,
            });
          }
          isFirstFetch = false;
          const waitMs = Math.max(chatData.pollingIntervalMillis, 5000);
          await sleep(waitMs);
        }
      } catch (e) {
        sendLog("ChatDisplay", sessionId, "fetchChatError", {
          error: String(e),
        });
      }
    };

    fetchChat();

    return () => {
      isCancelled = true;
      sendLog("ChatDisplay", sessionId, "unmount");
    };
  }, []);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        {/* チャット表示エリア */}
        <View style={styles.chatArea}>
          {currentPair && (
            <Animated.View style={[styles.chatContainer, { opacity }]}>
              <View style={styles.messagesContainer}>
                {showUserMessage && (
                  <ChatBubble message={currentPair.userMessage} isUser={true} />
                )}
                {showBotReply && (
                  <ChatBubble message={currentPair.botReply} isUser={false} />
                )}
              </View>
              <View style={styles.botAvatarContainer}>
                {showBotReply && (
                  <Image
                    source={require("@/assets/images/chat-bot-avatar-img.png")}
                    resizeMode="contain"
                    style={styles.botAvatar}
                  />
                )}
              </View>
            </Animated.View>
          )}
        </View>

        {/* 入力エリア */}
        {/* <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.inputArea}
        >
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              onKeyPress={handleKeyPress}
              placeholder="メッセージを入力..."
              placeholderTextColor="#999"
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                { opacity: inputText.trim() ? 1 : 0.5 },
              ]}
              onPress={handleSendMessage}
              disabled={!inputText.trim()}
            >
              <Send size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View> */}

        {/* キュー状態表示 */}
        {/* {pairQueue.length > 0 && (
            <View style={styles.queueIndicator}>
              <Text style={styles.queueText}>待機中: {pairQueue.length}件</Text>
            </View>
          )}
        </KeyboardAvoidingView> */}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  chatArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  chatContainer: {
    width: "100%",
    height: "100%",
    paddingBottom: 48,
    paddingHorizontal: 64,
    backgroundColor: "#28a0f6",
    flexDirection: "row",
    alignItems: "flex-end",
    elevation: 5,
  },
  messagesContainer: {
    flex: 1,
    paddingVertical: 16,
  },
  botAvatarContainer: {
    width: 200,
    alignItems: "center",
    justifyContent: "flex-end",
    height: 300,
  },
  botAvatar: {
    width: "100%",
    height: 300,
  },
  inputArea: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#FFFFFF",
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginVertical: 8,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    maxHeight: 100,
    paddingVertical: 8,
    color: "#000",
  },
  sendButton: {
    backgroundColor: "#007AFF",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  queueIndicator: {
    alignItems: "center",
    paddingVertical: 4,
  },
  queueText: {
    fontSize: 12,
    color: "#666",
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
});
