import { Ionicons } from "@expo/vector-icons";
import { useScrollToTop } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PensionChart } from "@/components/PensionChart";
import type { ContributionPoint } from "@/components/PensionChart";
import { ThemePicker } from "@/components/ThemePicker";
import { useColors } from "@/hooks/useColors";
import { useUserName } from "@/hooks/useUserName";
import {
  useGetPensionInsights,
  useListPensionEntries,
  useListContributions,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPensionInsightsQueryKey,
  getListPensionEntriesQueryKey,
  getListContributionsQueryKey,
} from "@workspace/api-client-react";

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
  const [showThemePicker, setShowThemePicker] = useState(false);

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { data: entries, isLoading: entriesLoading, refetch: refetchEntries } = useListPensionEntries();
  const { data: insights, isLoading: insightsLoading, refetch: refetchInsights } = useGetPensionInsights();
  const { data: contributionsRaw, refetch: refetchContributions } = useListContributions();

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchEntries(), refetchInsights(), refetchContributions()]);
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

  const contributions: ContributionPoint[] | undefined = React.useMemo(() => {
    if (!contributionsRaw || contributionsRaw.length === 0) return undefined;
    return contributionsRaw.map((c) => ({
      date: c.contribution_date,
      employee: parseFloat(c.employee_amount),
      employer: parseFloat(c.employer_amount),
    }));
  }, [contributionsRaw]);

  const latestCumulative = React.useMemo(() => {
    if (!contributions || chartData.length === 0) return null;
    const latestDate = chartData[chartData.length - 1].date;
    let emp = 0;
    let emr = 0;
    for (const c of contributions) {
      if (c.date <= latestDate) {
        emp += c.employee;
        emr += c.employer;
      }
    }
    return { employee: emp, employer: emr, total: emp + emr };
  }, [contributions, chartData]);

  const topPad = Platform.OS === "web" ? 36 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 90;
  const hPad = isLandscape ? 20 : 16;

  if (entriesLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const hasData = sortedEntries.length > 0;
  const latestPotValue = latestEntry ? parseFloat(latestEntry.pot_value) : 0;
  const investmentReturn = latestCumulative ? latestPotValue - latestCumulative.total : null;

  const heroCard = (
    <View
      style={[
        styles.heroCard,
        isLandscape && styles.heroCardLandscape,
        { backgroundColor: colors.primary, borderRadius: colors.radius },
      ]}
    >
      <Text style={[styles.heroLabel, isLandscape && styles.heroLabelLandscape]}>
        Current Pot Value
      </Text>
      <Text style={[styles.heroValue, isLandscape && styles.heroValueLandscape]}>
        {latestEntry ? formatCurrency(latestEntry.pot_value) : "—"}
      </Text>
      <Text style={[styles.heroDate, isLandscape && styles.heroDateLandscape]}>
        {latestEntry ? `as of ${formatDate(latestEntry.entry_date)}` : ""}
      </Text>
      {insights?.has_data && insights.total_growth_pct != null ? (
        <View style={styles.heroBadge}>
          <Ionicons
            name={insights.total_growth_pct >= 0 ? "trending-up" : "trending-down"}
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
  );

  const chartCard = (
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
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Performance</Text>
      <View style={styles.chartWrapper}>
        <PensionChart
          data={chartData}
          contributions={contributions}
          height={isLandscape ? Math.round(height * 0.55) : 200}
        />
      </View>
    </View>
  );

  return (
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: topPad, paddingHorizontal: hPad }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headingRow}>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.heading,
              isLandscape && styles.headingLandscape,
              { color: colors.foreground },
            ]}
          >
            {name ? `Hello, ${name}` : "Pension Tracker"}
          </Text>
          {name ? (
            <Text style={[styles.subheading, { color: colors.mutedForeground }]}>
              Pension Tracker
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => setShowThemePicker(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.gearBtn, { backgroundColor: colors.secondary }]}
        >
          <Ionicons name="color-palette-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ThemePicker visible={showThemePicker} onClose={() => setShowThemePicker(false)} />

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
          <Ionicons name="wallet-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No snapshots yet</Text>
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
          {isLandscape ? (
            <View style={styles.landscapeRow}>
              <View style={styles.landscapeLeft}>{heroCard}</View>
              <View style={styles.landscapeRight}>{chartCard}</View>
            </View>
          ) : (
            <>
              {heroCard}
              {chartCard}
            </>
          )}

          {latestCumulative && latestCumulative.total > 0 ? (
            <View style={styles.statsRow}>
              <View
                style={[
                  styles.statCard,
                  { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
                ]}
              >
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>From You</Text>
                <Text style={[styles.statValue, { color: colors.primary }]}>
                  {formatCurrency(latestCumulative.employee)}
                </Text>
              </View>
              <View
                style={[
                  styles.statCard,
                  { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
                ]}
              >
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Employer</Text>
                <Text style={[styles.statValue, { color: colors.accent }]}>
                  {formatCurrency(latestCumulative.employer)}
                </Text>
              </View>
              {investmentReturn !== null ? (
                <View
                  style={[
                    styles.statCard,
                    { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
                  ]}
                >
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Returns</Text>
                  <Text
                    style={[
                      styles.statValue,
                      { color: investmentReturn >= 0 ? colors.positive : colors.negative },
                    ]}
                  >
                    {formatCurrency(investmentReturn)}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {insights?.has_data && !latestCumulative && (
            <View style={styles.statsRow}>
              <View
                style={[
                  styles.statCard,
                  { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
                ]}
              >
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total Growth</Text>
                <Text
                  style={[
                    styles.statValue,
                    { color: (insights.total_growth_pct ?? 0) >= 0 ? colors.positive : colors.negative },
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
                  { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
                ]}
              >
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Annual Return</Text>
                <Text
                  style={[
                    styles.statValue,
                    { color: (insights.annualized_return_pct ?? 0) >= 0 ? colors.positive : colors.negative },
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
                { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
              ]}
            >
              <View style={styles.insightsHeader}>
                <Ionicons name="bulb-outline" size={18} color={colors.accent} />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>AI Insights</Text>
              </View>
              {insightsLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                insights.insights.map((insight, i) => (
                  <View key={i} style={styles.insightRow}>
                    <View style={[styles.insightDot, { backgroundColor: colors.accent }]} />
                    <Text style={[styles.insightText, { color: colors.foreground }]}>{insight}</Text>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </>
      )}

      <View style={{ height: bottomPad }} />
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
  headingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  gearBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    marginLeft: 8,
    flexShrink: 0,
  },
  heading: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headingLandscape: {
    fontSize: 22,
    marginBottom: 2,
  },
  subheading: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 18,
  },
  landscapeRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginBottom: 10,
  },
  landscapeLeft: {
    flex: 4,
  },
  landscapeRight: {
    flex: 6,
  },
  heroCard: {
    padding: 24,
    marginBottom: 12,
  },
  heroCardLandscape: {
    padding: 16,
    marginBottom: 0,
  },
  heroLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
  },
  heroLabelLandscape: {
    fontSize: 11,
    marginBottom: 4,
  },
  heroValue: {
    fontSize: 40,
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
    marginBottom: 4,
  },
  heroValueLandscape: {
    fontSize: 26,
    letterSpacing: -0.5,
    marginBottom: 3,
  },
  heroDate: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Inter_400Regular",
  },
  heroDateLandscape: {
    fontSize: 11,
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
    padding: 14,
    borderWidth: 1,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginBottom: 5,
    textAlign: "center",
  },
  statValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    textAlign: "center",
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
