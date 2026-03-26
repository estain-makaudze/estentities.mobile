import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { authenticate, createLoanApplication } from "../services/loanApi";
import {
  LocalExpenseLine,
  LocalLoanApplication,
  LocalOrderingLine,
  LocalProductLine,
  useApplications,
} from "../store/applicationStore";
import { useCache } from "../store/cacheStore";
import { useSettings } from "../store/settingsStore";
import { formatMoney } from "../utils/format";

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { key: "applicant",  label: "Applicant"     },
  { key: "business",   label: "Business"      },
  { key: "loan",       label: "Loan Terms"    },
  { key: "health",     label: "Health/Sales"  },
  { key: "products",   label: "Products"      },
  { key: "ordering",   label: "Ordering"      },
  { key: "expenses",   label: "Expenses"      },
  { key: "review",     label: "Review"        },
];

// ── Shared input components ───────────────────────────────────────────────────

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={cs.label}>
      {text}{required ? <Text style={{ color: "#EF4444" }}> *</Text> : null}
    </Text>
  );
}

function FInput({
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  multiline = false,
  autoCapitalize = "sentences",
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad" | "decimal-pad" | "numeric";
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <TextInput
      style={[cs.input, multiline && cs.inputMulti]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      keyboardType={keyboardType}
      multiline={multiline}
      numberOfLines={multiline ? 3 : 1}
      autoCapitalize={autoCapitalize}
      returnKeyType={multiline ? "default" : "next"}
    />
  );
}

function NumInput({
  value,
  onChangeText,
  placeholder = "0",
  decimal = true,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  decimal?: boolean;
}) {
  return (
    <TextInput
      style={cs.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      keyboardType={decimal ? "decimal-pad" : "numeric"}
      returnKeyType="done"
    />
  );
}

function ChipSelector<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={cs.chipRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[cs.chip, value === opt.value && cs.chipSelected]}
          onPress={() => onChange(opt.value)}
        >
          <Text style={[cs.chipText, value === opt.value && cs.chipTextSelected]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={cs.section}>
      {title ? <Text style={cs.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

function KpiRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={cs.kpiRow}>
      <Text style={cs.kpiLabel}>{label}</Text>
      <Text style={cs.kpiValue}>{value}</Text>
    </View>
  );
}

// ── Line management helpers ───────────────────────────────────────────────────

function makeLineId() {
  return `l_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ── Step 1 – Applicant ────────────────────────────────────────────────────────

function StepApplicant({
  app,
  update,
}: {
  app: LocalLoanApplication;
  update: (patch: Partial<LocalLoanApplication>) => void;
}) {
  return (
    <SectionCard title="Applicant Details">
      <Label text="Full Name" required />
      <FInput value={app.applicantName} onChangeText={(v) => update({ applicantName: v })} placeholder="e.g. John Doe" autoCapitalize="words" />

      <Label text="Phone Number" />
      <FInput value={app.applicantPhone} onChangeText={(v) => update({ applicantPhone: v })} placeholder="+256 700 000 000" keyboardType="phone-pad" autoCapitalize="none" />

      <Label text="Email Address" />
      <FInput value={app.applicantEmail} onChangeText={(v) => update({ applicantEmail: v })} placeholder="john@email.com" keyboardType="email-address" autoCapitalize="none" />

      <Label text="National ID" />
      <FInput value={app.nationalId} onChangeText={(v) => update({ nationalId: v })} placeholder="CM9200000..." autoCapitalize="characters" />
    </SectionCard>
  );
}

// ── Step 2 – Business ─────────────────────────────────────────────────────────

function StepBusiness({
  app,
  update,
}: {
  app: LocalLoanApplication;
  update: (patch: Partial<LocalLoanApplication>) => void;
}) {
  return (
    <SectionCard title="Business Profile">
      <Label text="Business Name" required />
      <FInput value={app.businessName} onChangeText={(v) => update({ businessName: v })} placeholder="e.g. Mama Jane General Store" autoCapitalize="words" />

      <Label text="Business Type" required />
      <ChipSelector
        options={[
          { label: "Retail", value: "retail" },
          { label: "Wholesale", value: "wholesale" },
          { label: "Manufacturing", value: "manufacturing" },
          { label: "Services", value: "services" },
          { label: "Agriculture", value: "agriculture" },
          { label: "Other", value: "other" },
        ]}
        value={app.businessType}
        onChange={(v) => update({ businessType: v })}
      />

      <Label text="Business Address" />
      <FInput value={app.businessAddress} onChangeText={(v) => update({ businessAddress: v })} placeholder="Street, town, district…" multiline />

      <View style={cs.row2}>
        <View style={{ flex: 1 }}>
          <Label text="Years Operating" />
          <NumInput value={app.yearsInOperation ? String(app.yearsInOperation) : ""} onChangeText={(v) => update({ yearsInOperation: parseFloat(v) || 0 })} />
        </View>
        <View style={{ flex: 1 }}>
          <Label text="Entrepreneur Exp. (yrs)" />
          <NumInput value={app.entrepreneurExperienceYears ? String(app.entrepreneurExperienceYears) : ""} onChangeText={(v) => update({ entrepreneurExperienceYears: parseFloat(v) || 0 })} />
        </View>
      </View>

      <Label text="Number of Employees" />
      <NumInput value={app.numberOfEmployees ? String(app.numberOfEmployees) : ""} onChangeText={(v) => update({ numberOfEmployees: parseInt(v) || 1 })} decimal={false} />
    </SectionCard>
  );
}

// ── Step 3 – Loan Terms ───────────────────────────────────────────────────────

function StepLoanTerms({
  app,
  update,
  currency,
}: {
  app: LocalLoanApplication;
  update: (patch: Partial<LocalLoanApplication>) => void;
  currency: string;
}) {
  return (
    <SectionCard title="Loan Terms">
      <Label text={`Loan Amount Requested (${currency})`} required />
      <NumInput value={app.loanAmountRequested ? String(app.loanAmountRequested) : ""} onChangeText={(v) => update({ loanAmountRequested: parseFloat(v.replace(",", ".")) || 0 })} placeholder="0" />

      <View style={cs.row2}>
        <View style={{ flex: 1 }}>
          <Label text="Interest Rate (%)" required />
          <NumInput value={String(app.interestRate)} onChangeText={(v) => update({ interestRate: parseFloat(v) || 0 })} placeholder="20" />
        </View>
        <View style={{ flex: 1 }}>
          <Label text="Repayment (months)" required />
          <NumInput value={app.repaymentPeriodMonths ? String(app.repaymentPeriodMonths) : ""} onChangeText={(v) => update({ repaymentPeriodMonths: parseInt(v) || 1 })} decimal={false} placeholder="1" />
        </View>
      </View>

      <Label text="Purpose of Loan" />
      <FInput value={app.purpose} onChangeText={(v) => update({ purpose: v })} placeholder="What will the funds be used for?" multiline />

      <Label text="Collateral Description" />
      <FInput value={app.collateralDescription} onChangeText={(v) => update({ collateralDescription: v })} placeholder="Land title, vehicle, goods…" multiline />
    </SectionCard>
  );
}

// ── Step 4 – Business Health & Sales ─────────────────────────────────────────

function StepHealthSales({
  app,
  update,
  currency,
}: {
  app: LocalLoanApplication;
  update: (patch: Partial<LocalLoanApplication>) => void;
  currency: string;
}) {
  return (
    <>
      <SectionCard title="Business Health">
        <View style={cs.switchRow}>
          <Text style={cs.switchLabel}>Keeps Bookkeeping Records?</Text>
          <Switch
            value={app.hasBookkeeping}
            onValueChange={(v) => update({ hasBookkeeping: v })}
            trackColor={{ true: "#2563EB" }}
          />
        </View>

        {app.hasBookkeeping && (
          <>
            <Label text="Bookkeeping Method" />
            <ChipSelector
              options={[
                { label: "Manual", value: "manual" },
                { label: "Spreadsheet", value: "spreadsheet" },
                { label: "Software", value: "accounting_software" },
              ]}
              value={app.bookkeepingMethod}
              onChange={(v) => update({ bookkeepingMethod: v })}
            />
          </>
        )}

        <Label text={`Existing Monthly Debt (${currency})`} />
        <NumInput value={app.existingMonthlyDebt ? String(app.existingMonthlyDebt) : ""} onChangeText={(v) => update({ existingMonthlyDebt: parseFloat(v.replace(",", ".")) || 0 })} />

        <Label text="Credit Score Band" />
        <ChipSelector
          options={[
            { label: "Low", value: "low" },
            { label: "Medium", value: "medium" },
            { label: "High", value: "high" },
          ]}
          value={app.creditScoreBand}
          onChange={(v) => update({ creditScoreBand: v })}
        />
      </SectionCard>

      <SectionCard title="Daily Sales Snapshot">
        <Text style={cs.sectionHint}>
          All values in {currency} per day
        </Text>
        <Label text="Average Daily Sales" />
        <NumInput value={app.averageDailySales ? String(app.averageDailySales) : ""} onChangeText={(v) => update({ averageDailySales: parseFloat(v.replace(",", ".")) || 0 })} />

        <Label text="Best Day Sales" />
        <NumInput value={app.bestDailySales ? String(app.bestDailySales) : ""} onChangeText={(v) => update({ bestDailySales: parseFloat(v.replace(",", ".")) || 0 })} />

        <Label text="Worst Day Sales" />
        <NumInput value={app.badDailySales ? String(app.badDailySales) : ""} onChangeText={(v) => update({ badDailySales: parseFloat(v.replace(",", ".")) || 0 })} />
      </SectionCard>
    </>
  );
}

// ── Step 5 – Products ─────────────────────────────────────────────────────────

function StepProducts({
  lines,
  onChange,
  currency,
}: {
  lines: LocalProductLine[];
  onChange: (lines: LocalProductLine[]) => void;
  currency: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<LocalProductLine>({
    id: "", productName: "", costPrice: 0, sellingPrice: 0, inventoryQty: 0,
  });

  const startAdd = () => {
    setDraft({ id: makeLineId(), productName: "", costPrice: 0, sellingPrice: 0, inventoryQty: 0 });
    setAdding(true);
  };

  const confirmAdd = () => {
    if (!draft.productName.trim()) {
      Alert.alert("Required", "Enter a product name.");
      return;
    }
    onChange([...lines, draft]);
    setAdding(false);
  };

  const remove = (id: string) => onChange(lines.filter((l) => l.id !== id));

  return (
    <SectionCard title="Products Sold">
      <Text style={cs.sectionHint}>List inventory products with cost and selling price</Text>
      {lines.map((line) => (
        <View key={line.id} style={cs.lineCard}>
          <View style={{ flex: 1 }}>
            <Text style={cs.lineTitle}>{line.productName}</Text>
            <Text style={cs.lineSub}>
              Cost: {formatMoney(line.costPrice, currency)} · Sell: {formatMoney(line.sellingPrice, currency)} · Qty: {line.inventoryQty}
            </Text>
            <Text style={cs.lineSub}>
              Inventory Value: {formatMoney(line.sellingPrice * line.inventoryQty, currency)}
            </Text>
          </View>
          <TouchableOpacity onPress={() => remove(line.id)} style={cs.lineRemove}>
            <Ionicons name="trash-outline" size={16} color="#EF4444" />
          </TouchableOpacity>
        </View>
      ))}

      {adding ? (
        <View style={cs.addForm}>
          <Label text="Product Name" required />
          <FInput value={draft.productName} onChangeText={(v) => setDraft((d) => ({ ...d, productName: v }))} placeholder="e.g. Maize flour" autoCapitalize="words" />
          <View style={cs.row2}>
            <View style={{ flex: 1 }}>
              <Label text={`Cost Price (${currency})`} />
              <NumInput value={draft.costPrice ? String(draft.costPrice) : ""} onChangeText={(v) => setDraft((d) => ({ ...d, costPrice: parseFloat(v.replace(",", ".")) || 0 }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Label text={`Selling Price (${currency})`} />
              <NumInput value={draft.sellingPrice ? String(draft.sellingPrice) : ""} onChangeText={(v) => setDraft((d) => ({ ...d, sellingPrice: parseFloat(v.replace(",", ".")) || 0 }))} />
            </View>
          </View>
          <Label text="Inventory Quantity" />
          <NumInput value={draft.inventoryQty ? String(draft.inventoryQty) : ""} onChangeText={(v) => setDraft((d) => ({ ...d, inventoryQty: parseFloat(v) || 0 }))} />
          <View style={cs.addFormActions}>
            <TouchableOpacity style={cs.addFormCancel} onPress={() => setAdding(false)}>
              <Text style={cs.addFormCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cs.addFormSave} onPress={confirmAdd}>
              <Text style={cs.addFormSaveText}>Add Product</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={cs.addLineBtn} onPress={startAdd}>
          <Ionicons name="add-circle-outline" size={18} color="#2563EB" />
          <Text style={cs.addLineBtnText}>Add Product</Text>
        </TouchableOpacity>
      )}
    </SectionCard>
  );
}

// ── Step 6 – Ordering ─────────────────────────────────────────────────────────

function StepOrdering({
  lines,
  onChange,
  currency,
}: {
  lines: LocalOrderingLine[];
  onChange: (lines: LocalOrderingLine[]) => void;
  currency: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<LocalOrderingLine>({
    id: "", itemName: "", supplierName: "", frequency: "weekly", ordersPerMonth: 0, averageOrderValue: 0,
  });

  const startAdd = () => {
    setDraft({ id: makeLineId(), itemName: "", supplierName: "", frequency: "weekly", ordersPerMonth: 0, averageOrderValue: 0 });
    setAdding(true);
  };

  const confirmAdd = () => {
    if (!draft.itemName.trim()) {
      Alert.alert("Required", "Enter an item name.");
      return;
    }
    onChange([...lines, draft]);
    setAdding(false);
  };

  const remove = (id: string) => onChange(lines.filter((l) => l.id !== id));

  const freqLabel: Record<string, string> = { daily: "Daily", weekly: "Weekly", biweekly: "Bi-Weekly", monthly: "Monthly" };

  return (
    <SectionCard title="Ordering Frequency">
      <Text style={cs.sectionHint}>How often does this business re-stock?</Text>
      {lines.map((line) => (
        <View key={line.id} style={cs.lineCard}>
          <View style={{ flex: 1 }}>
            <Text style={cs.lineTitle}>{line.itemName}</Text>
            {line.supplierName ? <Text style={cs.lineSub}>Supplier: {line.supplierName}</Text> : null}
            <Text style={cs.lineSub}>
              {freqLabel[line.frequency]} · {line.ordersPerMonth} orders/mo · {formatMoney(line.averageOrderValue, currency)} each
            </Text>
            <Text style={cs.lineSub}>
              Monthly total: {formatMoney(line.ordersPerMonth * line.averageOrderValue, currency)}
            </Text>
          </View>
          <TouchableOpacity onPress={() => remove(line.id)} style={cs.lineRemove}>
            <Ionicons name="trash-outline" size={16} color="#EF4444" />
          </TouchableOpacity>
        </View>
      ))}

      {adding ? (
        <View style={cs.addForm}>
          <Label text="Item / Stock Name" required />
          <FInput value={draft.itemName} onChangeText={(v) => setDraft((d) => ({ ...d, itemName: v }))} placeholder="e.g. Sugar" autoCapitalize="words" />
          <Label text="Supplier (optional)" />
          <FInput value={draft.supplierName} onChangeText={(v) => setDraft((d) => ({ ...d, supplierName: v }))} placeholder="e.g. Nandos Distributors" autoCapitalize="words" />
          <Label text="Frequency" />
          <ChipSelector
            options={[
              { label: "Daily", value: "daily" },
              { label: "Weekly", value: "weekly" },
              { label: "Bi-Weekly", value: "biweekly" },
              { label: "Monthly", value: "monthly" },
            ]}
            value={draft.frequency}
            onChange={(v) => setDraft((d) => ({ ...d, frequency: v }))}
          />
          <View style={cs.row2}>
            <View style={{ flex: 1 }}>
              <Label text="Orders / Month" />
              <NumInput value={draft.ordersPerMonth ? String(draft.ordersPerMonth) : ""} onChangeText={(v) => setDraft((d) => ({ ...d, ordersPerMonth: parseFloat(v) || 0 }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Label text={`Avg Order Value (${currency})`} />
              <NumInput value={draft.averageOrderValue ? String(draft.averageOrderValue) : ""} onChangeText={(v) => setDraft((d) => ({ ...d, averageOrderValue: parseFloat(v.replace(",", ".")) || 0 }))} />
            </View>
          </View>
          <View style={cs.addFormActions}>
            <TouchableOpacity style={cs.addFormCancel} onPress={() => setAdding(false)}>
              <Text style={cs.addFormCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cs.addFormSave} onPress={confirmAdd}>
              <Text style={cs.addFormSaveText}>Add Order Line</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={cs.addLineBtn} onPress={startAdd}>
          <Ionicons name="add-circle-outline" size={18} color="#2563EB" />
          <Text style={cs.addLineBtnText}>Add Order Line</Text>
        </TouchableOpacity>
      )}
    </SectionCard>
  );
}

// ── Step 7 – Expenses ─────────────────────────────────────────────────────────

function StepExpenses({
  lines,
  onChange,
  currency,
}: {
  lines: LocalExpenseLine[];
  onChange: (lines: LocalExpenseLine[]) => void;
  currency: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<LocalExpenseLine>({
    id: "", name: "", expenseType: "fixed", monthlyAmount: 0, note: "",
  });

  const startAdd = () => {
    setDraft({ id: makeLineId(), name: "", expenseType: "fixed", monthlyAmount: 0, note: "" });
    setAdding(true);
  };

  const confirmAdd = () => {
    if (!draft.name.trim()) {
      Alert.alert("Required", "Enter an expense name.");
      return;
    }
    onChange([...lines, draft]);
    setAdding(false);
  };

  const remove = (id: string) => onChange(lines.filter((l) => l.id !== id));

  const typeColors: Record<string, string> = { fixed: "#1D4ED8", variable: "#7C3AED", other: "#6B7280" };

  return (
    <SectionCard title="Monthly Expenses">
      <Text style={cs.sectionHint}>Rent, wages, transport, utilities…</Text>
      {lines.map((line) => (
        <View key={line.id} style={cs.lineCard}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={cs.lineTitle}>{line.name}</Text>
              <View style={[cs.typePill, { backgroundColor: typeColors[line.expenseType] + "22" }]}>
                <Text style={[cs.typePillText, { color: typeColors[line.expenseType] }]}>{line.expenseType}</Text>
              </View>
            </View>
            {line.note ? <Text style={cs.lineSub}>{line.note}</Text> : null}
            <Text style={[cs.lineSub, { fontWeight: "700", color: "#111827", marginTop: 2 }]}>
              {formatMoney(line.monthlyAmount, currency)} / month
            </Text>
          </View>
          <TouchableOpacity onPress={() => remove(line.id)} style={cs.lineRemove}>
            <Ionicons name="trash-outline" size={16} color="#EF4444" />
          </TouchableOpacity>
        </View>
      ))}

      {adding ? (
        <View style={cs.addForm}>
          <Label text="Expense Name" required />
          <FInput value={draft.name} onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))} placeholder="e.g. Shop Rent" autoCapitalize="words" />
          <Label text="Type" />
          <ChipSelector
            options={[
              { label: "Fixed", value: "fixed" },
              { label: "Variable", value: "variable" },
              { label: "Other", value: "other" },
            ]}
            value={draft.expenseType}
            onChange={(v) => setDraft((d) => ({ ...d, expenseType: v }))}
          />
          <Label text={`Monthly Amount (${currency})`} />
          <NumInput value={draft.monthlyAmount ? String(draft.monthlyAmount) : ""} onChangeText={(v) => setDraft((d) => ({ ...d, monthlyAmount: parseFloat(v.replace(",", ".")) || 0 }))} />
          <Label text="Note (optional)" />
          <FInput value={draft.note} onChangeText={(v) => setDraft((d) => ({ ...d, note: v }))} placeholder="Brief note…" />
          <View style={cs.addFormActions}>
            <TouchableOpacity style={cs.addFormCancel} onPress={() => setAdding(false)}>
              <Text style={cs.addFormCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cs.addFormSave} onPress={confirmAdd}>
              <Text style={cs.addFormSaveText}>Add Expense</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={cs.addLineBtn} onPress={startAdd}>
          <Ionicons name="add-circle-outline" size={18} color="#2563EB" />
          <Text style={cs.addLineBtnText}>Add Expense</Text>
        </TouchableOpacity>
      )}
    </SectionCard>
  );
}

// ── Step 8 – Review & Submit ──────────────────────────────────────────────────

function StepReview({
  app,
  update,
  currency,
  submitting,
  onSubmit,
  submitError,
  isOnline,
}: {
  app: LocalLoanApplication;
  update: (patch: Partial<LocalLoanApplication>) => void;
  currency: string;
  submitting: boolean;
  onSubmit: () => void;
  submitError: string | null;
  isOnline: boolean;
}) {
  // Computed KPIs (mirrors Python model)
  const kpis = useMemo(() => {
    const estimatedMonthlySales = app.averageDailySales * 30;
    const totalInventoryCost = app.productLines.reduce((s, p) => s + p.costPrice * p.inventoryQty, 0);
    const totalInventorySaleValue = app.productLines.reduce((s, p) => s + p.sellingPrice * p.inventoryQty, 0);
    const totalInventoryMargin = totalInventorySaleValue - totalInventoryCost;
    const totalMonthlyExpenses = app.expenseLines.reduce((s, e) => s + e.monthlyAmount, 0);
    const totalMonthlyOrdering = app.orderingLines.reduce((s, o) => s + o.ordersPerMonth * o.averageOrderValue, 0);
    const expectedMonthlyProfit = estimatedMonthlySales - totalMonthlyExpenses;
    const totalPayable = app.loanAmountRequested * (1 + app.interestRate / 100);
    const estimatedInstallment = app.repaymentPeriodMonths > 0 ? totalPayable / app.repaymentPeriodMonths : 0;
    const denominator = estimatedInstallment + app.existingMonthlyDebt;
    const dscr = denominator > 0 ? expectedMonthlyProfit / denominator : 0;
    return { estimatedMonthlySales, totalInventoryCost, totalInventorySaleValue, totalInventoryMargin, totalMonthlyExpenses, totalMonthlyOrdering, expectedMonthlyProfit, totalPayable, estimatedInstallment, dscr };
  }, [app]);

  const dscrColor = kpis.dscr >= 1.5 ? "#166534" : kpis.dscr >= 1 ? "#92400E" : "#991B1B";

  return (
    <>
      <SectionCard title="Applicant Summary">
        <KpiRow label="Name" value={app.applicantName || "—"} />
        <KpiRow label="Business" value={`${app.businessName} (${app.businessType})`} />
        <KpiRow label="Phone" value={app.applicantPhone || "—"} />
        <KpiRow label="National ID" value={app.nationalId || "—"} />
      </SectionCard>

      <SectionCard title="Loan Summary">
        <KpiRow label="Amount Requested" value={formatMoney(app.loanAmountRequested, currency)} />
        <KpiRow label="Interest Rate" value={`${app.interestRate}%`} />
        <KpiRow label="Repayment Period" value={`${app.repaymentPeriodMonths} months`} />
        <KpiRow label="Total Payable" value={formatMoney(kpis.totalPayable, currency)} />
        <KpiRow label="Est. Monthly Installment" value={formatMoney(kpis.estimatedInstallment, currency)} />
      </SectionCard>

      <SectionCard title="Financial Assessment">
        <KpiRow label="Est. Monthly Sales" value={formatMoney(kpis.estimatedMonthlySales, currency)} />
        <KpiRow label="Total Monthly Expenses" value={formatMoney(kpis.totalMonthlyExpenses, currency)} />
        <KpiRow label="Monthly Ordering" value={formatMoney(kpis.totalMonthlyOrdering, currency)} />
        <KpiRow label="Expected Monthly Profit" value={formatMoney(kpis.expectedMonthlyProfit, currency)} />
        <KpiRow label="Existing Monthly Debt" value={formatMoney(app.existingMonthlyDebt, currency)} />
      </SectionCard>

      <SectionCard title="Inventory">
        <KpiRow label="Total Inventory Cost" value={formatMoney(kpis.totalInventoryCost, currency)} />
        <KpiRow label="Inventory Sale Value" value={formatMoney(kpis.totalInventorySaleValue, currency)} />
        <KpiRow label="Inventory Margin" value={formatMoney(kpis.totalInventoryMargin, currency)} />
        <KpiRow label="Products Listed" value={String(app.productLines.length)} />
        <KpiRow label="Ordering Lines" value={String(app.orderingLines.length)} />
        <KpiRow label="Expense Lines" value={String(app.expenseLines.length)} />
      </SectionCard>

      {/* DSCR indicator */}
      <View style={[cs.dscrCard, { borderColor: dscrColor + "44", backgroundColor: dscrColor + "11" }]}>
        <Text style={cs.dscrLabel}>Debt Service Coverage Ratio (DSCR)</Text>
        <Text style={[cs.dscrValue, { color: dscrColor }]}>{kpis.dscr.toFixed(2)}x</Text>
        <Text style={[cs.dscrHint, { color: dscrColor }]}>
          {kpis.dscr >= 1.5 ? "✓ Strong — likely repayable" : kpis.dscr >= 1 ? "⚠ Marginal — monitor closely" : "✗ Weak — may struggle to repay"}
        </Text>
      </View>

      {/* Assessment note */}
      <SectionCard title="Assessment Note">
        <FInput
          value={app.assessmentNote}
          onChangeText={(v) => update({ assessmentNote: v })}
          placeholder="Officer observations, recommendations…"
          multiline
        />
      </SectionCard>

      {submitError ? (
        <View style={cs.submitError}>
          <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
          <Text style={cs.submitErrorText}>{submitError}</Text>
        </View>
      ) : null}

      {!isOnline ? (
        <View style={cs.offlineNote}>
          <Ionicons name="cloud-offline-outline" size={16} color="#92400E" />
          <Text style={cs.offlineNoteText}>
            You are offline. The draft will be saved. Connect to internet to submit to Odoo.
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[cs.submitBtn, (!isOnline || submitting) && cs.submitBtnDisabled]}
        onPress={onSubmit}
        disabled={!isOnline || submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={20} color="#FFFFFF" />
            <Text style={cs.submitBtnText}>Submit to Odoo</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={{ height: 16 }} />
    </>
  );
}

// ── Main form screen ──────────────────────────────────────────────────────────

export default function NewApplicationScreen() {
  const { appId } = useLocalSearchParams<{ appId: string }>();
  const { settings } = useSettings();
  const { getById, saveApplication, markSubmitted, markSubmitError } = useApplications();
  const { isOnline } = useCache();

  const [step, setStep] = useState(0);
  const [app, setApp] = useState<LocalLoanApplication | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const currency = settings.defaultCurrency || "UGX";

  useEffect(() => {
    if (appId) {
      const found = getById(appId);
      if (found) setApp(found);
    }
  }, [appId, getById]);

  const update = useCallback(
    (patch: Partial<LocalLoanApplication>) => {
      setApp((prev) => {
        if (!prev) return prev;
        return { ...prev, ...patch };
      });
    },
    []
  );

  // Auto-save on step change or when going back
  const autoSave = useCallback(async () => {
    if (app) await saveApplication(app);
  }, [app, saveApplication]);

  const goBack = useCallback(async () => {
    await autoSave();
    if (step === 0) {
      router.back();
    } else {
      setStep((s) => s - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [autoSave, step]);

  const validateStep = useCallback((): string | null => {
    if (!app) return null;
    switch (step) {
      case 0:
        if (!app.applicantName.trim()) return "Applicant name is required.";
        break;
      case 1:
        if (!app.businessName.trim()) return "Business name is required.";
        break;
      case 2:
        if (app.loanAmountRequested <= 0) return "Loan amount must be greater than zero.";
        if (app.repaymentPeriodMonths <= 0) return "Repayment period must be at least 1 month.";
        break;
    }
    return null;
  }, [app, step]);

  const goNext = useCallback(async () => {
    const err = validateStep();
    if (err) {
      Alert.alert("Required field", err);
      return;
    }
    await autoSave();
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [autoSave, step, validateStep]);

  const handleSubmit = useCallback(async () => {
    if (!app) return;
    if (!app.applicantName.trim() || !app.businessName.trim() || app.loanAmountRequested <= 0) {
      Alert.alert("Incomplete", "Fill in at least the applicant name, business name and loan amount.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const uid = await authenticate(settings);
      const result = await createLoanApplication(settings, uid, app);
      await markSubmitted(app.id, result.id, result.name);
      Alert.alert("Submitted!", `Application ${result.name} created in Odoo.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg);
      await markSubmitError(app.id, msg);
    } finally {
      setSubmitting(false);
    }
  }, [app, markSubmitError, markSubmitted, settings]);

  if (!app) {
    return (
      <View style={cs.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  const isLastStep = step === STEPS.length - 1;

  const renderStep = () => {
    switch (step) {
      case 0: return <StepApplicant app={app} update={update} />;
      case 1: return <StepBusiness app={app} update={update} />;
      case 2: return <StepLoanTerms app={app} update={update} currency={currency} />;
      case 3: return <StepHealthSales app={app} update={update} currency={currency} />;
      case 4: return <StepProducts lines={app.productLines} onChange={(lines) => update({ productLines: lines })} currency={currency} />;
      case 5: return <StepOrdering lines={app.orderingLines} onChange={(lines) => update({ orderingLines: lines })} currency={currency} />;
      case 6: return <StepExpenses lines={app.expenseLines} onChange={(lines) => update({ expenseLines: lines })} currency={currency} />;
      case 7: return (
        <StepReview
          app={app}
          update={update}
          currency={currency}
          submitting={submitting}
          onSubmit={handleSubmit}
          submitError={submitError}
          isOnline={isOnline}
        />
      );
      default: return null;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#F1F5F9" }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={cs.header}>
        <TouchableOpacity onPress={goBack} style={cs.headerBack}>
          <Ionicons name="chevron-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={cs.headerTitle}>Loan Application</Text>
          <Text style={cs.headerSub}>
            {app.applicantName || "New Applicant"} · Step {step + 1} of {STEPS.length}
          </Text>
        </View>
        <TouchableOpacity onPress={autoSave} style={cs.headerSave}>
          <Ionicons name="save-outline" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {/* ── Step indicator ─────────────────────────────────────────────── */}
      <View style={cs.stepBar}>
        <View style={[cs.stepProgress, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
      </View>
      <View style={cs.stepLabels}>
        {STEPS.map((s, i) => (
          <View key={s.key} style={[cs.stepDot, i === step && cs.stepDotActive, i < step && cs.stepDotDone]}>
            {i < step ? (
              <Ionicons name="checkmark" size={10} color="#FFFFFF" />
            ) : (
              <Text style={[cs.stepDotText, i === step && cs.stepDotTextActive]}>{i + 1}</Text>
            )}
          </View>
        ))}
      </View>
      <Text style={cs.stepTitle}>{STEPS[step].label}</Text>

      {/* ── Form content ───────────────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={120}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={cs.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {renderStep()}
        </ScrollView>

        {/* ── Navigation bar ─────────────────────────────────────────────── */}
        {!isLastStep && (
          <View style={cs.navBar}>
            <TouchableOpacity
              style={[cs.navBtn, cs.navBtnBack, step === 0 && cs.navBtnDisabled]}
              onPress={goBack}
            >
              <Ionicons name="chevron-back" size={18} color={step === 0 ? "#9CA3AF" : "#374151"} />
              <Text style={[cs.navBtnText, step === 0 && cs.navBtnTextDisabled]}>Back</Text>
            </TouchableOpacity>

            <View style={cs.navSave}>
              <Text style={cs.navSaveText}>Auto-saved</Text>
            </View>

            <TouchableOpacity style={[cs.navBtn, cs.navBtnNext]} onPress={goNext}>
              <Text style={cs.navBtnNextText}>Next</Text>
              <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const cs = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F1F5F9" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 56 : 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    gap: 8,
  },
  headerBack: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  headerSub: { fontSize: 12, color: "#6B7280", marginTop: 1 },
  headerSave: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },

  // Step indicator
  stepBar: {
    height: 4,
    backgroundColor: "#E5E7EB",
  },
  stepProgress: {
    height: 4,
    backgroundColor: "#2563EB",
  },
  stepLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
  },
  stepDotActive: { backgroundColor: "#2563EB" },
  stepDotDone: { backgroundColor: "#16A34A" },
  stepDotText: { fontSize: 10, fontWeight: "700", color: "#6B7280" },
  stepDotTextActive: { color: "#FFFFFF" },
  stepTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: "#F1F5F9",
  },

  // Scroll content
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Section card
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 0,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  sectionHint: { fontSize: 12, color: "#9CA3AF", marginBottom: 10 },

  // Form elements
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 15,
    color: "#111827",
  },
  inputMulti: { minHeight: 72, textAlignVertical: "top" },

  // Chip selector
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: "#F3F4F6",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
  },
  chipSelected: { backgroundColor: "#EFF6FF", borderColor: "#2563EB" },
  chipText: { fontSize: 13, color: "#6B7280", fontWeight: "600" },
  chipTextSelected: { color: "#2563EB" },

  // Switch row
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    marginTop: 4,
  },
  switchLabel: { fontSize: 14, color: "#374151", fontWeight: "600", flex: 1 },

  // Two-column row
  row2: { flexDirection: "row", gap: 10 },

  // Line cards
  lineCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 10,
  },
  lineTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  lineSub: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  lineRemove: { padding: 4 },
  typePill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  typePillText: { fontSize: 10, fontWeight: "700" },

  // Add line
  addLineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: "#BFDBFE",
    borderRadius: 10,
    borderStyle: "dashed",
    justifyContent: "center",
    backgroundColor: "#EFF6FF",
  },
  addLineBtnText: { color: "#2563EB", fontWeight: "700", fontSize: 14 },
  addForm: {
    marginTop: 10,
    padding: 12,
    backgroundColor: "#F0F9FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  addFormActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  addFormCancel: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
  },
  addFormCancelText: { color: "#374151", fontWeight: "600" },
  addFormSave: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#2563EB",
    alignItems: "center",
  },
  addFormSaveText: { color: "#FFFFFF", fontWeight: "700" },

  // Review
  kpiRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  kpiLabel: { fontSize: 13, color: "#6B7280" },
  kpiValue: { fontSize: 14, fontWeight: "700", color: "#111827" },
  dscrCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 12,
    alignItems: "center",
    gap: 4,
  },
  dscrLabel: { fontSize: 13, color: "#374151", fontWeight: "600" },
  dscrValue: { fontSize: 36, fontWeight: "800" },
  dscrHint: { fontSize: 13, fontWeight: "600", textAlign: "center" },

  // Submit
  submitBtn: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#16A34A",
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  submitBtnDisabled: { backgroundColor: "#9CA3AF" },
  submitBtnText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  submitError: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    alignItems: "flex-start",
  },
  submitErrorText: { flex: 1, fontSize: 13, color: "#B91C1C" },
  offlineNote: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    alignItems: "flex-start",
  },
  offlineNoteText: { flex: 1, fontSize: 13, color: "#92400E" },

  // Nav bar
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    gap: 10,
  },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  navBtnBack: { backgroundColor: "#F3F4F6" },
  navBtnDisabled: { backgroundColor: "#F9FAFB" },
  navBtnText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  navBtnTextDisabled: { color: "#9CA3AF" },
  navSave: { flex: 1, alignItems: "center" },
  navSaveText: { fontSize: 12, color: "#9CA3AF" },
  navBtnNext: { backgroundColor: "#2563EB" },
  navBtnNextText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
});



