import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const REMINDER_ID_KEY = "@pension_tracker/upload_reminder_id";
const REMINDER_DAYS = 14;

export function setupNotificationHandler() {
  if (Platform.OS === "web") return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

export async function scheduleUploadReminder(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const existing = await AsyncStorage.getItem(REMINDER_ID_KEY);
    if (existing) {
      await Notifications.cancelScheduledNotificationAsync(existing).catch(() => {});
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Pension update due 💰",
        body: "It's been 2 weeks since your last snapshot — keep your insights up to date.",
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: REMINDER_DAYS * 24 * 60 * 60,
        repeats: false,
      },
    });

    await AsyncStorage.setItem(REMINDER_ID_KEY, id);
  } catch {
  }
}

export async function cancelUploadReminder(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const existing = await AsyncStorage.getItem(REMINDER_ID_KEY);
    if (existing) {
      await Notifications.cancelScheduledNotificationAsync(existing);
      await AsyncStorage.removeItem(REMINDER_ID_KEY);
    }
  } catch {
  }
}
