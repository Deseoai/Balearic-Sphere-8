import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../components/Avatar";
import { Card } from "../../components/Card";
import { getMe, logout, updateMe } from "../../lib/api";
import { C } from "../../lib/colors";
import { removeToken } from "../../lib/storage";
import type { User } from "../../lib/api";
import { API_URL } from "../../lib/api";

export default function SettingsScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState({ displayName: "", companyName: "", industry: "", website: "" });
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getMe();
      setUser(res.user);
      setForm({
        displayName: res.user.displayName ?? "",
        companyName: res.user.companyName ?? "",
        industry: res.user.industry ?? "",
        website: (res.user as unknown as Record<string, string>)?.website ?? "",
      });
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateMe(form);
      Alert.alert("Saved", "Your profile has been updated.");
      void load();
    } catch {
      Alert.alert("Error", "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarPick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Please allow access to your photo library.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) return;

    setUploadingAvatar(true);
    try {
      const { getToken } = await import("../../lib/storage");
      const token = await getToken();
      const ext = asset.mimeType?.split("/")[1] ?? "jpg";
      const res = await fetch(`${API_URL}/v1/auth/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image: asset.base64, mimeType: asset.mimeType ?? "image/jpeg", extension: ext }),
      });
      if (!res.ok) throw new Error("Upload failed");
      Alert.alert("Photo updated!", "Your profile photo has been changed.");
      void load();
    } catch {
      Alert.alert("Error", "Could not upload photo.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try { await logout(); } catch { /* silent */ }
          await removeToken();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  const avatarUrl = user?.avatarUrl
    ? user.avatarUrl.startsWith("http") ? user.avatarUrl : `${API_URL}${user.avatarUrl}`
    : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Profile</Text>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <Avatar name={user?.displayName} avatarUrl={avatarUrl} size={80} />
          <TouchableOpacity style={styles.avatarBtn} onPress={handleAvatarPick} disabled={uploadingAvatar}>
            <Text style={styles.avatarBtnText}>
              {uploadingAvatar ? "Uploading…" : "Change Photo"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Badges */}
        <View style={styles.badges}>
          {user?.isVip && (
            <View style={[styles.badge, { borderColor: C.goldLight }]}>
              <Text style={[styles.badgeText, { color: C.goldLight }]}>✦ VIP</Text>
            </View>
          )}
          {user?.isElite && (
            <View style={[styles.badge, { borderColor: "#c890f0" }]}>
              <Text style={[styles.badgeText, { color: "#c890f0" }]}>✦ Elite</Text>
            </View>
          )}
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{user?.accessLevel?.replace(/_/g, " ")}</Text>
          </View>
        </View>

        {/* Form */}
        <Card>
          {[
            { label: "Display Name", key: "displayName", placeholder: "Your name" },
            { label: "Company", key: "companyName", placeholder: "Your company" },
            { label: "Industry", key: "industry", placeholder: "e.g. real_estate, hospitality…" },
            { label: "Website", key: "website", placeholder: "https://yoursite.com" },
          ].map((f) => (
            <View key={f.key}>
              <Text style={styles.label}>{f.label}</Text>
              <TextInput
                style={styles.input}
                value={form[f.key as keyof typeof form]}
                onChangeText={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                placeholder={f.placeholder}
                placeholderTextColor={C.muted}
                autoCapitalize={f.key === "website" || f.key === "industry" ? "none" : "words"}
                autoCorrect={false}
                keyboardType={f.key === "website" ? "url" : "default"}
              />
            </View>
          ))}
          <TouchableOpacity style={[styles.btn, saving && styles.btnDisabled]} onPress={handleSave} disabled={saving}>
            <Text style={styles.btnText}>{saving ? "Saving…" : "Save Profile"}</Text>
          </TouchableOpacity>
        </Card>

        {/* Account info */}
        <Card>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.infoText}>{user?.email}</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Trust Score</Text>
          <Text style={styles.infoText}>{user?.trustScore ?? 0} / 100</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Signal Score</Text>
          <Text style={styles.infoText}>{user?.signalScore ?? 0} / 100</Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Verification</Text>
          <Text style={styles.infoText}>{user?.verificationStatus}</Text>
        </Card>

        {/* Sign Out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.obsidian },
  content: { padding: 18, paddingBottom: 60 },
  title: { fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 26, color: "#F0D890", marginBottom: 20, marginTop: 8 },
  avatarSection: { alignItems: "center", marginBottom: 16 },
  avatarBtn: { marginTop: 12, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 18 },
  avatarBtnText: { color: C.subdued, fontSize: 14 },
  badges: { flexDirection: "row", gap: 8, justifyContent: "center", marginBottom: 16 },
  badge: { borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, color: C.muted, textTransform: "capitalize" },
  label: { fontSize: 10, color: C.muted, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 6 },
  input: { backgroundColor: C.charcoal, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.ink, marginBottom: 14 },
  btn: { backgroundColor: C.gold, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 4 },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: C.obsidian, fontSize: 15, fontWeight: "700" },
  infoText: { fontSize: 15, color: C.champagne, textTransform: "capitalize" },
  logoutBtn: { borderWidth: 1, borderColor: "rgba(201,123,110,0.35)", borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 8 },
  logoutText: { color: C.danger, fontSize: 15, fontWeight: "600" },
});
