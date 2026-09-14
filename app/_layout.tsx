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
  const [loaded, fontError] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    "Kosugi Maru": require("../assets/fonts/KosugiMaru-Regular.ttf"),
    HuiFont29: require("../assets/fonts/HuiFont29.ttf"),
  });

  useEffect(() => {
    if (fontError) {
      // 理由は console にだけ。画面には出さない（OBS に映る面の親なので）
      console.error("字体を読めなかったので、既定の字体のまま出す —", fontError);
    }
    if (loaded || fontError) {
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
  }, [loaded, fontError]);

  /* 字体が読めなかったときに、**面ごと止めない。**

     ここは `/alertbox` `/daily_user_stats` `/ve-comment` `/ve-postit` の
     共通の親で、`return null` を返すと**その4面が全部まっさらになる。**
     投げ銭のお礼も、死んでいることを知らせる印も、まとめて消える。
     読めなかったのは字体で、中身は出せる。**出るものは既定の字体で出す。**
     字体は書き出しに同梱してあるので、ここに来るのはまれ。 */
  if (!loaded && !fontError) {
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
