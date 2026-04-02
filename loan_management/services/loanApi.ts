import { callKw, jsonRpc } from "./odooClient";
import { LoanInvoice, LoanSchedule, LoanScheduleLine, OdooAuthResult, OdooSettings } from "../types/odoo";
import { LocalLoanApplication } from "../store/applicationStore";

export async function authenticate(settings: OdooSettings): Promise<number> {
  const result = await jsonRpc<OdooAuthResult>(
    settings.baseUrl,
    "/web/session/authenticate",
    {
      db: settings.db,
      login: settings.username,
      password: settings.password,
    }
  );

  if (!result || result.uid === false || result.uid === undefined) {
    throw new Error("Authentication failed. Check your Odoo URL, database and login details.");
  }

  return result.uid;
}

export async function fetchLoanInvoices(
  settings: OdooSettings,
  uid: number
): Promise<LoanInvoice[]> {
  return callKw<LoanInvoice[]>(settings, uid, "account.move", "search_read", [
    [
      ["move_type", "=", "out_invoice"],
      ["state", "!=", "cancel"],
    ],
  ], {
    fields: [
      "id",
      "name",
      "partner_id",
      "create_date",
      "invoice_date",
      "invoice_date_due",
      "amount_total",
      "amount_residual",
      "payment_state",
      "state",
      "currency_id",
      "loan_management_status",
      "loan_next_expected_amount",
      "loan_due_amount",
      "loan_next_single_amount",
      "loan_next_payment_date",
    ],
    order: "create_date desc, id desc",
    limit: 200,
  });
}

export async function fetchLoanSchedules(
  settings: OdooSettings,
  uid: number
): Promise<LoanSchedule[]> {
  return callKw<LoanSchedule[]>(settings, uid, "loan.payment.schedule", "search_read", [[]], {
    fields: [
      "id",
      "name",
      "invoice_id",
      "partner_id",
      "invoice_date",
      "next_expected_amount",
      "due_amount",
      "next_single_amount",
      "next_payment_date",
      "missed_count",
      "management_status",
      "manual_management_status",
    ],
    order: "id desc",
    limit: 200,
  });
}

export async function fetchScheduleLinesByInvoiceId(
  settings: OdooSettings,
  uid: number,
  invoiceId: number
): Promise<LoanScheduleLine[]> {
  return callKw<LoanScheduleLine[]>(
    settings,
    uid,
    "loan.payment.schedule.line",
    "search_read",
    [[["invoice_id", "=", invoiceId]]],
    {
      fields: ["id", "schedule_id", "invoice_id", "currency_id", "payment_date", "expected_amount", "state", "paid_date", "note"],
      order: "payment_date asc",
    }
  );
}

export async function fetchScheduleLinesById(
  settings: OdooSettings,
  uid: number,
  scheduleId: number
): Promise<LoanScheduleLine[]> {
  return callKw<LoanScheduleLine[]>(
    settings,
    uid,
    "loan.payment.schedule.line",
    "search_read",
    [[["schedule_id", "=", scheduleId]]],
    {
      fields: ["id", "schedule_id", "invoice_id", "currency_id", "payment_date", "expected_amount", "state", "paid_date", "note"],
      order: "payment_date asc",
    }
  );
}

export async function updateScheduleLine(
  settings: OdooSettings,
  uid: number,
  lineId: number,
  vals: { payment_date?: string; expected_amount?: number; note?: string }
): Promise<void> {
  await callKw<boolean>(settings, uid, "loan.payment.schedule.line", "write", [[lineId], vals]);
}

export async function addScheduleLine(
  settings: OdooSettings,
  uid: number,
  scheduleId: number,
  vals: { payment_date: string; expected_amount: number; note?: string }
): Promise<number> {
  return callKw<number>(settings, uid, "loan.payment.schedule.line", "create", [{
    schedule_id: scheduleId,
    ...vals,
  }]);
}

export async function changeScheduleLineState(
  settings: OdooSettings,
  uid: number,
  lineId: number,
  action: "action_mark_paid" | "action_mark_unpaid" | "action_mark_missed" | "action_mark_canceled"
): Promise<void> {
  await callKw<boolean>(settings, uid, "loan.payment.schedule.line", action, [[lineId]]);
}

export async function updateSchedule(
  settings: OdooSettings,
  uid: number,
  scheduleId: number,
  vals: { name?: string }
): Promise<void> {
  await callKw<boolean>(settings, uid, "loan.payment.schedule", "write", [[scheduleId], vals]);
}

export async function cancelOpenLines(
  settings: OdooSettings,
  uid: number,
  lineIds: number[]
): Promise<void> {
  if (lineIds.length === 0) return;
  await callKw<boolean>(settings, uid, "loan.payment.schedule.line", "write", [lineIds, { state: "canceled" }]);
}

export async function setScheduleManualStatus(
  settings: OdooSettings,
  uid: number,
  scheduleId: number,
  status: string | false
): Promise<void> {
  const vals: Record<string, unknown> = { manual_management_status: status || false };
  if (status === "non_communicating") {
    vals.is_non_communicating = true;
  } else if (status) {
    vals.is_non_communicating = false;
  }
  await callKw<boolean>(settings, uid, "loan.payment.schedule", "write", [[scheduleId], vals]);
}

export async function fetchDueScheduleLines(
  settings: OdooSettings,
  uid: number,
  today: string
): Promise<LoanScheduleLine[]> {
  return callKw<LoanScheduleLine[]>(
    settings,
    uid,
    "loan.payment.schedule.line",
    "search_read",
    [
      [
        ["payment_date", "<=", today],
        ["state", "in", ["unpaid", "missed"]],
      ],
    ],
    {
      fields: [
        "id",
        "schedule_id",
        "invoice_id",
        "currency_id",
        "payment_date",
        "expected_amount",
        "state",
        "paid_date",
        "note",
      ],
      order: "payment_date asc",
      limit: 500,
    }
  );
}

export async function markScheduleLinePaid(
  settings: OdooSettings,
  uid: number,
  lineId: number
): Promise<void> {
  await callKw<boolean>(
    settings,
    uid,
    "loan.payment.schedule.line",
    "action_mark_paid",
    [[lineId]],
  );
}

export async function postMessageToOdoo(
  settings: OdooSettings,
  uid: number,
  invoiceId: number,
  body: string
): Promise<void> {
  await callKw<number>(settings, uid, "account.move", "message_post", [[invoiceId]], {
    body,
    message_type: "comment",
    subtype_xmlid: "mail.mt_note",
  });
}

export async function createLoanApplication(
  settings: OdooSettings,
  uid: number,
  app: LocalLoanApplication
): Promise<{ id: number; name: string }> {
  const vals = {
    applicant_name: app.applicantName,
    applicant_phone: app.applicantPhone || false,
    applicant_email: app.applicantEmail || false,
    national_id: app.nationalId || false,
    business_name: app.businessName,
    business_type: app.businessType,
    business_address: app.businessAddress || false,
    years_in_operation: app.yearsInOperation,
    entrepreneur_experience_years: app.entrepreneurExperienceYears,
    number_of_employees: app.numberOfEmployees,
    loan_amount_requested: app.loanAmountRequested,
    interest_rate: app.interestRate,
    repayment_period_months: app.repaymentPeriodMonths,
    purpose: app.purpose || false,
    collateral_description: app.collateralDescription || false,
    has_bookkeeping: app.hasBookkeeping,
    bookkeeping_method: app.bookkeepingMethod,
    existing_monthly_debt: app.existingMonthlyDebt,
    credit_score_band: app.creditScoreBand,
    average_daily_sales: app.averageDailySales,
    best_daily_sales: app.bestDailySales,
    bad_daily_sales: app.badDailySales,
    assessment_note: app.assessmentNote || false,
    product_line_ids: app.productLines.map((p) => [
      0, 0,
      {
        product_name: p.productName,
        cost_price: p.costPrice,
        selling_price: p.sellingPrice,
        inventory_qty: p.inventoryQty,
      },
    ]),
    ordering_line_ids: app.orderingLines.map((o) => [
      0, 0,
      {
        item_name: o.itemName,
        supplier_name: o.supplierName || false,
        frequency: o.frequency,
        orders_per_month: o.ordersPerMonth,
        average_order_value: o.averageOrderValue,
      },
    ]),
    expense_line_ids: app.expenseLines.map((e) => [
      0, 0,
      {
        name: e.name,
        expense_type: e.expenseType,
        monthly_amount: e.monthlyAmount,
        note: e.note || false,
      },
    ]),
  };

  const newId = await callKw<number>(settings, uid, "loan.application", "create", [vals]);
  const records = await callKw<{ id: number; name: string }[]>(
    settings, uid, "loan.application", "search_read",
    [[["id", "=", newId]]],
    { fields: ["id", "name"], limit: 1 }
  );
  return records[0];
}

