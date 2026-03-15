import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { verifyMagicLink } from "../../lib/api";
import { C } from "../../lib/colors";
import { setToken } from "../../lib/storage";

export default function VerifyScreen() {
  const { autoToken } = useLocalSearchParams<{ autoToken?: string }>();
  const [token, setTokenInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-verify when app was opened via magic link deep link
  useEffect(() => {
    if (autoToken) {
      handleVerify(autoToken);
    }
  }, [autoToken]);

  async function handleVerify(raw?: string) {
    const input = (raw ?? token).trim();
    if (!input) {
      setError("Please paste your magic link token.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Support both full URL and raw token
      let finalToken = input;
      if (input.includes("token=")) {
        finalToken = new URL(input).searchParams.get("token") ?? input;
      }
      const res = await verifyMagicLink(finalToken);
      await setToken(res.token);
      router.replace("/(app)/workspace");
    } catch {
      setError("Invalid or expired token. Please request a new magic link.");
    } finally {
      setLoading(false);
    }
  }

  if (autoToken && loading) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <Text style={styles.symbol}>✦</Text>
        <Text style={styles.title}>Signing you in…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Enter Token</Text>
      <Text style={styles.sub}>
        Paste the token from your magic link email, or the full URL.
      </Text>

      <View style={styles.form}>
        <TextInput
          style={[styles.input, styles.tokenInput]}
          value={token}
          onChangeText={setTokenInput}
          placeholder="Paste token or full magic link URL…"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={() => handleVerify()}
          disabled={loading}
        >
          <Text style={styles.btnText}>
            {loading ? "Verifying…" : "Sign In"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.obsidian,
    paddingHorizontal: 28,
    paddingTop: 70,
  },
  back: { marginBottom: 32 },
  backText: { color: C.subdued, fontSize: 15 },
  symbol: {
    fontSize: 36,
    color: C.goldLight,
    marginBottom: 16,
    textAlign: "center",
  },
  title: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 26,
    color: "#F0D890",
    marginBottom: 8,
  },
  sub: { fontSize: 14, color: C.muted, lineHeight: 20, marginBottom: 28 },
  form: { width: "100%" },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: C.ink,
    marginBottom: 16,
  },
  tokenInput: { minHeight: 80, textAlignVertical: "top" },
  btn: {
    backgroundColor: C.gold,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: C.obsidian, fontSize: 15, fontWeight: "700" },
  error: { color: C.danger, fontSize: 13, marginBottom: 12 },
});
