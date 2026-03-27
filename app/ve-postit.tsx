import React, { useRef, useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Platform, Alert } from "react-native";
import html2canvas from "html2canvas";

const WEB_CAPTURE_SCALE_FLOOR = 3;

function buildFileName(title: string): string {
  const safeTitle = title.trim().replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "");
  const suffix = safeTitle.length > 0 ? `-${safeTitle}` : "";
  return `${Date.now()}${suffix}.png`;
}

export default function App() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const postitRef = useRef<View>(null);

  const captureAndSave = async () => {
    if (Platform.OS !== "web") {
      Alert.alert("Unsupported", "This screen supports image export only on Web.");
      return;
    }

    const node = postitRef.current as unknown as HTMLElement | null;
    if (!node) {
      Alert.alert("Error", "Capture target was not found.");
      return;
    }

    try {
      await document.fonts?.ready;

      const scale = Math.max(window.devicePixelRatio || 1, WEB_CAPTURE_SCALE_FLOOR);
      const canvas = await html2canvas(node, {
        backgroundColor: "#faf7e0",
        scale,
        useCORS: true,
        logging: false,
      });

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = buildFileName(title);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("captureAndSave failed", error);
      Alert.alert("Export failed", "Could not generate an image. Please try again.");
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Enter Title"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Enter Content"
        value={content}
        onChangeText={setContent}
        multiline
      />
      <View ref={postitRef} style={styles.postit}>
        <Text style={styles.postitTitle}>{title}</Text>
        <Text style={styles.postitContent}>
          {content.split("\n").map((c, i) => (
            <Text key={i} style={styles.underline}>{`${c}\n`}</Text>
          ))}
        </Text>
      </View>
      <Button title="Generate & Save" onPress={captureAndSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f8f9fa",
  },
  input: {
    width: "90%",
    height: 40,
    borderColor: "gray",
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginVertical: 5,
  },
  textArea: {
    height: 80,
  },
  postit: {
    width: 240,
    backgroundColor: "#faf7e0",
    padding: 16,
    justifyContent: "flex-start",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  postitTitle: {
    fontSize: 24,
    fontWeight: "bold",
    fontFamily: "HuiFont29",
    color: "#96242a",
    textAlign: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#49372b",
    paddingBottom: 8,
  },
  postitContent: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: "left",
    fontFamily: "HuiFont29",
    color: "#908a60",
    marginVertical: 16,
  },
  underline: {
    borderBottomWidth: 1,
    borderBottomColor: "#908a60",
    borderStyle: "dotted",
    paddingBottom: 2,
  },
});
