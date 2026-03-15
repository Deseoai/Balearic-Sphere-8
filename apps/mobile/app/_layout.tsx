import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { registerPushToken } from "../lib/api";
import { C } from "../lib/colors";
import { getToken } from "../lib/storage";

// Show notifications when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function handleDeepLink(url: string) {
  try {
    const parsed = Linking.parse(url);
    const path = (parsed.path ?? "").replace(/^\//, "");
    // balea://verify?token=xxx  OR  https://app.balea-sphere8.com/verify?token=xxx
    if (path === "verify" && parsed.queryParams?.token) {
      router.push({
        pathname: "/(auth)/verify",
        params: { autoToken: parsed.queryParams.token as string },
      });
    }
  } catch {}
}

async function setupPushNotifications() {
  if (Platform.OS === "web") return;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  const sessionToken = await getToken();
  if (!sessionToken) return;

  try {
    // Uses Expo Push service — no APNs keys needed, Expo forwards to APNs
    const pushToken = await Notifications.getExpoPushTokenAsync();
    await registerPushToken(pushToken.data, "ios");
  } catch {
    // Non-critical — app works fine without push tokens
  }
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getToken().finally(() => setReady(true));
  }, []);

  // Deep link handling
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => handleDeepLink(url));
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });
    return () => sub.remove();
  }, []);

  // Push notification setup + tap handling
  useEffect(() => {
    if (!ready) return;

    setupPushNotifications().catch(() => {});

    // User tapped a notification → navigate to the right screen
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string>;
      if (data?.type === "chat_message") {
        router.push("/(app)/messages");
      } else if (data?.type === "intro_request") {
        router.push("/(app)/network");
      }
    });

    return () => sub.remove();
  }, [ready]);

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
