import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

interface EntryCardProps {
  id: number;
  entryDate: string;
  potValue: string;
  totalContributions?: string | null;
  notes?: string | null;
  previousValue?: number | null;
  onDelete: (id: number) => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCurrency(val: string | number): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  return `£${n.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function EntryCard({
  id,
  entryDate,
  potValue,
  totalContributions,
  notes,
  previousValue,
  onDelete,
}: EntryCardProps) {
  const colors = useColors();

  const value = parseFloat(potValue);
  const growthAmt = previousValue != null ? value - previousValue : null;
  const growthPct =
    previousValue != null && previousValue !== 0
      ? ((value - previousValue) / previousValue) * 100
      : null;
  const isPositive = growthAmt != null ? growthAmt >= 0 : true;
  const growthColor = isPositive ? colors.positive : colors.negative;

  const handleDelete = () => {
    Alert.alert(
      "Delete Entry",
      "Are you sure you want to delete this entry?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete(id),
        },
      ],
    );
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.left}>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>
            {formatDate(entryDate)}
          </Text>
          <Text style={[styles.value, { color: colors.foreground }]}>
            {formatCurrency(potValue)}
          </Text>
          {totalContributions ? (
            <Text
              style={[styles.contributions, { color: colors.mutedForeground }]}
            >
              Contributions: {formatCurrency(totalContributions)}
            </Text>
          ) : null}
          {notes ? (
            <Text style={[styles.notes, { color: colors.mutedForeground }]}>
              {notes}
            </Text>
          ) : null}
        </View>
        <View style={styles.right}>
          {growthAmt != null && growthPct != null ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: isPositive ? colors.positiveBg : colors.negativeBg },
              ]}
            >
              <Ionicons
                name={isPositive ? "trending-up" : "trending-down"}
                size={12}
                color={growthColor}
              />
              <Text style={[styles.badgeText, { color: growthColor }]}>
                {isPositive ? "+" : ""}
                {growthPct.toFixed(1)}%
              </Text>
            </View>
          ) : (
            <View
              style={[styles.badge, { backgroundColor: colors.secondary }]}
            >
              <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
                First
              </Text>
            </View>
          )}
          <TouchableOpacity
            onPress={handleDelete}
            style={styles.deleteBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="trash-outline"
              size={18}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  left: {
    flex: 1,
    gap: 2,
  },
  right: {
    alignItems: "flex-end",
    gap: 10,
    marginLeft: 12,
  },
  date: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 2,
  },
  value: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  contributions: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  notes: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
    marginTop: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  deleteBtn: {
    padding: 2,
  },
});
