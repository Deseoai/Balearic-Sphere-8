import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { C } from "../lib/colors";

type Props = {
  name?: string;
  avatarUrl?: string;
  size?: number;
};

export function Avatar({ name, avatarUrl, size = 40 }: Props) {
  const initials = name
    ? name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[styles.base, { width: size, height: size, borderRadius: size / 2 }]}
      />
    );
  }

  return (
    <View
      style={[
        styles.base,
        styles.placeholder,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={{ color: C.gold, fontSize: size * 0.35, fontWeight: "700" }}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(212,168,74,0.35)",
  },
  placeholder: {
    backgroundColor: "rgba(196,151,58,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
});
