import { Redirect } from "expo-router";
import { useAuth } from "../store/authStore";

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  return <Redirect href={isAuthenticated ? "/(tabs)/dashboard" : "/login"} />;
}
