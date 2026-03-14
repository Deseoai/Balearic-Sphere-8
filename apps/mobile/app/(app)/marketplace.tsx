import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "../../components/Card";
import { createListing, getListings } from "../../lib/api";
import { C } from "../../lib/colors";
import type { MarketplaceListing } from "../../lib/api";

const LISTING_TYPES = ["opportunity", "request", "offer", "collaboration", "private_deal", "event_seat"];

export default function MarketplaceScreen() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState({ title: "", description: "", type: "opportunity", category: "" });

  const load = useCallback(async () => {
    try {
      const res = await getListings();
      setListings(res.listings);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function handleCreate() {
    if (!form.title.trim() || !form.description.trim()) {
      Alert.alert("Required", "Title and description are required.");
      return;
    }
    setCreating(true);
    try {
      await createListing({ ...form, status: "active" });
      setShowCreate(false);
      setForm({ title: "", description: "", type: "opportunity", category: "" });
      void load();
      Alert.alert("Published!", "Your listing has been published (costs 10 credits).");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      Alert.alert("Error", msg.includes("insufficient_credits") ? "Not enough credits. You need 10 credits." : "Could not publish listing.");
    } finally {
      setCreating(false);
    }
  }

  const filtered = listings.filter((l) => {
    if (!filter) return true;
    return l.title.toLowerCase().includes(filter.toLowerCase()) ||
      l.type.toLowerCase().includes(filter.toLowerCase()) ||
      l.category?.toLowerCase().includes(filter.toLowerCase());
  });

  const typeColor = (type: string) => {
    const m: Record<string, string> = { opportunity: "#a0c890", request: "#90b8e8", offer: C.goldLight, collaboration: "#c890c8", private_deal: C.danger };
    return m[type] ?? C.subdued;
  };

  const renderListing = ({ item }: { item: MarketplaceListing }) => (
    <Card>
      <View style={styles.listingHeader}>
        <Text style={[styles.typeTag, { color: typeColor(item.type), borderColor: typeColor(item.type) + "40" }]}>
          {item.type.replace(/_/g, " ")}
        </Text>
        {item.creditsCost > 0 && (
          <Text style={styles.costBadge}>{item.creditsCost} cr to access</Text>
        )}
      </View>
      <Text style={styles.listingTitle}>{item.title}</Text>
      <Text style={styles.listingDesc} numberOfLines={3}>{item.description}</Text>
      {item.category && <Text style={styles.listingMeta}>Category: {item.category}</Text>}
      {item.postedByName && <Text style={styles.listingMeta}>By: {item.postedByName}</Text>}
    </Card>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Marketplace</Text>
        <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)}>
          <Text style={styles.createBtnText}>+ List</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.search}
        value={filter}
        onChangeText={setFilter}
        placeholder="Filter by title, type, category…"
        placeholderTextColor={C.muted}
        autoCorrect={false}
        autoCapitalize="none"
      />

      <FlatList
        data={filtered}
        keyExtractor={(l) => l.id}
        renderItem={renderListing}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} />}
        ListEmptyComponent={<Text style={styles.empty}>No listings found.</Text>}
      />

      {/* Create Listing Modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Text style={styles.back}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle}>New Listing · 10 cr</Text>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView style={{ padding: 20 }}>
            <Text style={styles.label}>Title *</Text>
            <TextInput style={styles.input} value={form.title} onChangeText={(v) => setForm((p) => ({ ...p, title: v }))} placeholder="Clear, specific title…" placeholderTextColor={C.muted} />

            <Text style={styles.label}>Description *</Text>
            <TextInput style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]} value={form.description} onChangeText={(v) => setForm((p) => ({ ...p, description: v }))} placeholder="What are you offering, seeking, or proposing?" placeholderTextColor={C.muted} multiline autoCapitalize="sentences" />

            <Text style={styles.label}>Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {LISTING_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setForm((p) => ({ ...p, type: t }))}
                  style={[styles.typeBtn, form.type === t && styles.typeBtnActive]}
                >
                  <Text style={[styles.typeBtnText, form.type === t && { color: C.gold }]}>
                    {t.replace(/_/g, " ")}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>Category (optional)</Text>
            <TextInput style={styles.input} value={form.category} onChangeText={(v) => setForm((p) => ({ ...p, category: v }))} placeholder="e.g. real estate, hospitality…" placeholderTextColor={C.muted} autoCapitalize="none" />

            <TouchableOpacity style={[styles.btn, creating && styles.btnDisabled]} onPress={handleCreate} disabled={creating}>
              <Text style={styles.btnText}>{creating ? "Publishing…" : "Publish · 10 credits"}</Text>
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
  createBtn: { backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14 },
  createBtnText: { color: C.goldLight, fontSize: 13, fontWeight: "600" },
  search: { marginHorizontal: 18, marginBottom: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: C.ink },
  list: { paddingHorizontal: 18, paddingBottom: 40 },
  listingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  typeTag: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden" },
  costBadge: { fontSize: 10, color: C.muted, backgroundColor: C.goldBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
  listingTitle: { fontSize: 16, color: C.champagne, fontWeight: "600", marginBottom: 6 },
  listingDesc: { fontSize: 13, color: C.subdued, lineHeight: 19, marginBottom: 6 },
  listingMeta: { fontSize: 11, color: C.muted, marginTop: 2 },
  empty: { textAlign: "center", color: C.muted, marginTop: 40, fontSize: 14 },
  modal: { flex: 1, backgroundColor: C.obsidian },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  modalHeaderTitle: { fontSize: 16, color: C.champagne, fontWeight: "600" },
  back: { color: C.subdued, fontSize: 15, width: 60 },
  label: { fontSize: 11, color: C.subdued, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.ink, marginBottom: 14 },
  typeBtn: { paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  typeBtnActive: { borderColor: C.gold, backgroundColor: C.goldBg },
  typeBtnText: { fontSize: 12, color: C.subdued, textTransform: "capitalize" },
  btn: { backgroundColor: C.gold, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 20 },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: C.obsidian, fontSize: 15, fontWeight: "700" },
});
