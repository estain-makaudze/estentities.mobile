// -*- coding: utf-8 -*-
// Settings context: persists Odoo connection config via AsyncStorage

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { OdooSettings } from "../types/odoo";

const STORAGE_KEY = "odoo_settings";

export const DEFAULT_SETTINGS: OdooSettings = {
  baseUrl: "",
  db: "",
  username: "",
  password: "",
  defaultCurrency: "USD",
};

interface SettingsContextValue {
  settings: OdooSettings;
  isLoaded: boolean;
  saveSettings: (s: OdooSettings) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,
  saveSettings: async () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<OdooSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            setSettings(JSON.parse(raw));
          } catch {
            // malformed JSON – fall back to defaults
          }
        }
      })
      .finally(() => setIsLoaded(true));
  }, []);

  const saveSettings = useCallback(async (s: OdooSettings) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSettings(s);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, isLoaded, saveSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

