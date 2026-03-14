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
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../components/Avatar";
import { getChatThreads, getMessages, sendMessage, getMe } from "../../lib/api";
import { C } from "../../lib/colors";
import type { ChatThread, ChatMessage, User } from "../../lib/api";

export default function MessagesScreen() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const flatRef = useRef<FlatList>(null);

  useEffect(() => {
    Promise.all([getChatThreads(), getMe()])
      .then(([t, m]) => { setThreads(t.threads); setMe(m.user); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeThread) return;
    getMessages(activeThread.id)
      .then((r) => setMessages(r.messages))
      .catch(() => {});
  }, [activeThread]);

  // Poll messages every 5s when thread is open
  useEffect(() => {
    if (!activeThread) return;
    const timer = setInterval(() => {
      getMessages(activeThread.id).then((r) => setMessages(r.messages)).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [activeThread]);

  const handleSend = useCallback(async () => {
    if (!activeThread || !input.trim() || sending) return;
    setSending(true);
    try {
      const res = await sendMessage(activeThread.id, input.trim());
      setMessages((prev) => [...prev, res.message]);
      setInput("");
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      Alert.alert("Error", "Could not send message.");
    } finally {
      setSending(false);
    }
  }, [activeThread, input, sending]);

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  if (activeThread) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.threadHeader}>
          <TouchableOpacity onPress={() => setActiveThread(null)}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.threadName}>
            {activeThread.otherUser?.displayName ?? "Conversation"}
          </Text>
          <View style={{ width: 50 }} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.msgList}
            onContentSizeChange={() => flatRef.current?.scrollToEnd()}
            renderItem={({ item }) => {
              const isMe = item.senderId === me?.userId;
              return (
                <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
                  <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                    <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
                      {item.content}
                    </Text>
                    <Text style={styles.msgTime}>{formatTime(item.createdAt)}</Text>
                  </View>
                </View>
              );
            }}
          />
          <View style={styles.inputRow}>
            <TextInput
              style={styles.msgInput}
              value={input}
              onChangeText={setInput}
              placeholder="Write a message…"
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
      </View>

      {threads.length === 0 ? (
        <View style={styles.emptyView}>
          <Text style={styles.emptyIcon}>◻</Text>
          <Text style={styles.emptyText}>No conversations yet.</Text>
          <Text style={styles.emptySub}>
            Open the Network tab and send an intro to start a conversation.
          </Text>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.threadRow} onPress={() => setActiveThread(item)}>
              <Avatar name={item.otherUser?.displayName} avatarUrl={item.otherUser?.avatarUrl} size={44} />
              <View style={styles.threadInfo}>
                <Text style={styles.threadName2}>{item.otherUser?.displayName ?? "Member"}</Text>
                {item.lastMessage && (
                  <Text style={styles.lastMsg} numberOfLines={1}>{item.lastMessage}</Text>
                )}
              </View>
              {item.lastMessageAt && (
                <Text style={styles.threadTime}>
                  {new Date(item.lastMessageAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.obsidian },
  header: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10 },
  title: { fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 26, color: "#F0D890" },
  threadRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  threadInfo: { flex: 1, marginLeft: 12 },
  threadName2: { fontSize: 15, color: C.champagne, fontWeight: "600" },
  lastMsg: { fontSize: 13, color: C.muted, marginTop: 2 },
  threadTime: { fontSize: 11, color: C.muted },
  emptyView: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  emptyIcon: { fontSize: 36, color: C.muted, marginBottom: 12 },
  emptyText: { fontSize: 16, color: C.subdued, marginBottom: 8 },
  emptySub: { fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 20 },
  // Thread view
  threadHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  back: { color: C.subdued, fontSize: 15, width: 50 },
  threadName: { fontSize: 16, color: C.champagne, fontWeight: "600" },
  msgList: { padding: 16, paddingBottom: 8 },
  msgRow: { flexDirection: "row", marginBottom: 10 },
  msgRowMe: { justifyContent: "flex-end" },
  bubble: { maxWidth: "75%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleThem: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderBottomLeftRadius: 4 },
  bubbleMe: { backgroundColor: "rgba(196,151,58,0.20)", borderWidth: 1, borderColor: "rgba(196,151,58,0.30)", borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, color: "rgba(237,229,208,0.85)", lineHeight: 20 },
  bubbleTextMe: { color: C.champagne },
  msgTime: { fontSize: 10, color: C.muted, marginTop: 4, textAlign: "right" },
  inputRow: { flexDirection: "row", padding: 12, borderTopWidth: 1, borderTopColor: C.border, gap: 8 },
  msgInput: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: C.ink },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.gold, alignItems: "center", justifyContent: "center" },
  btnDisabled: { opacity: 0.4 },
  sendBtnText: { color: C.obsidian, fontSize: 18, fontWeight: "700" },
});
