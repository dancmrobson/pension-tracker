import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as XLSX from "xlsx";
import { useFocusEffect, useScrollToTop } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";
import { useUserName } from "@/hooks/useUserName";
import {
  useAnalyzePensionImage,
  useCreatePensionEntry,
  useUploadContributionsCsv,
  getListPensionEntriesQueryKey,
  getGetPensionInsightsQueryKey,
  getListContributionsQueryKey,
} from "@workspace/api-client-react";

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

export default function UploadScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { name, saveName } = useUserName();
  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);
  const savedRef = useRef(false);

  // Screenshot upload state
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [editDate, setEditDate] = useState(todayString());
  const [editValue, setEditValue] = useState("");
  const [editContributions, setEditContributions] = useState("");
  const [confidence, setConfidence] = useState<string | null>(null);
  const [analyzeMessage, setAnalyzeMessage] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState(false);

  // CSV upload state
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);

  const analyzeMutation = useAnalyzePensionImage();
  const createMutation = useCreatePensionEntry({
    mutation: {
      onSuccess: () => {
        savedRef.current = true;
        queryClient.invalidateQueries({ queryKey: getListPensionEntriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPensionInsightsQueryKey() });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Saved", "Pension entry saved successfully.", [
          {
            text: "View Dashboard",
            onPress: () => router.push("/"),
          },
          {
            text: "Add Another",
            onPress: resetForm,
          },
        ]);
      },
      onError: () => {
        Alert.alert("Error", "Failed to save entry. Please try again.");
      },
    },
  });

  const csvMutation = useUploadContributionsCsv({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListContributionsQueryKey() });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "Contributions Imported",
          `Imported ${data.upserted} monthly period${data.upserted === 1 ? "" : "s"} from ${data.rows_parsed} row${data.rows_parsed === 1 ? "" : "s"}.`
        );
        setCsvFileName(null);
        setCsvUploading(false);
      },
      onError: () => {
        Alert.alert("Import Failed", "Could not parse the CSV. Make sure it's a contribution history export from your pension provider.");
        setCsvUploading(false);
      },
    },
  });

  const resetForm = () => {
    setImageUri(null);
    setImageBase64(null);
    setEditDate(todayString());
    setEditValue("");
    setEditContributions("");
    setConfidence(null);
    setAnalyzeMessage(null);
    setAnalyzed(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      if (savedRef.current) {
        resetForm();
        savedRef.current = false;
      }
    }, [])
  );

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: false,
      quality: 0.75,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setImageUri(asset.uri);
      setImageBase64(asset.base64 ?? null);
      setAnalyzed(false);
      setConfidence(null);
      setAnalyzeMessage(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const analyzeImage = async () => {
    if (!imageBase64) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    analyzeMutation.mutate(
      { data: { image_base64: imageBase64 } },
      {
        onSuccess: (data) => {
          setConfidence(data.confidence ?? null);
          setAnalyzeMessage(data.message ?? null);
          setAnalyzed(true);

          if (data.entry_date) setEditDate(data.entry_date);
          if (data.pot_value != null) setEditValue(String(data.pot_value));
          if (data.total_contributions != null)
            setEditContributions(String(data.total_contributions));
          if (data.user_name && !name) saveName(data.user_name);
        },
        onError: () => {
          Alert.alert("Error", "Failed to analyze image. Please try again or enter values manually.");
          setAnalyzed(true);
        },
      },
    );
  };

  const saveEntry = () => {
    if (!editDate || !editValue) {
      Alert.alert("Missing Info", "Please provide a date and pot value.");
      return;
    }
    const numVal = parseFloat(editValue.replace(/[^0-9.]/g, ""));
    if (isNaN(numVal) || numVal <= 0) {
      Alert.alert("Invalid Value", "Please enter a valid pot value.");
      return;
    }

    const numContrib = editContributions
      ? parseFloat(editContributions.replace(/[^0-9.]/g, ""))
      : null;

    createMutation.mutate({
      data: {
        entry_date: editDate,
        pot_value: String(numVal),
        total_contributions: numContrib != null && !isNaN(numContrib) ? String(numContrib) : null,
      },
    });
  };

  const pickAndUploadCsv = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "text/comma-separated-values",
          "application/csv",
          "public.comma-separated-values-text",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "com.microsoft.excel.xls",
          "org.openxmlformats.spreadsheetml.sheet",
          "*/*",
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const fileName = asset.name ?? "contributions.csv";
      const lower = fileName.toLowerCase();

      if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
        Alert.alert("Wrong File Type", "Please select a CSV or Excel file exported from your pension provider.");
        return;
      }

      setCsvFileName(fileName);
      setCsvUploading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      let csvText: string;

      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        // Read as base64, parse with SheetJS, convert first sheet → CSV string
        const b64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const workbook = XLSX.read(b64, { type: "base64" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          Alert.alert("Empty File", "The Excel file appears to have no sheets.");
          setCsvUploading(false);
          return;
        }
        csvText = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
      } else {
        csvText = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: "utf8",
        });
      }

      csvMutation.mutate({ data: { csv_text: csvText } });
    } catch {
      Alert.alert("Error", "Could not read the file. Please try again.");
      setCsvUploading(false);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const confidenceColor =
    confidence === "high"
      ? colors.positive
      : confidence === "medium"
        ? colors.accent
        : colors.negative;

  return (
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: topPad + 4 },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.heading, { color: colors.foreground }]}>
        Upload Screenshot
      </Text>
      <Text style={[styles.subheading, { color: colors.mutedForeground }]}>
        Take a screenshot of your pension app and upload it here. AI will extract the value and date automatically.
      </Text>

      <TouchableOpacity
        style={[
          styles.imagePicker,
          {
            backgroundColor: imageUri ? "transparent" : colors.secondary,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
        ]}
        onPress={pickImage}
        activeOpacity={0.75}
      >
        {imageUri ? (
          <>
            <Image
              source={{ uri: imageUri }}
              style={[styles.previewImage, { borderRadius: colors.radius }]}
              contentFit="contain"
            />
            <View
              style={[
                styles.changeOverlay,
                { borderRadius: colors.radius },
              ]}
            >
              <Ionicons name="camera" size={20} color="#fff" />
              <Text style={styles.changeText}>Change</Text>
            </View>
          </>
        ) : (
          <View style={styles.pickerPlaceholder}>
            <View
              style={[
                styles.pickerIcon,
                { backgroundColor: colors.muted },
              ]}
            >
              <Ionicons name="camera-outline" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.pickerText, { color: colors.foreground }]}>
              Choose screenshot
            </Text>
            <Text
              style={[styles.pickerSubtext, { color: colors.mutedForeground }]}
            >
              From your photo library
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {imageUri && !analyzed && (
        <TouchableOpacity
          style={[
            styles.analyzeBtn,
            {
              backgroundColor: colors.primary,
              borderRadius: colors.radius,
              opacity: analyzeMutation.isPending ? 0.6 : 1,
            },
          ]}
          onPress={analyzeImage}
          disabled={analyzeMutation.isPending}
        >
          {analyzeMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={styles.analyzeBtnText}>Analyze with AI</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {analyzed && analyzeMessage ? (
        <View
          style={[
            styles.confidenceRow,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Ionicons
            name={
              confidence === "high"
                ? "checkmark-circle"
                : confidence === "medium"
                  ? "alert-circle"
                  : "close-circle"
            }
            size={18}
            color={confidenceColor}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.confidenceLabel, { color: confidenceColor }]}>
              {confidence === "high"
                ? "High confidence"
                : confidence === "medium"
                  ? "Medium confidence — please review"
                  : "Low confidence — please enter manually"}
            </Text>
            <Text
              style={[
                styles.confidenceMessage,
                { color: colors.mutedForeground },
              ]}
            >
              {analyzeMessage}
            </Text>
          </View>
        </View>
      ) : null}

      {(analyzed || !imageUri) && (
        <View
          style={[
            styles.formCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Text style={[styles.formTitle, { color: colors.foreground }]}>
            {analyzed ? "Review & Save" : "Enter Manually"}
          </Text>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              Date (YYYY-MM-DD)
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  borderRadius: colors.radius / 2,
                },
              ]}
              value={editDate}
              onChangeText={setEditDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              Pension Pot Value (£)
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  borderRadius: colors.radius / 2,
                },
              ]}
              value={editValue}
              onChangeText={setEditValue}
              placeholder="e.g. 39432.42"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              Total Contributions (£) — optional
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  borderRadius: colors.radius / 2,
                },
              ]}
              value={editContributions}
              onChangeText={setEditContributions}
              placeholder="e.g. 27934.04"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
            />
          </View>

          <TouchableOpacity
            style={[
              styles.saveBtn,
              {
                backgroundColor: colors.primary,
                borderRadius: colors.radius,
                opacity: createMutation.isPending ? 0.6 : 1,
              },
            ]}
            onPress={saveEntry}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save Entry</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ---- Contribution History CSV ---- */}
      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>OR</Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>

      <View
        style={[
          styles.csvCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
        ]}
      >
        <View style={styles.csvHeader}>
          <View style={[styles.csvIconWrap, { backgroundColor: colors.muted }]}>
            <Ionicons name="document-text-outline" size={24} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.csvTitle, { color: colors.foreground }]}>
              Contribution History
            </Text>
            <Text style={[styles.csvSubtitle, { color: colors.mutedForeground }]}>
              Import a CSV or Excel file from your pension provider to see employer vs. employee contributions on your chart
            </Text>
          </View>
        </View>

        {csvFileName && !csvMutation.isSuccess ? (
          <View style={[styles.csvFileRow, { backgroundColor: colors.secondary, borderRadius: colors.radius / 2 }]}>
            <Ionicons name="document" size={16} color={colors.mutedForeground} />
            <Text style={[styles.csvFileName, { color: colors.foreground }]} numberOfLines={1}>
              {csvFileName}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[
            styles.csvBtn,
            {
              backgroundColor: colors.accent,
              borderRadius: colors.radius,
              opacity: csvUploading ? 0.6 : 1,
            },
          ]}
          onPress={pickAndUploadCsv}
          disabled={csvUploading}
          activeOpacity={0.8}
        >
          {csvUploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={styles.csvBtnText}>Choose CSV or Excel File</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.csvHint, { color: colors.mutedForeground }]}>
          Accepts CSV or Excel (.xlsx). Expects columns: date, contribution type, amount. Re-uploading replaces existing records.
        </Text>
      </View>

      <View
        style={{
          height: Platform.OS === "web" ? 34 : insets.bottom + 90,
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
  },
  heading: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 20,
  },
  imagePicker: {
    borderWidth: 1,
    borderStyle: "dashed",
    height: 220,
    overflow: "hidden",
    marginBottom: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  changeOverlay: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
  },
  changeText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  pickerPlaceholder: {
    alignItems: "center",
    gap: 10,
  },
  pickerIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  pickerSubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    marginBottom: 14,
  },
  analyzeBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  confidenceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  confidenceLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  confidenceMessage: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  formCard: {
    borderWidth: 1,
    padding: 16,
    gap: 14,
    marginBottom: 14,
  },
  formTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  input: {
    height: 46,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
  },
  saveBtn: {
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  csvCard: {
    borderWidth: 1,
    padding: 16,
    gap: 14,
    marginBottom: 14,
  },
  csvHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  csvIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  csvTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  csvSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  csvFileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
  },
  csvFileName: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  csvBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
  },
  csvBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  csvHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    opacity: 0.75,
  },
});
