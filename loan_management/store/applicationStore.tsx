// -*- coding: utf-8 -*-
// Local-only loan application drafts.
// Drafts live on-device until the user taps "Submit to Odoo".

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const STORAGE_KEY = "loan_management_applications_v1";

// ── Sub-line types ────────────────────────────────────────────────────────────

export interface LocalProductLine {
  id: string;
  productName: string;
  costPrice: number;
  sellingPrice: number;
  inventoryQty: number;
}

export interface LocalOrderingLine {
  id: string;
  itemName: string;
  supplierName: string;
  frequency: "daily" | "weekly" | "biweekly" | "monthly";
  ordersPerMonth: number;
  averageOrderValue: number;
}

export interface LocalExpenseLine {
  id: string;
  name: string;
  expenseType: "fixed" | "variable" | "other";
  monthlyAmount: number;
  note: string;
}

// ── Main application type ─────────────────────────────────────────────────────

export type ApplicationStatus = "draft" | "submitted";

export interface LocalLoanApplication {
  id: string;
  createdAt: string;
  updatedAt: string;

  status: ApplicationStatus;
  submittedAt: string | null;
  odooId: number | null;
  odooRef: string | null;
  submitError: string | null;

  // Applicant
  applicantName: string;
  applicantPhone: string;
  applicantEmail: string;
  nationalId: string;

  // Business
  businessName: string;
  businessType: "retail" | "wholesale" | "manufacturing" | "services" | "agriculture" | "other";
  businessAddress: string;
  yearsInOperation: number;
  entrepreneurExperienceYears: number;
  numberOfEmployees: number;

  // Loan terms
  loanAmountRequested: number;
  interestRate: number;
  repaymentPeriodMonths: number;
  purpose: string;
  collateralDescription: string;

  // Business health
  hasBookkeeping: boolean;
  bookkeepingMethod: "manual" | "spreadsheet" | "accounting_software";
  existingMonthlyDebt: number;
  creditScoreBand: "low" | "medium" | "high";

  // Sales snapshot
  averageDailySales: number;
  bestDailySales: number;
  badDailySales: number;

  // Lines
  productLines: LocalProductLine[];
  orderingLines: LocalOrderingLine[];
  expenseLines: LocalExpenseLine[];

  // Assessment
  assessmentNote: string;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_APPLICATION: Omit<
  LocalLoanApplication,
  "id" | "createdAt" | "updatedAt" | "status" | "submittedAt" | "odooId" | "odooRef" | "submitError"
> = {
  applicantName: "",
  applicantPhone: "",
  applicantEmail: "",
  nationalId: "",
  businessName: "",
  businessType: "retail",
  businessAddress: "",
  yearsInOperation: 0,
  entrepreneurExperienceYears: 0,
  numberOfEmployees: 1,
  loanAmountRequested: 0,
  interestRate: 20,
  repaymentPeriodMonths: 1,
  purpose: "",
  collateralDescription: "",
  hasBookkeeping: false,
  bookkeepingMethod: "manual",
  existingMonthlyDebt: 0,
  creditScoreBand: "medium",
  averageDailySales: 0,
  bestDailySales: 0,
  badDailySales: 0,
  productLines: [],
  orderingLines: [],
  expenseLines: [],
  assessmentNote: "",
};

// ── Context ───────────────────────────────────────────────────────────────────

interface ApplicationContextValue {
  applications: LocalLoanApplication[];
  isLoaded: boolean;
  createApplication: () => LocalLoanApplication;
  saveApplication: (app: LocalLoanApplication) => Promise<void>;
  markSubmitted: (id: string, odooId: number, odooRef: string) => Promise<void>;
  markSubmitError: (id: string, error: string) => Promise<void>;
  deleteApplication: (id: string) => Promise<void>;
  getById: (id: string) => LocalLoanApplication | undefined;
}

const ApplicationContext = createContext<ApplicationContextValue>({
  applications: [],
  isLoaded: false,
  createApplication: () => { throw new Error("not mounted"); },
  saveApplication: async () => {},
  markSubmitted: async () => {},
  markSubmitError: async () => {},
  deleteApplication: async () => {},
  getById: () => undefined,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId(): string {
  return `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function load(): Promise<LocalLoanApplication[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalLoanApplication[]) : [];
  } catch {
    return [];
  }
}

async function persist(items: LocalLoanApplication[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ApplicationProvider({ children }: { children: React.ReactNode }) {
  const [applications, setApplications] = useState<LocalLoanApplication[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    load().then(setApplications).finally(() => setIsLoaded(true));
  }, []);

  const createApplication = useCallback((): LocalLoanApplication => {
    const now = new Date().toISOString();
    return {
      ...DEFAULT_APPLICATION,
      id: makeId(),
      createdAt: now,
      updatedAt: now,
      status: "draft",
      submittedAt: null,
      odooId: null,
      odooRef: null,
      submitError: null,
    };
  }, []);

  const saveApplication = useCallback(
    async (app: LocalLoanApplication) => {
      const updated = { ...app, updatedAt: new Date().toISOString() };
      setApplications((prev) => {
        const idx = prev.findIndex((a) => a.id === updated.id);
        const next = idx >= 0
          ? prev.map((a) => (a.id === updated.id ? updated : a))
          : [updated, ...prev];
        persist(next).catch(() => {});
        return next;
      });
    },
    []
  );

  const markSubmitted = useCallback(
    async (id: string, odooId: number, odooRef: string) => {
      setApplications((prev) => {
        const next = prev.map((a) =>
          a.id === id
            ? { ...a, status: "submitted" as ApplicationStatus, submittedAt: new Date().toISOString(), odooId, odooRef, submitError: null }
            : a
        );
        persist(next).catch(() => {});
        return next;
      });
    },
    []
  );

  const markSubmitError = useCallback(
    async (id: string, error: string) => {
      setApplications((prev) => {
        const next = prev.map((a) =>
          a.id === id ? { ...a, submitError: error } : a
        );
        persist(next).catch(() => {});
        return next;
      });
    },
    []
  );

  const deleteApplication = useCallback(async (id: string) => {
    setApplications((prev) => {
      const next = prev.filter((a) => a.id !== id);
      persist(next).catch(() => {});
      return next;
    });
  }, []);

  const getById = useCallback(
    (id: string) => applications.find((a) => a.id === id),
    [applications]
  );

  return (
    <ApplicationContext.Provider
      value={{ applications, isLoaded, createApplication, saveApplication, markSubmitted, markSubmitError, deleteApplication, getById }}
    >
      {children}
    </ApplicationContext.Provider>
  );
}

export function useApplications() {
  return useContext(ApplicationContext);
}

