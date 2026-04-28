import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/useColorScheme";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    "Kosugi Maru": require("../assets/fonts/KosugiMaru-Regular.ttf"),
    HuiFont29: require("../assets/fonts/HuiFont29.ttf"),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();

      // #62 bug fix: Androi 版 PRISMで黒背景が表示される。原因不明。
      // とりあえず、全ての div の背景色を透明にすることで対処。
      // setTimeout(() => {
      //   if (typeof document !== "undefined") {
      //     document.querySelectorAll("div").forEach((div) => {
      //       const bg = getComputedStyle(div).backgroundColor;
      //       if (bg !== "rgba(0, 0, 0, 0)") {
      //         div.style.backgroundColor = "transparent";
      //       }
      //     });
      //   }
      // }, 100);
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  let defaultTheme = DefaultTheme;
  defaultTheme.colors.background = "#fffffff";

  return (
    // bug #62 fix: Androi 版 PRISMで黒背景が表示される。原因不明。
    // DarkThemeでもDefaultThemeでもbackgroundがtransparentになるようにする。
    <ThemeProvider
      value={{
        ...(colorScheme === "dark" ? DarkTheme : DefaultTheme),
        colors: {
          ...(colorScheme === "dark" ? DarkTheme : DefaultTheme).colors,
          background: "transparent",
        },
      }}
    >
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
