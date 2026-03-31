import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useHousehold } from "../context/HouseholdContext";

export default function Index() {
  const { session, loading: authLoading } = useAuth();
  const { household, loading: householdLoading } = useHousehold();

  if (authLoading || householdLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F2F2F7" }}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }

  if (!session) return <Redirect href="/login" />;
  if (!household) return <Redirect href="/household-setup" />;
  return <Redirect href="/(tabs)" />;
}

