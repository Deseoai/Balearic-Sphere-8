import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "../../components/Card";
import { getAiHistory, getCredits, getNetworkGraph, runAiTool } from "../../lib/api";
import { C } from "../../lib/colors";
import type { AiRequest, NetworkNode } from "../../lib/api";

const TOOLS = [
  { type: "matchmaking", label: "Member Matchmaking", icon: "◈", description: "Surface your top 3–5 best-fit connections from the live member network.", inputMode: "none" as const, runLabel: "Run Analysis" },
  { type: "intro_engine", label: "Intro Engine", icon: "✦", description: "Get a personalised, ready-to-send introduction message for a specific member.", inputMode: "member" as const, runLabel: "Draft Intro" },
  { type: "profile_optimization", label: "Profile Optimizer", icon: "◎", description: "Get a concrete improvement plan for your profile, listings, and activity.", inputMode: "none" as const, runLabel: "Analyse Profile" },
  { type: "deal_radar", label: "Deal Radar", icon: "⊕", description: "Scan all active marketplace listings and surface the most relevant opportunities.", inputMode: "text" as const, placeholder: "e.g. Off-market real estate under €5M in Mallorca…", runLabel: "Scan Deals" },
  { type: "marketplace_assistant", label: "Listing Writer", icon: "◇", description: "Describe what you want to list and get a polished listing draft ready to publish.", inputMode: "text" as const, placeholder: "e.g. A co-investment opportunity in a boutique hotel…", runLabel: "Draft Listing" },
  { type: "summary", label: "Network Summary", icon: "◉", description: "Get a strategic overview of your network position and your three highest-leverage next moves.", inputMode: "none" as const, runLabel: "Generate Summary" },
  { type: "reputation_signal", label: "Reputation Signal", icon: "⬡", description: "Analyse your trust and signal scores and get a prioritised action plan to grow them.", inputMode: "none" as const, runLabel: "Analyse Scores" },
  { type: "concierge", label: "Strategic Concierge", icon: "✧", description: "State your goal and get one decisive, tailored strategic recommendation.", inputMode: "text" as const, placeholder: "e.g. I want to close two new investor relationships in 30 days…", runLabel: "Get Recommendation" },
];

export default function AiToolsScreen() {
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<AiRequest[]>([]);
  const [members, setMembers] = useState<NetworkNode[]>([]);
  const [selected, setSelected] = useState<typeof TOOLS[0] | null>(null);
  const [textPrompt, setTextPrompt] = useState("");
  const [selectedMember, setSelectedMember] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resultModal, setResultModal] = useState<AiRequest | null>(null);

  const load = useCallback(async () => {
    try {
      const [credRes, histRes] = await Promise.all([getCredits(), getAiHistory()]);
      setBalance(credRes.wallet.balance);
      setHistory(histRes.items.slice(0, 10));
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected || selected.inputMode !== "member" || members.length > 0) return;
    getNetworkGraph()
      .then((r) => setMembers(r.nodes.filter((n) => n.type === "user" && n.targetUserId)))
      .catch(() => {});
  }, [selected, members.length]);

  async function handleSubmit() {
    if (!selected || submitting) return;
    let prompt = "__auto__";
    if (selected.inputMode === "member") {
      if (!selectedMember) { Alert.alert("Select a member first."); return; }
      prompt = selectedMember;
    } else if (selected.inputMode === "text") {
      if (!textPrompt.trim()) { Alert.alert("Please describe your request."); return; }
      prompt = textPrompt.trim();
    }

    setSubmitting(true);
    try {
      const res = await runAiTool(selected.type, prompt);
      await load();
      setSelected(null);
      setTextPrompt("");
      setSelectedMember("");
      // Show result immediately if completed
      if (res.status === "completed" && res.responseSummary) {
        setResultModal({ id: res.id, promptType: selected.type, prompt, status: "completed", responseSummary: res.responseSummary, createdAt: new Date().toISOString() });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("insufficient_credits")) {
        Alert.alert("Not enough credits", "You need 8 credits to run an AI tool.");
      } else {
        Alert.alert("Error", "Could not run AI tool. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const COST = 8;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>AI Tools</Text>
          <View style={[styles.balancePill, balance < COST && { borderColor: "rgba(201,123,110,0.4)" }]}>
            <Text style={[styles.balanceText, balance < COST && { color: C.danger }]}>
              {balance} cr
            </Text>
          </View>
        </View>
        <Text style={styles.sub}>Platform-data analyses · 8 credits each</Text>

        {/* Tool Grid */}
        <View style={styles.toolGrid}>
          {TOOLS.map((t) => (
            <TouchableOpacity
              key={t.type}
              style={[styles.toolBtn, selected?.type === t.type && styles.toolBtnActive]}
              onPress={() => { setSelected(selected?.type === t.type ? null : t); setTextPrompt(""); setSelectedMember(""); }}
            >
              <Text style={[styles.toolIcon, selected?.type === t.type && { color: C.gold }]}>{t.icon}</Text>
              <Text style={[styles.toolLabel, selected?.type === t.type && { color: C.champagne }]} numberOfLines={2}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tool Config Panel */}
        {selected && (
          <Card style={styles.configPanel}>
            <Text style={styles.configTitle}>{selected.icon} {selected.label}</Text>
            <Text style={styles.configDesc}>{selected.description}</Text>

            {selected.inputMode === "none" && (
              <Text style={styles.autoNote}>Uses your live profile and platform data automatically.</Text>
            )}

            {selected.inputMode === "member" && (
              members.length === 0
                ? <Text style={styles.autoNote}>Loading members…</Text>
                : <View style={styles.memberList}>
                    {members.map((m) => (
                      <TouchableOpacity
                        key={m.targetUserId}
                        style={[styles.memberOption, selectedMember === m.targetUserId && styles.memberOptionActive]}
                        onPress={() => setSelectedMember(m.targetUserId!)}
                      >
                        <Text style={[styles.memberOptionText, selectedMember === m.targetUserId && { color: C.gold }]}>
                          {m.label}{m.company ? ` — ${m.company}` : ""}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
            )}

            {selected.inputMode === "text" && (
              <TextInput
                style={styles.input}
                value={textPrompt}
                onChangeText={setTextPrompt}
                placeholder={selected.placeholder}
                placeholderTextColor={C.muted}
                multiline
                numberOfLines={3}
                autoCapitalize="sentences"
              />
            )}

            <View style={styles.submitRow}>
              <Text style={styles.costNote}>Costs <Text style={{ color: C.gold, fontWeight: "700" }}>8 credits</Text> · You have {balance} cr</Text>
              <TouchableOpacity
                style={[styles.submitBtn, (submitting || balance < COST) && styles.btnDisabled]}
                onPress={handleSubmit}
                disabled={submitting || balance < COST}
              >
                <Text style={styles.submitBtnText}>{submitting ? "Running…" : `${selected.runLabel} · 8 cr`}</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

        {/* History */}
        {history.length > 0 && (
          <>
            <Text style={styles.historyLabel}>Recent Analyses</Text>
            {history.map((req) => {
              const toolMeta = TOOLS.find((t) => t.type === req.promptType);
              return (
                <TouchableOpacity key={req.id} onPress={() => req.responseSummary && setResultModal(req)}>
                  <Card>
                    <View style={styles.histRow}>
                      <Text style={styles.histIcon}>{toolMeta?.icon ?? "◈"}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.histLabel}>{toolMeta?.label ?? req.promptType}</Text>
                        <Text style={styles.histTime}>{new Date(req.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</Text>
                      </View>
                      <Text style={[styles.statusBadge, req.status === "completed" ? styles.completed : req.status === "failed" ? styles.failed : styles.queued]}>
                        {req.status}
                      </Text>
                    </View>
                    {req.responseSummary && (
                      <Text style={styles.histPreview} numberOfLines={2}>{req.responseSummary}</Text>
                    )}
                  </Card>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Result Modal */}
      <Modal visible={!!resultModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setResultModal(null)}>
        <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {TOOLS.find((t) => t.type === resultModal?.promptType)?.label ?? "AI Result"}
            </Text>
            <TouchableOpacity onPress={() => setResultModal(null)}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ padding: 20 }}>
            <Text style={styles.resultText}>{resultModal?.responseSummary}</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.obsidian },
  content: { padding: 18, paddingBottom: 60 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4, marginTop: 8 },
  title: { fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 26, color: "#F0D890" },
  balancePill: { borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  balanceText: { fontSize: 13, color: C.gold, fontWeight: "600" },
  sub: { fontSize: 12, color: C.muted, marginBottom: 16 },
  toolGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5, marginBottom: 12 },
  toolBtn: { width: "23%", margin: "1%", backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 10, alignItems: "center" },
  toolBtnActive: { borderColor: "rgba(196,151,58,0.45)", backgroundColor: "rgba(196,151,58,0.10)" },
  toolIcon: { fontSize: 18, color: "rgba(196,151,58,0.50)", marginBottom: 4 },
  toolLabel: { fontSize: 9, color: C.muted, textAlign: "center", lineHeight: 12 },
  configPanel: { marginBottom: 12 },
  configTitle: { fontSize: 15, color: C.champagne, fontWeight: "600", marginBottom: 4 },
  configDesc: { fontSize: 13, color: C.muted, lineHeight: 18, marginBottom: 12 },
  autoNote: { fontSize: 12, color: "rgba(196,151,58,0.50)", fontStyle: "italic", marginBottom: 12 },
  memberList: { marginBottom: 12, maxHeight: 200 },
  memberOption: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: C.border },
  memberOptionActive: { borderColor: C.gold, backgroundColor: C.goldBg },
  memberOptionText: { fontSize: 13, color: C.subdued },
  input: { backgroundColor: "rgba(0,0,0,0.25)", borderWidth: 1, borderColor: "rgba(196,151,58,0.16)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.champagne, marginBottom: 12, minHeight: 80, textAlignVertical: "top" },
  submitRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  costNote: { fontSize: 11, color: "rgba(196,151,58,0.50)", flex: 1 },
  submitBtn: { backgroundColor: C.gold, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 },
  btnDisabled: { opacity: 0.4 },
  submitBtnText: { color: C.obsidian, fontSize: 12, fontWeight: "700" },
  historyLabel: { fontSize: 10, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10, marginTop: 4 },
  histRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  histIcon: { fontSize: 18, color: "rgba(196,151,58,0.55)" },
  histLabel: { fontSize: 14, color: C.champagne, fontWeight: "600" },
  histTime: { fontSize: 11, color: C.muted, marginTop: 2 },
  statusBadge: { fontSize: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: "hidden", textTransform: "uppercase", borderWidth: 1 },
  completed: { backgroundColor: "rgba(74,124,89,0.14)", color: "#a0c890", borderColor: "rgba(74,124,89,0.28)" },
  failed: { backgroundColor: "rgba(155,58,74,0.14)", color: "#e8b4bc", borderColor: "rgba(155,58,74,0.28)" },
  queued: { backgroundColor: C.goldBg, color: C.gold, borderColor: "rgba(196,151,58,0.25)" },
  histPreview: { fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 17 },
  modal: { flex: 1, backgroundColor: C.obsidian },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 20, color: "#F0D890", flex: 1 },
  closeBtn: { color: C.muted, fontSize: 18, marginLeft: 16 },
  resultText: { fontSize: 15, color: C.ink, lineHeight: 24 },
});
