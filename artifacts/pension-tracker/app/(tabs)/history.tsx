import { Ionicons } from "@expo/vector-icons";
import { useScrollToTop } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { EntryCard } from "@/components/EntryCard";
import { useColors } from "@/hooks/useColors";
import {
  useListPensionEntries,
  useDeletePensionEntry,
  getListPensionEntriesQueryKey,
  getGetPensionInsightsQueryKey,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";

// ─── Types ───────────────────────────────────────────────────────────────────

type YearMode = "calendar" | "tax";

interface EntryItem {
  id: number;
  entry_date: string;
  pot_value: string;
  total_contributions?: string | null;
  notes?: string | null;
}

interface YearGroup {
  label: string;
  subtitle: string;
  entries: EntryItem[];
  startValue: number;
  endValue: number;
  growthAmt: number;
  growthPct: number;
  hasComparison: boolean;
}

type ListItem =
  | { type: "year-header"; id: string; group: YearGroup }
  | { type: "entry"; id: string; entry: EntryItem; previousValue: number | null };

// ─── Year helpers ─────────────────────────────────────────────────────────────

function getCalendarYearLabel(dateStr: string): string {
  return dateStr.slice(0, 4);
}

function getTaxYearLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const startYear = m > 3 || (m === 3 && day >= 6) ? y : y - 1;
  return `${startYear}/${String(startYear + 1).slice(2)}`;
}

function buildGroups(entries: EntryItem[], mode: YearMode): YearGroup[] {
  if (entries.length === 0) return [];

  const labelFn = mode === "tax" ? getTaxYearLabel : getCalendarYearLabel;
  const subtitle = mode === "tax" ? "6 Apr – 5 Apr" : "Jan – Dec";

  const ascending = [...entries].sort((a, b) =>
    a.entry_date.localeCompare(b.entry_date)
  );

  const groupMap = new Map<string, EntryItem[]>();
  for (const e of ascending) {
    const lbl = labelFn(e.entry_date);
    if (!groupMap.has(lbl)) groupMap.set(lbl, []);
    groupMap.get(lbl)!.push(e);
  }

  const groupKeys = [...groupMap.keys()];

  return groupKeys.map((label, i) => {
    const groupEntries = groupMap.get(label)!;
    const endValue = parseFloat(groupEntries[groupEntries.length - 1].pot_value);
    const prevGroup = i > 0 ? groupMap.get(groupKeys[i - 1])! : null;
    const hasComparison = prevGroup !== null || groupEntries.length > 1;
    const startValue = prevGroup
      ? parseFloat(prevGroup[prevGroup.length - 1].pot_value)
      : parseFloat(groupEntries[0].pot_value);
    const growthAmt = endValue - startValue;
    const growthPct =
      startValue !== 0 && hasComparison
        ? (growthAmt / startValue) * 100
        : 0;
    return { label, subtitle, entries: groupEntries, startValue, endValue, growthAmt, growthPct, hasComparison };
  });
}

function buildListData(
  entries: EntryItem[],
  mode: YearMode,
  prevValueMap: Map<number, number | null>
): ListItem[] {
  const groups = buildGroups(entries, mode).reverse();
  const items: ListItem[] = [];
  for (const group of groups) {
    items.push({ type: "year-header", id: `header-${group.label}`, group });
    const descEntries = [...group.entries].reverse();
    for (const entry of descEntries) {
      items.push({
        type: "entry",
        id: `entry-${entry.id}`,
        entry,
        previousValue: prevValueMap.get(entry.id) ?? null,
      });
    }
  }
  return items;
}

// ─── Year Header component ────────────────────────────────────────────────────

function YearHeader({ group }: { group: YearGroup }) {
  const colors = useColors();
  const isPositive = group.growthAmt >= 0;
  const growthColor = isPositive ? colors.positive : colors.negative;
  const growthBg = isPositive ? colors.positiveBg : colors.negativeBg;

  const formatCurrency = (v: number) =>
    `${v >= 0 ? "+" : "−"}£${Math.abs(v).toLocaleString("en-GB", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <View
      style={[
        styles.yearHeader,
        { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <View style={[styles.yearAccent, { backgroundColor: colors.primary }]} />
      <View style={styles.yearLeft}>
        <Text style={[styles.yearLabel, { color: colors.foreground }]}>
          {group.label}
        </Text>
        <Text style={[styles.yearSub, { color: colors.mutedForeground }]}>
          {group.subtitle} · {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
        </Text>
      </View>
      {group.hasComparison ? (
        <View style={styles.yearRight}>
          <View style={[styles.yearBadge, { backgroundColor: growthBg }]}>
            <Ionicons
              name={isPositive ? "trending-up" : "trending-down"}
              size={13}
              color={growthColor}
            />
            <Text style={[styles.yearBadgePct, { color: growthColor }]}>
              {isPositive ? "+" : ""}
              {group.growthPct.toFixed(1)}%
            </Text>
          </View>
          <Text style={[styles.yearAmt, { color: growthColor }]}>
            {formatCurrency(group.growthAmt)}
          </Text>
        </View>
      ) : (
        <View style={[styles.yearBadge, { backgroundColor: colors.card }]}>
          <Text style={[styles.yearBadgePct, { color: colors.mutedForeground }]}>First year</Text>
        </View>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);
  const [yearMode, setYearMode] = React.useState<YearMode>("calendar");

  const { data: entries, isLoading, refetch } = useListPensionEntries();

  const deleteMutation = useDeletePensionEntry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPensionEntriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPensionInsightsQueryKey() });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id });
  };

  const prevValueMap = React.useMemo(() => {
    const ascending = [...(entries ?? [])].sort((a, b) =>
      a.entry_date.localeCompare(b.entry_date)
    );
    const map = new Map<number, number | null>();
    for (let i = 0; i < ascending.length; i++) {
      map.set(ascending[i].id, i > 0 ? parseFloat(ascending[i - 1].pot_value) : null);
    }
    return map;
  }, [entries]);

  const listData = React.useMemo(() => {
    if (!entries) return [];
    return buildListData(entries, yearMode, prevValueMap);
  }, [entries, yearMode, prevValueMap]);

  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const topPad = Platform.OS === "web" ? 67 : isLandscape ? insets.top + 40 : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const hasEntries = (entries?.length ?? 0) > 0;

  return (
    <FlatList
      ref={scrollRef}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: topPad + 4 }]}
      data={listData}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.headerRow}>
          <Text style={[styles.heading, { color: colors.foreground }]}>History</Text>
          {hasEntries && (
            <View style={[styles.toggle, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <TouchableOpacity
                style={[
                  styles.toggleOption,
                  yearMode === "calendar" && { backgroundColor: colors.primary, borderRadius: colors.radius - 2 },
                ]}
                onPress={() => setYearMode("calendar")}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.toggleText,
                    { color: yearMode === "calendar" ? "#fff" : colors.mutedForeground,
                      fontFamily: yearMode === "calendar" ? "Inter_600SemiBold" : "Inter_400Regular" },
                  ]}
                >
                  Jan–Dec
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleOption,
                  yearMode === "tax" && { backgroundColor: colors.primary, borderRadius: colors.radius - 2 },
                ]}
                onPress={() => setYearMode("tax")}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.toggleText,
                    { color: yearMode === "tax" ? "#fff" : colors.mutedForeground,
                      fontFamily: yearMode === "tax" ? "Inter_600SemiBold" : "Inter_400Regular" },
                  ]}
                >
                  Tax Year
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Ionicons name="time-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No entries yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            Upload your first pension screenshot to start logging
          </Text>
          <TouchableOpacity
            style={[styles.uploadBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            onPress={() => router.push("/(tabs)/upload")}
          >
            <Text style={[styles.uploadBtnText, { color: colors.primaryForeground }]}>
              Upload Screenshot
            </Text>
          </TouchableOpacity>
        </View>
      }
      renderItem={({ item }) => {
        if (item.type === "year-header") {
          return <YearHeader group={item.group} />;
        }
        return (
          <EntryCard
            id={item.entry.id}
            entryDate={item.entry.entry_date}
            potValue={item.entry.pot_value}
            totalContributions={item.entry.total_contributions}
            notes={item.entry.notes}
            previousValue={item.previousValue}
            onDelete={handleDelete}
          />
        );
      }}
      ListFooterComponent={
        <View style={{ height: Platform.OS === "web" ? 34 : insets.bottom + 90 }} />
      }
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 10,
  },
  heading: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  toggle: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  toggleOption: {
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  toggleText: {
    fontSize: 12,
    letterSpacing: 0.1,
  },
  yearHeader: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
    paddingVertical: 12,
    paddingRight: 14,
    gap: 12,
  },
  yearAccent: {
    width: 4,
    alignSelf: "stretch",
  },
  yearLeft: {
    flex: 1,
    gap: 2,
  },
  yearLabel: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  yearSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  yearRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  yearBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  yearBadgePct: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  yearAmt: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
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
    paddingHorizontal: 20,
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
