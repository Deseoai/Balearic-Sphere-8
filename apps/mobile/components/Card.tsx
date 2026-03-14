import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { C } from "../lib/colors";

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
  strong?: boolean;
};

export function Card({ children, style, strong }: Props) {
  return (
    <View
      style={[
        styles.card,
        strong ? styles.strong : styles.normal,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  normal: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  strong: {
    backgroundColor: C.charcoal,
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
});
