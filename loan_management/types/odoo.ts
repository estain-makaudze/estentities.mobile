export interface OdooSettings {
  baseUrl: string;
  db: string;
  username: string;
  password: string;
  defaultCurrency: string;
  // ── Twilio SMS ─────────────────────────────────────────────────────────
  smsEnabled: boolean;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
}

export type Many2OneValue = [number, string] | false;

export interface OdooAuthResult {
  uid: number | false;
  name?: string;
}

export interface LoanInvoice {
  id: number;
  name: string;
  partner_id: Many2OneValue;
  create_date: string | false;
  invoice_date: string | false;
  invoice_date_due: string | false;
  amount_total: number;
  amount_residual: number;
  payment_state: string;
  state: string;
  currency_id: Many2OneValue;
  loan_management_status: string | false;
  loan_next_expected_amount: number;
  loan_due_amount: number;
  loan_next_single_amount: number;
  loan_next_payment_date: string | false;
}

export interface LoanSchedule {
  id: number;
  name: string;
  invoice_id: Many2OneValue;
  partner_id: Many2OneValue;
  invoice_date: string | false;
  next_expected_amount: number;
  due_amount: number;
  next_single_amount: number;
  next_payment_date: string | false;
  missed_count: number;
  management_status: string;
  manual_management_status: string | false;
}

export type ScheduleLineState = "unpaid" | "paid" | "missed" | "canceled";

export interface LoanScheduleLine {
  id: number;
  schedule_id: Many2OneValue;
  invoice_id: Many2OneValue;
  currency_id: Many2OneValue;
  payment_date: string;
  expected_amount: number;
  state: "unpaid" | "paid" | "missed" | "canceled";
  paid_date: string | false;
  note: string | false;
}

export interface CachedCollection<T> {
  items: T[];
  fetchedAt: string | null;
}
