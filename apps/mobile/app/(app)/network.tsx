import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../components/Avatar";
import { Card } from "../../components/Card";
import { getMe, getNetworkGraph, sendIntro } from "../../lib/api";
import { C } from "../../lib/colors";
import type { NetworkNode, User } from "../../lib/api";
import { API_URL } from "../../lib/api";

export default function NetworkScreen() {
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<NetworkNode | null>(null);
  const [introMsg, setIntroMsg] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const [graphRes, meRes] = await Promise.all([getNetworkGraph(), getMe()]);
      setMe(meRes.user);
      setNodes(graphRes.nodes.filter((n) => n.type === "user" && n.targetUserId));
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = nodes.filter((n) => {
    const q = search.toLowerCase();
    return (
      !q ||
      n.label.toLowerCase().includes(q) ||
      (n.company ?? "").toLowerCase().includes(q) ||
      (n.industry ?? "").toLowerCase().includes(q)
    );
  });

  async function handleIntro() {
    if (!selected?.targetUserId || !introMsg.trim()) return;
    setSending(true);
    try {
      await sendIntro(selected.targetUserId, introMsg.trim());
      Alert.alert("Intro Sent", "Your introduction has been sent successfully.");
      setSelected(null);
      setIntroMsg("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("insufficient_credits")) {
        Alert.alert("Not enough credits", "You need 15 credits to send an intro.");
      } else {
        Alert.alert("Error", "Could not send intro. Please try again.");
      }
    } finally {
      setSending(false);
    }
  }

  const renderNode = ({ item }: { item: NetworkNode }) => {
    const avatarUrl = item.avatarUrl
      ? item.avatarUrl.startsWith("http") ? item.avatarUrl : `${API_URL}${item.avatarUrl}`
      : undefined;
    return (
      <TouchableOpacity style={styles.memberRow} onPress={() => { setSelected(item); setIntroMsg(""); }}>
        <Avatar name={item.label} avatarUrl={avatarUrl} size={44} />
        <View style={styles.memberInfo}>
          <View style={styles.memberNameRow}>
            <Text style={styles.memberName}>{item.label}</Text>
            {item.isVip && <Text style={styles.vipBadge}>✦ VIP</Text>}
          </View>
          {item.company && <Text style={styles.memberCompany}>{item.company}</Text>}
          {item.industry && (
            <Text style={styles.memberIndustry}>{item.industry.replace(/_/g, " ")}</Text>
          )}
        </View>
        {item.trustScore != null && (
          <Text style={styles.trustBadge}>{item.trustScore}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Network</Text>
        <Text style={styles.count}>{nodes.length} members</Text>
      </View>

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name, company, industry…"
        placeholderTextColor={C.muted}
        autoCorrect={false}
        autoCapitalize="none"
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderNode}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No members found.</Text>
        }
      />

      {/* Member detail / intro modal */}
      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{selected?.label}</Text>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent}>
            {selected?.company && (
              <Text style={styles.modalMeta}>Company: {selected.company}</Text>
            )}
            {selected?.industry && (
              <Text style={styles.modalMeta}>Industry: {selected.industry.replace(/_/g, " ")}</Text>
            )}
            {selected?.trustScore != null && (
              <Text style={styles.modalMeta}>Trust Score: {selected.trustScore}</Text>
            )}
            {selected?.isVip && (
              <Card strong style={{ marginTop: 12 }}>
                <Text style={{ color: C.goldLight, fontSize: 13 }}>
                  ✦ VIP Member — costs 30 credits to intro
                </Text>
              </Card>
            )}

            <Text style={[styles.label, { marginTop: 20 }]}>
              Send Introduction · {selected?.isVip ? "30" : "15"} credits
            </Text>
            <TextInput
              style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]}
              value={introMsg}
              onChangeText={setIntroMsg}
              placeholder="Write a short introduction message…"
              placeholderTextColor={C.muted}
              multiline
              autoCapitalize="sentences"
            />

            <TouchableOpacity
              style={[styles.btn, (sending || !introMsg.trim()) && styles.btnDisabled]}
              onPress={handleIntro}
              disabled={sending || !introMsg.trim()}
            >
              <Text style={styles.btnText}>
                {sending ? "Sending…" : `Send Intro · ${selected?.isVip ? "30" : "15"} cr`}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.obsidian },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingTop: 12, paddingBottom: 8 },
  title: { fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 26, color: "#F0D890" },
  count: { fontSize: 12, color: C.muted },
  search: {
    marginHorizontal: 18, marginBottom: 10,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: C.ink,
  },
  list: { paddingHorizontal: 18, paddingBottom: 40 },
  memberRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)",
  },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  memberName: { fontSize: 15, color: C.champagne, fontWeight: "600" },
  vipBadge: { fontSize: 10, color: C.goldLight, backgroundColor: C.goldBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  memberCompany: { fontSize: 13, color: C.subdued, marginTop: 1 },
  memberIndustry: { fontSize: 11, color: C.muted, marginTop: 1, textTransform: "capitalize" },
  trustBadge: { fontSize: 13, color: C.gold, fontWeight: "700", marginLeft: 8 },
  empty: { textAlign: "center", color: C.muted, marginTop: 40, fontSize: 14 },
  modal: { flex: 1, backgroundColor: C.obsidian },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 22, color: "#F0D890" },
  closeBtn: { color: C.muted, fontSize: 18 },
  modalContent: { padding: 20 },
  modalMeta: { fontSize: 14, color: C.subdued, marginBottom: 6, textTransform: "capitalize" },
  label: { fontSize: 11, color: C.subdued, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: C.ink, marginBottom: 16 },
  btn: { backgroundColor: C.gold, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: C.obsidian, fontSize: 15, fontWeight: "700" },
});
