import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../components/Avatar";
import { Card } from "../../components/Card";
import { getCredits, getMe } from "../../lib/api";
import { C } from "../../lib/colors";
import type { CreditWallet, User } from "../../lib/api";

export default function WorkspaceScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [wallet, setWallet] = useState<CreditWallet | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [meRes, credRes] = await Promise.all([getMe(), getCredits()]);
      setUser(meRes.user);
      setWallet(credRes.wallet);
    } catch {
      router.replace("/(auth)/login");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const trustPct = Math.min(100, user?.trustScore ?? 0);
  const signalPct = Math.min(100, user?.signalScore ?? 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.name}>
              {user?.displayName ?? user?.email ?? "Member"}
            </Text>
            {user?.companyName && (
              <Text style={styles.company}>{user.companyName}</Text>
            )}
          </View>
          <TouchableOpacity onPress={() => router.push("/(app)/settings")}>
            <Avatar name={user?.displayName} avatarUrl={user?.avatarUrl} size={48} />
          </TouchableOpacity>
        </View>

        {/* Credits Card */}
        <Card strong style={styles.creditsCard}>
          <Text style={styles.cardLabel}>Credit Balance</Text>
          <Text style={styles.creditsAmount}>{wallet?.balance ?? "—"}</Text>
          <Text style={styles.creditsUnit}>credits available</Text>
          <TouchableOpacity
            style={styles.topUpBtn}
            onPress={() => router.push("/(app)/credits")}
          >
            <Text style={styles.topUpText}>+ Top Up</Text>
          </TouchableOpacity>
        </Card>

        {/* Scores */}
        <View style={styles.row}>
          <Card style={[styles.scoreCard, { marginRight: 6 }]}>
            <Text style={styles.cardLabel}>Trust Score</Text>
            <Text style={styles.scoreValue}>{user?.trustScore ?? 0}</Text>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${trustPct}%`, backgroundColor: C.gold }]} />
            </View>
          </Card>
          <Card style={[styles.scoreCard, { marginLeft: 6 }]}>
            <Text style={styles.cardLabel}>Signal Score</Text>
            <Text style={styles.scoreValue}>{user?.signalScore ?? 0}</Text>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${signalPct}%`, backgroundColor: C.goldLight }]} />
            </View>
          </Card>
        </View>

        {/* VIP Badge */}
        {user?.isVip && (
          <Card strong>
            <Text style={[styles.cardLabel, { color: C.goldLight }]}>✦ VIP Member</Text>
            <Text style={{ color: C.champagne, fontSize: 13, marginTop: 4 }}>
              You earn credits when others contact you. +8 cr per intro, +3 cr per 10 profile views.
            </Text>
          </Card>
        )}

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionGrid}>
          {[
            { label: "Network", icon: "◈", route: "/(app)/network" },
            { label: "Messages", icon: "◻", route: "/(app)/messages" },
            { label: "Events", icon: "◷", route: "/(app)/events" },
            { label: "Deals", icon: "◇", route: "/(app)/marketplace" },
            { label: "AI Tools", icon: "✧", route: "/(app)/ai-tools" },
            { label: "Settings", icon: "◉", route: "/(app)/settings" },
          ].map((a) => (
            <TouchableOpacity
              key={a.label}
              style={styles.actionBtn}
              onPress={() => router.push(a.route as never)}
            >
              <Text style={styles.actionIcon}>{a.icon}</Text>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Access Level */}
        <Card>
          <Text style={styles.cardLabel}>Access Level</Text>
          <Text style={[styles.scoreValue, { textTransform: "capitalize" }]}>
            {user?.accessLevel?.replace(/_/g, " ") ?? "—"}
          </Text>
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
            Verification: {user?.verificationStatus ?? "—"}
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.obsidian },
  scroll: { flex: 1 },
  content: { padding: 18, paddingBottom: 40 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    marginTop: 8,
  },
  greeting: { fontSize: 12, color: C.muted, letterSpacing: 0.5 },
  name: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 24,
    color: "#F0D890",
    marginTop: 2,
  },
  company: { fontSize: 13, color: C.subdued, marginTop: 2 },
  creditsCard: { alignItems: "center", paddingVertical: 24 },
  cardLabel: { fontSize: 10, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 },
  creditsAmount: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 52,
    color: C.goldLight,
    lineHeight: 58,
  },
  creditsUnit: { fontSize: 13, color: C.muted, marginBottom: 16 },
  topUpBtn: {
    backgroundColor: C.goldBg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  topUpText: { color: C.goldLight, fontSize: 13, fontWeight: "600" },
  row: { flexDirection: "row", marginBottom: 0 },
  scoreCard: { flex: 1, marginBottom: 12 },
  scoreValue: { fontSize: 28, color: C.champagne, fontWeight: "700", marginTop: 2 },
  progressBg: { height: 3, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 8, overflow: "hidden" },
  progressFill: { height: 3, borderRadius: 2 },
  sectionTitle: { fontSize: 11, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12, marginTop: 4 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5, marginBottom: 12 },
  actionBtn: {
    width: "30%",
    margin: "1.5%",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  actionIcon: { fontSize: 20, color: C.gold, marginBottom: 4 },
  actionLabel: { fontSize: 11, color: C.subdued },
});
