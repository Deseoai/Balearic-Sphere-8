import { Tabs, router } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { getMe } from "../../lib/api";
import { C } from "../../lib/colors";
import { getToken } from "../../lib/storage";

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 18, color: focused ? C.goldLight : C.muted }}>
      {symbol}
    </Text>
  );
}

export default function AppLayout() {
  const [isElite, setIsElite] = useState(false);

  useEffect(() => {
    getToken().then((token) => {
      if (!token) {
        router.replace("/(auth)/login");
        return;
      }
      getMe()
        .then((res) => setIsElite(res.user.isElite ?? res.user.role === "admin"))
        .catch(() => router.replace("/(auth)/login"));
    });
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.charcoal,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: 82,
          paddingBottom: 20,
          paddingTop: 8,
        },
        tabBarActiveTintColor: C.goldLight,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontSize: 10, letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen
        name="workspace"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => <TabIcon symbol="⌂" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="network"
        options={{
          title: "Network",
          tabBarIcon: ({ focused }) => <TabIcon symbol="◈" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ focused }) => <TabIcon symbol="◻" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ focused }) => <TabIcon symbol="◷" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="marketplace"
        options={{
          title: "Deals",
          tabBarIcon: ({ focused }) => <TabIcon symbol="◇" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="credits"
        options={{
          title: "Credits",
          tabBarIcon: ({ focused }) => <TabIcon symbol="◎" focused={focused} />,
        }}
      />
      {isElite && (
        <Tabs.Screen
          name="circle"
          options={{
            title: "Circle",
            tabBarIcon: ({ focused }) => <TabIcon symbol="✦" focused={focused} />,
          }}
        />
      )}
      <Tabs.Screen
        name="ai-tools"
        options={{
          title: "AI",
          tabBarIcon: ({ focused }) => <TabIcon symbol="✧" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => <TabIcon symbol="◉" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
