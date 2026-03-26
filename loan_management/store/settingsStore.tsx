import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { OdooSettings } from "../types/odoo";

const STORAGE_KEY = "loan_management_odoo_settings";

export const DEFAULT_SETTINGS: OdooSettings = {
  baseUrl: "",
  db: "",
  username: "",
  password: "",
  defaultCurrency: "UGX",
  smsEnabled: false,
  twilioAccountSid: "",
  twilioAuthToken: "",
  twilioFromNumber: "",
};

interface SettingsContextValue {
  settings: OdooSettings;
  isLoaded: boolean;
  saveSettings: (nextSettings: OdooSettings) => Promise<void>;
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
        if (!raw) {
          return;
        }
        try {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
        } catch {
          setSettings(DEFAULT_SETTINGS);
        }
      })
      .finally(() => setIsLoaded(true));
  }, []);

  const saveSettings = useCallback(async (nextSettings: OdooSettings) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextSettings));
    setSettings(nextSettings);
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
