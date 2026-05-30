import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const USER_NAME_KEY = "@pension_tracker/user_name";

export function useUserName() {
  const [name, setName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(USER_NAME_KEY).then((val) => {
      if (val) setName(val);
      setLoaded(true);
    });
  }, []);

  const saveName = useCallback(async (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await AsyncStorage.setItem(USER_NAME_KEY, trimmed);
    setName(trimmed);
  }, []);

  return { name, saveName, loaded };
}
