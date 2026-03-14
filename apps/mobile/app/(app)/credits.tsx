import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "../../components/Card";
import { checkoutCredits, getCreditPackages, getCredits } from "../../lib/api";
import { C } from "../../lib/colors";
import type { CreditWallet, CreditTransaction } from "../../lib/api";

export default function CreditsScreen() {
  const [wallet, setWallet] = useState<CreditWallet | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [packages, setPackages] = useState<{ id: string; name: string; credits: number; price: number; currency: string }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [credRes, pkgRes] = await Promise.all([getCredits(), getCreditPackages()]);
      setWallet(credRes.wallet);
      setTransactions(credRes.transactions.slice(0, 20));
      setPackages(pkgRes.packages);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function handleBuy(pkgId: string) {
    setBuying(pkgId);
    try {
      const res = await checkoutCredits(pkgId);
      // Open Stripe checkout in browser
      await Linking.openURL(res.url);
      Alert.alert(
        "Payment opened",
        "Complete the payment in your browser. Credits will be added automatically after confirmation.",
        [{ text: "OK", onPress: load }]
      );
    } catch {
      Alert.alert("Error", "Could not open checkout. Please try again.");
    } finally {
      setBuying(null);
    }
  }

  function txColor(amount: number) {
    return amount > 0 ? "#a0c890" : C.danger;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} />}
      >
        <Text style={styles.title}>Credits</Text>

        {/* Balance */}
        <Card strong style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>{wallet?.balance ?? "—"}</Text>
          <Text style={styles.balanceUnit}>credits</Text>
          <View style={styles.balanceBreakdown}>
            <Text style={styles.breakdownItem}>Earned: {wallet?.earnedBalance ?? 0} cr</Text>
            <Text style={styles.breakdownItem}>Purchased: {wallet?.purchasedBalance ?? 0} cr</Text>
          </View>
        </Card>

        {/* Credit costs reference */}
        <Card>
          <Text style={styles.sectionLabel}>Action Costs</Text>
          {[
            ["Send Intro", "15 cr"],
            ["Open Chat Thread", "12 cr"],
            ["Circle Access Request", "12 cr"],
            ["Marketplace Listing", "10 cr"],
            ["AI Tool (any)", "8 cr"],
            ["AI Concierge", "5 cr"],
          ].map(([action, cost]) => (
            <View key={action} style={styles.costRow}>
              <Text style={styles.costAction}>{action}</Text>
              <Text style={styles.costAmount}>{cost}</Text>
            </View>
          ))}
        </Card>

        {/* Packages */}
        <Text style={styles.sectionLabel2}>Top Up Credits</Text>
        {packages.map((pkg) => (
          <TouchableOpacity
            key={pkg.id}
            onPress={() => handleBuy(pkg.id)}
            disabled={buying === pkg.id}
          >
            <Card style={styles.pkgCard}>
              <View style={styles.pkgInfo}>
                <Text style={styles.pkgName}>{pkg.name}</Text>
                <Text style={styles.pkgCredits}>{pkg.credits} credits</Text>
              </View>
              <View style={[styles.pkgBtn, buying === pkg.id && { opacity: 0.5 }]}>
                <Text style={styles.pkgPrice}>€{pkg.price}</Text>
                <Text style={styles.pkgBtnText}>{buying === pkg.id ? "…" : "Buy"}</Text>
              </View>
            </Card>
          </TouchableOpacity>
        ))}

        {/* Transaction History */}
        {transactions.length > 0 && (
          <>
            <Text style={styles.sectionLabel2}>Recent Transactions</Text>
            {transactions.map((tx) => (
              <View key={tx.id} style={styles.txRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txReason}>{tx.reason}</Text>
                  <Text style={styles.txDate}>
                    {new Date(tx.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: txColor(tx.amount) }]}>
                  {tx.amount > 0 ? "+" : ""}{tx.amount} cr
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.obsidian },
  content: { padding: 18, paddingBottom: 40 },
  title: { fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 26, color: "#F0D890", marginBottom: 16, marginTop: 8 },
  balanceCard: { alignItems: "center", paddingVertical: 28 },
  balanceLabel: { fontSize: 10, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 },
  balanceAmount: { fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 60, color: C.goldLight, lineHeight: 66 },
  balanceUnit: { fontSize: 14, color: C.muted, marginBottom: 12 },
  balanceBreakdown: { flexDirection: "row", gap: 20 },
  breakdownItem: { fontSize: 12, color: C.muted },
  sectionLabel: { fontSize: 10, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10 },
  sectionLabel2: { fontSize: 10, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10, marginTop: 4 },
  costRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  costAction: { fontSize: 13, color: C.subdued },
  costAmount: { fontSize: 13, color: C.gold, fontWeight: "600" },
  pkgCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pkgInfo: { flex: 1 },
  pkgName: { fontSize: 15, color: C.champagne, fontWeight: "600" },
  pkgCredits: { fontSize: 13, color: C.muted, marginTop: 2 },
  pkgBtn: { backgroundColor: C.gold, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignItems: "center", minWidth: 70 },
  pkgPrice: { fontSize: 13, color: C.obsidian, fontWeight: "700" },
  pkgBtnText: { fontSize: 11, color: C.obsidian },
  txRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  txReason: { fontSize: 13, color: C.subdued },
  txDate: { fontSize: 11, color: C.muted, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: "700", marginLeft: 12 },
});
