import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { C } from "../lib/colors";
import { getToken } from "../lib/storage";

export default function Index() {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    getToken().then(setToken);
  }, []);

  if (token === undefined) {
    return <View style={{ flex: 1, backgroundColor: C.obsidian }} />;
  }

  return token ? <Redirect href="/(app)/workspace" /> : <Redirect href="/(auth)/login" />;
}
