import React from "react";
import { View, Text, Image, StyleSheet, ViewStyle } from "react-native";
import { ChatMessage } from "./types";

interface ChatBubbleProps {
  message: ChatMessage;
  isUser: boolean;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, isUser }) => {
  const bubbleStyle: ViewStyle = {
    ...styles.bubble,
    ...(isUser ? styles.userBubble : styles.botBubble),
  };

  const containerStyle: ViewStyle = {
    ...styles.messageContainer,
    ...(isUser ? styles.userContainer : styles.botContainer),
  };

  return (
    <View style={containerStyle}>
      {isUser && (
        <View style={styles.avatarContainer}>
          <Image
            source={{ uri: message.avatarUrl || "https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&dpr=1" }}
            style={styles.avatar}
          />
        </View>
      )}

      <View style={bubbleStyle}>
        <Text style={isUser ? styles.userText : styles.botText}>
          {message.text}
        </Text>
      </View>

      {/* {!isUser && (
        <View style={styles.avatarContainer}>
          <Image
            source={require("@/assets/images/chat-bot-avatar-img.png")}
            style={styles.avatar}
          />
        </View>
      )} */}
    </View>
  );
};

const styles = StyleSheet.create({
  messageContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginVertical: 8,
    paddingHorizontal: 16,
  },
  botContainer: {
    justifyContent: "flex-end",
  },
  userContainer: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "70%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  botBubble: {
    backgroundColor: "#d33682",
    borderBottomRightRadius: 4,
    marginLeft: 8,
  },
  userBubble: {
    backgroundColor: "#F0F0F0",
    borderBottomLeftRadius: 4,
    marginRight: 8,
  },
  botText: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 20,
  },
  userText: {
    color: "#000000",
    fontSize: 16,
    lineHeight: 20,
  },
  avatarContainer: {
    width: 40,
    height: 40,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E0E0E0",
  },
});
