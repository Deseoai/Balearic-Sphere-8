import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { C } from "../../lib/colors";
import { requestMagicLink } from "../../lib/api";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleRequest() {
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await requestMagicLink(email.trim().toLowerCase());
      setSent(true);
    } catch {
      setError("Could not send magic link. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <Text style={styles.symbol}>✦</Text>
        <Text style={styles.title}>Check your inbox</Text>
        <Text style={styles.sub}>
          We sent a magic link to{"\n"}
          <Text style={{ color: C.goldLight }}>{email}</Text>
        </Text>
        <Text style={[styles.sub, { marginTop: 8, fontSize: 13 }]}>
          Tap the link in the email — it opens directly in the app.
        </Text>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.push("/(auth)/verify")}
        >
          <Text style={styles.secondaryText}>Enter token manually</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSent(false)}>
          <Text style={[styles.sub, { marginTop: 16, textDecorationLine: "underline" }]}>
            Wrong email? Go back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Text style={styles.symbol}>✦</Text>
      <Text style={styles.title}>Balea Sphere</Text>
      <Text style={styles.sub}>
        Private members network for the Balearic business ecosystem.
      </Text>

      <View style={styles.form}>
        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="your@email.com"
          placeholderTextColor={C.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={handleRequest}
          returnKeyType="send"
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleRequest}
          disabled={loading}
        >
          <Text style={styles.btnText}>
            {loading ? "Sending…" : "Send Magic Link"}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>
        Sign in securely — no password required.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.obsidian,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  symbol: {
    fontSize: 36,
    color: C.goldLight,
    marginBottom: 12,
  },
  title: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 32,
    color: "#F0D890",
    marginBottom: 10,
    textAlign: "center",
  },
  sub: {
    fontSize: 14,
    color: C.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  form: {
    width: "100%",
    marginTop: 36,
  },
  label: {
    fontSize: 11,
    color: C.subdued,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: C.ink,
    marginBottom: 16,
  },
  btn: {
    backgroundColor: C.gold,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    color: C.obsidian,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryText: {
    color: C.subdued,
    fontSize: 14,
  },
  error: {
    color: C.danger,
    fontSize: 13,
    marginBottom: 12,
  },
  footer: {
    marginTop: 40,
    fontSize: 12,
    color: C.muted,
  },
});
