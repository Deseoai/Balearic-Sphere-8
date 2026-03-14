import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { C } from "../lib/colors";
import { getToken } from "../lib/storage";

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Small delay to allow AsyncStorage to hydrate
    getToken().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: C.obsidian }} />;
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.obsidian } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(auth)/verify" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}
