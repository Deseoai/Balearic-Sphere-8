import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../components/Avatar";
import { getEliteMessages, getEliteMembers, sendEliteMessage, getMe } from "../../lib/api";
import { C } from "../../lib/colors";
import type { EliteMessage, EliteMember, User } from "../../lib/api";
import { API_URL } from "../../lib/api";

export default function CircleScreen() {
  const [messages, setMessages] = useState<EliteMessage[]>([]);
  const [members, setMembers] = useState<EliteMember[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flatRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    try {
      const [msgsRes, membersRes, meRes] = await Promise.all([
        getEliteMessages(),
        getEliteMembers(),
        getMe(),
      ]);
      setMessages(msgsRes.messages);
      setMembers(membersRes.members);
      setMe(meRes.user);
    } catch (e) {
      setError("Access denied. This space is for Elite Circle members.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Poll every 8s
  useEffect(() => {
    const timer = setInterval(() => {
      getEliteMessages().then((r) => setMessages(r.messages)).catch(() => {});
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const res = await sendEliteMessage(input.trim());
      setMessages((prev) => [...prev, res.message]);
      setInput("");
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setError("Could not send message.");
    } finally {
      setSending(false);
    }
  }, [input, sending]);

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.errorView}>
          <Text style={styles.errorSymbol}>✦</Text>
          <Text style={styles.errorTitle}>Elite Circle</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.symbol}>✦ Elite Circle</Text>
          <Text style={styles.title}>The Inner Sanctum</Text>
        </View>
        <TouchableOpacity style={styles.membersBtn} onPress={() => setShowMembers(true)}>
          <Text style={styles.membersBtnText}>{members.length} Members</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.msgList}
          onContentSizeChange={() => flatRef.current?.scrollToEnd()}
          ListEmptyComponent={
            <View style={styles.emptyView}>
              <Text style={styles.emptySymbol}>✦</Text>
              <Text style={styles.emptyText}>Be the first to speak in this circle.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMe = item.userId === me?.userId;
            const avatarUrl = item.avatarUrl
              ? item.avatarUrl.startsWith("http") ? item.avatarUrl : `${API_URL}${item.avatarUrl}`
              : undefined;
            return (
              <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
                {!isMe && <Avatar name={item.displayName} avatarUrl={avatarUrl} size={30} />}
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                  {!isMe && (
                    <Text style={styles.senderName}>{item.displayName ?? "Member"}</Text>
                  )}
                  <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
                    {item.content}
                  </Text>
                  <Text style={styles.msgTime}>{formatTime(item.createdAt)}</Text>
                </View>
                {isMe && <Avatar name={item.displayName} avatarUrl={avatarUrl} size={30} />}
              </View>
            );
          }}
        />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.msgInput}
            value={input}
            onChangeText={setInput}
            placeholder="Share something… use @ to mention"
            placeholderTextColor={C.muted}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            autoCapitalize="sentences"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || sending) && styles.btnDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
          >
            <Text style={styles.sendBtnText}>{sending ? "…" : "↑"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Members Drawer Modal */}
      <Modal visible={showMembers} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowMembers(false)}>
        <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Elite Members · {members.length}</Text>
            <TouchableOpacity onPress={() => setShowMembers(false)}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ padding: 20 }}>
            {members.map((m) => {
              const avatarUrl = m.avatarUrl
                ? m.avatarUrl.startsWith("http") ? m.avatarUrl : `${API_URL}${m.avatarUrl}`
                : undefined;
              return (
                <View key={m.userId} style={styles.memberRow}>
                  <Avatar name={m.displayName ?? m.companyName} avatarUrl={avatarUrl} size={44} />
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{m.companyName ?? m.displayName ?? "Elite Member"}</Text>
                    {m.industry && (
                      <Text style={styles.memberIndustry}>{m.industry.replace(/_/g, " ")}</Text>
                    )}
                  </View>
                  <Text style={styles.eliteStar}>✦</Text>
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0e0d0b" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(212,168,74,0.16)" },
  symbol: { fontSize: 10, color: "rgba(212,168,74,0.65)", letterSpacing: 2, textTransform: "uppercase" },
  title: { fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 20, color: "#F0D890", marginTop: 2 },
  membersBtn: { borderWidth: 1, borderColor: "rgba(212,168,74,0.30)", borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 },
  membersBtnText: { fontSize: 12, color: C.goldLight, fontWeight: "600" },
  msgList: { padding: 16, paddingBottom: 8, gap: 12 },
  emptyView: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptySymbol: { fontSize: 32, color: "rgba(212,168,74,0.35)", marginBottom: 10 },
  emptyText: { fontSize: 14, color: C.muted, textAlign: "center" },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 4 },
  msgRowMe: { justifyContent: "flex-end" },
  bubble: { maxWidth: "72%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleThem: { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(196,151,58,0.12)", borderBottomLeftRadius: 4 },
  bubbleMe: { backgroundColor: "rgba(196,151,58,0.20)", borderWidth: 1, borderColor: "rgba(196,151,58,0.30)", borderBottomRightRadius: 4 },
  senderName: { fontSize: 10, color: C.champagne, fontWeight: "600", marginBottom: 3 },
  bubbleText: { fontSize: 14, color: "rgba(237,229,208,0.85)", lineHeight: 20 },
  bubbleTextMe: { color: C.champagne },
  msgTime: { fontSize: 10, color: C.muted, marginTop: 4, textAlign: "right" },
  inputRow: { flexDirection: "row", padding: 12, borderTopWidth: 1, borderTopColor: "rgba(212,168,74,0.12)", gap: 8 },
  msgInput: { flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(212,168,74,0.18)", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: C.champagne },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.goldLight, alignItems: "center", justifyContent: "center" },
  btnDisabled: { opacity: 0.4 },
  sendBtnText: { color: "#0C0B09", fontSize: 18, fontWeight: "700" },
  errorView: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  errorSymbol: { fontSize: 36, color: C.gold, marginBottom: 12 },
  errorTitle: { fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 24, color: "#F0D890", marginBottom: 10 },
  errorText: { fontSize: 14, color: C.muted, textAlign: "center", lineHeight: 22 },
  modal: { flex: 1, backgroundColor: C.obsidian },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 20, color: "#F0D890" },
  closeBtn: { color: C.muted, fontSize: 18 },
  memberRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)", gap: 12 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, color: C.champagne, fontWeight: "600" },
  memberIndustry: { fontSize: 12, color: C.muted, marginTop: 2, textTransform: "capitalize" },
  eliteStar: { color: C.goldLight, fontSize: 14 },
});
