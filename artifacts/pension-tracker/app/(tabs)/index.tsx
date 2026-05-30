import { Ionicons } from "@expo/vector-icons";
import { useScrollToTop } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useRef } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PensionChart } from "@/components/PensionChart";
import { useColors } from "@/hooks/useColors";
import { useUserName } from "@/hooks/useUserName";
import {
  useGetPensionInsights,
  useListPensionEntries,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetPensionInsightsQueryKey, getListPensionEntriesQueryKey } from "@workspace/api-client-react";

function formatCurrency(val: string | number): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  return `£${n.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { name } = useUserName();
  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);

  const { data: entries, isLoading: entriesLoading, refetch: refetchEntries } = useListPensionEntries();
  const { data: insights, isLoading: insightsLoading, refetch: refetchInsights } = useGetPensionInsights();

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchEntries(), refetchInsights()]);
    setRefreshing(false);
  };

  const sortedEntries = React.useMemo(() => {
    if (!entries) return [];
    return [...entries].sort(
      (a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime(),
    );
  }, [entries]);

  const latestEntry = sortedEntries[sortedEntries.length - 1];
  const chartData = sortedEntries.map((e) => ({
    date: e.entry_date,
    value: parseFloat(e.pot_value),
  }));

  const topPad =
    Platform.OS === "web" ? 67 : insets.top;

  if (entriesLoading) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: colors.background, paddingTop: topPad },
        ]}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const hasData = sortedEntries.length > 0;

  return (
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: topPad + 4 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.heading, { color: colors.foreground }]}>
        {name ? `Hello, ${name}` : "Pension Tracker"}
      </Text>
      {name ? (
        <Text style={[styles.subheading, { color: colors.mutedForeground }]}>
          Pension Tracker
        </Text>
      ) : null}

      {!hasData ? (
        <View
          style={[
            styles.emptyCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Ionicons
            name="wallet-outline"
            size={48}
            color={colors.mutedForeground}
          />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            No snapshots yet
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            Upload a screenshot of your pension to start tracking performance
          </Text>
          <TouchableOpacity
            style={[
              styles.uploadBtn,
              { backgroundColor: colors.primary, borderRadius: colors.radius },
            ]}
            onPress={() => router.push("/(tabs)/upload")}
          >
            <Text style={[styles.uploadBtnText, { color: colors.primaryForeground }]}>
              Upload Screenshot
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View
            style={[
              styles.heroCard,
              {
                backgroundColor: colors.primary,
                borderRadius: colors.radius,
              },
            ]}
          >
            <Text style={styles.heroLabel}>Current Pot Value</Text>
            <Text style={styles.heroValue}>
              {latestEntry ? formatCurrency(latestEntry.pot_value) : "—"}
            </Text>
            <Text style={styles.heroDate}>
              {latestEntry ? `as of ${formatDate(latestEntry.entry_date)}` : ""}
            </Text>

            {insights?.has_data && insights.total_growth_pct != null ? (
              <View style={styles.heroBadge}>
                <Ionicons
                  name={
                    insights.total_growth_pct >= 0
                      ? "trending-up"
                      : "trending-down"
                  }
                  size={14}
                  color="#fff"
                />
                <Text style={styles.heroBadgeText}>
                  {insights.total_growth_pct >= 0 ? "+" : ""}
                  {insights.total_growth_pct.toFixed(1)}% total growth
                </Text>
              </View>
            ) : null}
          </View>

          <View
            style={[
              styles.chartCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Performance
            </Text>
            <View style={styles.chartWrapper}>
              <PensionChart data={chartData} height={200} />
            </View>
          </View>

          {insights?.has_data && (
            <View style={styles.statsRow}>
              <View
                style={[
                  styles.statCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderRadius: colors.radius,
                  },
                ]}
              >
                <Text
                  style={[styles.statLabel, { color: colors.mutedForeground }]}
                >
                  Total Growth
                </Text>
                <Text
                  style={[
                    styles.statValue,
                    {
                      color:
                        (insights.total_growth_pct ?? 0) >= 0
                          ? colors.positive
                          : colors.negative,
                    },
                  ]}
                >
                  {insights.total_growth_pct != null
                    ? `${insights.total_growth_pct >= 0 ? "+" : ""}${insights.total_growth_pct.toFixed(1)}%`
                    : "—"}
                </Text>
              </View>
              <View
                style={[
                  styles.statCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderRadius: colors.radius,
                  },
                ]}
              >
                <Text
                  style={[styles.statLabel, { color: colors.mutedForeground }]}
                >
                  Annual Return
                </Text>
                <Text
                  style={[
                    styles.statValue,
                    {
                      color:
                        (insights.annualized_return_pct ?? 0) >= 0
                          ? colors.positive
                          : colors.negative,
                    },
                  ]}
                >
                  {insights.annualized_return_pct != null
                    ? `${insights.annualized_return_pct >= 0 ? "+" : ""}${insights.annualized_return_pct.toFixed(1)}%`
                    : "—"}
                </Text>
              </View>
            </View>
          )}

          {insights?.insights && insights.insights.length > 0 ? (
            <View
              style={[
                styles.insightsCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                },
              ]}
            >
              <View style={styles.insightsHeader}>
                <Ionicons name="bulb-outline" size={18} color={colors.accent} />
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}
                >
                  AI Insights
                </Text>
              </View>
              {insightsLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                insights.insights.map((insight, i) => (
                  <View key={i} style={styles.insightRow}>
                    <View
                      style={[
                        styles.insightDot,
                        { backgroundColor: colors.accent },
                      ]}
                    />
                    <Text
                      style={[
                        styles.insightText,
                        { color: colors.foreground },
                      ]}
                    >
                      {insight}
                    </Text>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </>
      )}

      <View style={{ height: Platform.OS === "web" ? 34 : insets.bottom + 90 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    paddingHorizontal: 16,
  },
  heading: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subheading: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 18,
  },
  heroCard: {
    padding: 24,
    marginBottom: 12,
  },
  heroLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
  },
  heroValue: {
    fontSize: 40,
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
    marginBottom: 4,
  },
  heroDate: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Inter_400Regular",
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  heroBadgeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  chartCard: {
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  chartWrapper: {
    marginTop: 8,
    marginLeft: -6,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderWidth: 1,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 6,
  },
  statValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  insightsCard: {
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
    gap: 12,
  },
  insightsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  insightDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    flexShrink: 0,
  },
  insightText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    flex: 1,
  },
  emptyCard: {
    borderWidth: 1,
    padding: 32,
    alignItems: "center",
    gap: 12,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  uploadBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
  },
  uploadBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
