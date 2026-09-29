// Kept for old deep links — editing now lives in add-expense (?id=…).
import { Redirect, useLocalSearchParams } from "expo-router";

export default function EditExpenseRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: "/add-expense", params: { id } }} />;
}
