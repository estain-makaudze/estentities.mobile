import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { getMeta, initDatabase } from "../db/database";
import { listHouseholds } from "../db/repo";
import { loadToken } from "../services/api";
import { syncNow } from "../services/syncEngine";
import { checkBudgetAlerts, scheduleBillReminders, scheduleDailyReminders } from "../utils/notify";
import { generateDueRecurring } from "../utils/recurring";

/**
 * Runs while the app is closed (Android WorkManager / iOS BGTaskScheduler,
 * roughly every 30 min — the OS decides exactly when): sync, add due recurring
 * bills, fire budget alerts and keep the reminder notifications scheduled.
 * Must be defined at module scope, so this file is imported by app/_layout.tsx.
 */
export const BACKGROUND_TASK = "family-expenses-background";

export async function runHousekeeping() {
  initDatabase();
  const userId = getMeta("userId");
  if (!userId || !(await loadToken())) return;
  await syncNow();
  const households = listHouseholds();
  const hh = households.find((h) => h.id === getMeta("householdId")) ?? households[0];
  if (!hh) return;
  if (generateDueRecurring(hh.id, userId) > 0) await syncNow();
  await checkBudgetAlerts(hh.id, hh.currency);
  await scheduleBillReminders(hh.id, hh.currency);
  await scheduleDailyReminders(hh.id, userId);
}

TaskManager.defineTask(BACKGROUND_TASK, async () => {
  try {
    await runHousekeeping();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.warn("background task failed", e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundTask() {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (!(await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK))) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_TASK, { minimumInterval: 30 });
    }
  } catch (e) {
    console.warn("could not register background task", e);
  }
}
