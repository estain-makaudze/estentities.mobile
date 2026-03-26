import { callKw } from "./odooClient";
import { OdooSettings, LoanSchedule } from "../types/odoo";
import { LocalCollection } from "../store/collectionStore";
import { formatMoney, formatDateLabel } from "../utils/format";

// ── Low-level Twilio REST call ────────────────────────────────────────────────
// Uses btoa (available globally in React Native 0.64+ / Expo 44+)

export async function sendSms(
  accountSid: string,
  authToken: string,
  fromNumber: string,
  toNumber: string,
  body: string
): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const credentials = btoa(`${accountSid}:${authToken}`);

  const encoded = [
    `To=${encodeURIComponent(toNumber)}`,
    `From=${encodeURIComponent(fromNumber)}`,
    `Body=${encodeURIComponent(body)}`,
  ].join("&");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encoded,
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const err = await response.json() as { message?: string };
      message = err.message || message;
    } catch { /* ignore parse errors */ }
    throw new Error(`Twilio: ${message}`);
  }
}

// ── Odoo data helpers (internal) ──────────────────────────────────────────────

async function fetchPartnerPhone(
  settings: OdooSettings,
  uid: number,
  partnerId: number
): Promise<string | null> {
  const records = await callKw<{ id: number; phone: string | false; mobile: string | false }[]>(
    settings,
    uid,
    "res.partner",
    "search_read",
    [[["id", "=", partnerId]]],
    { fields: ["id", "phone", "mobile"], limit: 1 }
  );
  if (!records[0]) return null;
  return (records[0].mobile || records[0].phone) || null;
}

async function fetchFreshSchedule(
  settings: OdooSettings,
  uid: number,
  scheduleId: number
): Promise<LoanSchedule | null> {
  const records = await callKw<LoanSchedule[]>(
    settings,
    uid,
    "loan.payment.schedule",
    "search_read",
    [[["id", "=", scheduleId]]],
    {
      fields: [
        "id", "name", "invoice_id", "partner_id", "invoice_date",
        "next_payment_date", "next_single_amount", "next_expected_amount",
        "due_amount", "missed_count", "management_status", "manual_management_status",
      ],
      limit: 1,
    }
  );
  return records[0] ?? null;
}

// ── SMS message builder ───────────────────────────────────────────────────────

function buildPaymentSms(item: LocalCollection, schedule: LoanSchedule): string {
  const paid = formatMoney(item.collectedAmount, item.currency);
  const ref  = item.invoiceName || item.scheduleName;

  let msg = `Dear ${item.partnerName}, we have received your payment of ${paid}`;
  if (ref) msg += ` for ${ref}`;
  msg += `.`;

  const outstanding = schedule.due_amount;
  if (outstanding > 0) {
    msg += ` You are left with ${formatMoney(outstanding, item.currency)} on your loan.`;
  } else {
    msg += ` Your payment plan is fully settled — well done!`;
  }

  if (schedule.next_payment_date) {
    const nextDate = formatDateLabel(schedule.next_payment_date);
    if (schedule.next_single_amount > 0) {
      msg += ` Looking forward to your next payment of ${formatMoney(schedule.next_single_amount, item.currency)} on ${nextDate}.`;
    } else {
      msg += ` Looking forward to your next payment on ${nextDate}.`;
    }
  }

  msg += ` Thank you!`;
  return msg;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Fetches the partner phone from Odoo, builds the payment SMS and fires it
 * via Twilio. Call this after markScheduleLinePaid succeeds.
 *
 * - Returns silently if SMS is disabled or credentials are missing.
 * - Returns silently if the partner has no phone number in Odoo.
 * - Throws if Twilio returns an error (caller should .catch() gracefully).
 */
export async function sendPaymentReceivedSms(
  settings: OdooSettings,
  uid: number,
  item: LocalCollection
): Promise<void> {
  if (!settings.smsEnabled) return;
  if (!settings.twilioAccountSid || !settings.twilioAuthToken || !settings.twilioFromNumber) return;
  if (!item.scheduleId) return;

  // 1. Fetch the FRESH schedule so we get updated due_amount & next_payment_date
  const schedule = await fetchFreshSchedule(settings, uid, item.scheduleId);
  if (!schedule) return;

  // 2. Resolve partner phone from Odoo contact
  const partnerId = Array.isArray(schedule.partner_id) ? schedule.partner_id[0] : null;
  if (!partnerId) return;

  const phone = await fetchPartnerPhone(settings, uid, partnerId);
  if (!phone) return; // no phone stored — skip silently

  // 3. Build message and fire
  const message = buildPaymentSms(item, schedule);
  await sendSms(
    settings.twilioAccountSid,
    settings.twilioAuthToken,
    settings.twilioFromNumber,
    phone,
    message
  );
}

