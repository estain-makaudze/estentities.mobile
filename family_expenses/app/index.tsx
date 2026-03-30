import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../context/AuthContext";

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F2F2F7" }}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }

  return <Redirect href={session ? "/(tabs)" : "/login"} />;
}
