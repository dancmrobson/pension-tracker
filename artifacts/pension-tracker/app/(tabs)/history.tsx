import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
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

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);

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

  const sortedEntries = React.useMemo(() => {
    if (!entries) return [];
    return [...entries].sort(
      (a, b) =>
        new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime(),
    );
  }, [entries]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (isLoading) {
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

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: topPad + 4 },
      ]}
      data={sortedEntries}
      keyExtractor={(item) => String(item.id)}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <Text style={[styles.heading, { color: colors.foreground }]}>
          History
        </Text>
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Ionicons
            name="time-outline"
            size={48}
            color={colors.mutedForeground}
          />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            No entries yet
          </Text>
          <Text
            style={[styles.emptySubtitle, { color: colors.mutedForeground }]}
          >
            Upload your first pension screenshot to start logging
          </Text>
          <TouchableOpacity
            style={[
              styles.uploadBtn,
              {
                backgroundColor: colors.primary,
                borderRadius: colors.radius,
              },
            ]}
            onPress={() => router.push("/(tabs)/upload")}
          >
            <Text
              style={[
                styles.uploadBtnText,
                { color: colors.primaryForeground },
              ]}
            >
              Upload Screenshot
            </Text>
          </TouchableOpacity>
        </View>
      }
      renderItem={({ item, index }) => {
        const allSorted = [...sortedEntries].reverse();
        const itemIndex = allSorted.findIndex((e) => e.id === item.id);
        const prevEntry = itemIndex > 0 ? allSorted[itemIndex - 1] : null;
        const prevValue = prevEntry ? parseFloat(prevEntry.pot_value) : null;

        return (
          <EntryCard
            id={item.id}
            entryDate={item.entry_date}
            potValue={item.pot_value}
            totalContributions={item.total_contributions}
            notes={item.notes}
            previousValue={prevValue}
            onDelete={handleDelete}
          />
        );
      }}
      ListFooterComponent={
        <View
          style={{
            height: Platform.OS === "web" ? 34 : insets.bottom + 90,
          }}
        />
      }
    />
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
    marginBottom: 20,
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
