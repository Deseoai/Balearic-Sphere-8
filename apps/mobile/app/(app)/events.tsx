import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
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
import { createEvent, getEvent, getEvents, rsvpEvent, cancelRsvp, getMe } from "../../lib/api";
import { C } from "../../lib/colors";
import type { Event, User } from "../../lib/api";

export default function EventsScreen() {
  const [events, setEvents] = useState<Event[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Event | null>(null);
  const [attendees, setAttendees] = useState<User[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", location: "", dateTime: "", price: "", link: "", topic: "business" });

  const load = useCallback(async () => {
    try {
      const [evRes, meRes] = await Promise.all([getEvents(), getMe()]);
      setEvents(evRes.events);
      setMe(meRes.user);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function openEvent(event: Event) {
    setSelected(event);
    try {
      const res = await getEvent(event.id);
      setSelected(res.event);
      setAttendees(res.attendees);
    } catch { /* silent */ }
  }

  async function handleRsvp(eventId: string) {
    try {
      await rsvpEvent(eventId);
      Alert.alert("RSVP confirmed!", "You've joined this event.");
      void load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      Alert.alert("Error", msg.includes("insufficient_credits") ? "Not enough credits." : "Could not RSVP.");
    }
  }

  async function handleCreate() {
    if (!form.title.trim() || !form.dateTime.trim() || !form.location.trim()) {
      Alert.alert("Required", "Title, location and date/time are required.");
      return;
    }
    setCreating(true);
    try {
      await createEvent({
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        dateTime: new Date(form.dateTime).toISOString(),
        price: form.price ? parseFloat(form.price) : undefined,
        link: form.link.trim() || undefined,
        topic: form.topic,
        status: "published",
      });
      setShowCreate(false);
      setForm({ title: "", description: "", location: "", dateTime: "", price: "", link: "", topic: "business" });
      void load();
      Alert.alert("Event Created", "Your event has been published.");
    } catch {
      Alert.alert("Error", "Could not create event.");
    } finally {
      setCreating(false);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  const renderEvent = ({ item }: { item: Event }) => (
    <TouchableOpacity onPress={() => openEvent(item)}>
      <Card>
        <View style={styles.eventHeader}>
          <Text style={styles.eventTopic}>{item.topic?.replace(/_/g, " ")}</Text>
          <Text style={[styles.statusBadge, item.status === "published" ? styles.published : styles.cancelled]}>
            {item.status}
          </Text>
        </View>
        <Text style={styles.eventTitle}>{item.title}</Text>
        <Text style={styles.eventMeta}>📍 {item.location}</Text>
        <Text style={styles.eventMeta}>🕐 {formatDate(item.dateTime)}</Text>
        {item.price != null && item.price > 0 && (
          <Text style={styles.eventMeta}>💶 {item.price} {item.currency ?? "EUR"}</Text>
        )}
        {item.attendeeCount != null && (
          <Text style={styles.eventMeta}>👥 {item.attendeeCount} attending</Text>
        )}
      </Card>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Events</Text>
        <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)}>
          <Text style={styles.createBtnText}>+ Create</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        renderItem={renderEvent}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} />}
        ListEmptyComponent={<Text style={styles.empty}>No upcoming events.</Text>}
      />

      {/* Event Detail Modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Text style={styles.back}>← Back</Text>
            </TouchableOpacity>
          </View>
          {selected && (
            <ScrollView style={{ padding: 20 }}>
              <Text style={styles.modalTitle}>{selected.title}</Text>
              <Text style={[styles.eventTopic, { marginBottom: 12 }]}>{selected.topic?.replace(/_/g, " ")}</Text>
              <Text style={styles.detailMeta}>📍 {selected.location}</Text>
              {selected.address && <Text style={styles.detailMeta}>   {selected.address}</Text>}
              <Text style={styles.detailMeta}>🕐 {formatDate(selected.dateTime)}</Text>
              {selected.price != null && selected.price > 0 && (
                <Text style={styles.detailMeta}>💶 {selected.price} {selected.currency ?? "EUR"}</Text>
              )}
              {selected.link && (
                <TouchableOpacity onPress={() => Linking.openURL(selected.link!)}>
                  <Text style={[styles.detailMeta, { color: C.goldLight, textDecorationLine: "underline" }]}>
                    🔗 {selected.link}
                  </Text>
                </TouchableOpacity>
              )}
              {selected.description ? (
                <Text style={[styles.detailBody, { marginTop: 16 }]}>{selected.description}</Text>
              ) : null}

              {attendees.length > 0 && (
                <View style={{ marginTop: 20 }}>
                  <Text style={styles.sectionLabel}>Attendees ({attendees.length})</Text>
                  {attendees.map((a) => (
                    <Text key={a.userId} style={styles.attendeeName}>
                      {a.displayName ?? a.email}
                    </Text>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[styles.btn, { marginTop: 24 }]}
                onPress={() => handleRsvp(selected.id)}
              >
                <Text style={styles.btnText}>RSVP to Event</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Create Event Modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Text style={styles.back}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle}>New Event</Text>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView style={{ padding: 20 }}>
            {[
              { label: "Title *", key: "title", placeholder: "Event title…" },
              { label: "Location *", key: "location", placeholder: "Venue name, city…" },
              { label: "Date & Time * (YYYY-MM-DD HH:MM)", key: "dateTime", placeholder: "2026-04-15 19:00" },
              { label: "Description", key: "description", placeholder: "What to expect…" },
              { label: "Price (EUR)", key: "price", placeholder: "0 = free" },
              { label: "Link (optional)", key: "link", placeholder: "https://…" },
            ].map((f) => (
              <View key={f.key}>
                <Text style={styles.label}>{f.label}</Text>
                <TextInput
                  style={[styles.input, f.key === "description" && { minHeight: 80, textAlignVertical: "top" }]}
                  value={form[f.key as keyof typeof form]}
                  onChangeText={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                  placeholder={f.placeholder}
                  placeholderTextColor={C.muted}
                  multiline={f.key === "description"}
                  keyboardType={f.key === "price" ? "decimal-pad" : "default"}
                  autoCapitalize={f.key === "link" ? "none" : "sentences"}
                />
              </View>
            ))}
            <TouchableOpacity
              style={[styles.btn, creating && styles.btnDisabled]}
              onPress={handleCreate}
              disabled={creating}
            >
              <Text style={styles.btnText}>{creating ? "Creating…" : "Publish Event"}</Text>
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
  list: { paddingHorizontal: 18, paddingBottom: 40 },
  eventHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  eventTopic: { fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 },
  statusBadge: { fontSize: 9, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: "hidden", textTransform: "uppercase", letterSpacing: 0.5 },
  published: { backgroundColor: "rgba(74,124,89,0.14)", color: "#a0c890" },
  cancelled: { backgroundColor: C.dangerBg, color: C.danger },
  eventTitle: { fontSize: 16, color: C.champagne, fontWeight: "600", marginBottom: 6 },
  eventMeta: { fontSize: 13, color: C.subdued, marginBottom: 2 },
  empty: { textAlign: "center", color: C.muted, marginTop: 40, fontSize: 14 },
  modal: { flex: 1, backgroundColor: C.obsidian },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  modalHeaderTitle: { fontSize: 16, color: C.champagne, fontWeight: "600" },
  modalTitle: { fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 24, color: "#F0D890", marginBottom: 6 },
  back: { color: C.subdued, fontSize: 15, width: 60 },
  detailMeta: { fontSize: 14, color: C.subdued, marginBottom: 4 },
  detailBody: { fontSize: 14, color: C.ink, lineHeight: 22 },
  sectionLabel: { fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  attendeeName: { fontSize: 14, color: C.subdued, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  label: { fontSize: 11, color: C.subdued, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.ink, marginBottom: 14 },
  btn: { backgroundColor: C.gold, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 20 },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: C.obsidian, fontSize: 15, fontWeight: "700" },
});
