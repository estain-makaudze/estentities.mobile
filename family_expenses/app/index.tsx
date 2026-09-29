import { View } from "react-native";
import { useTheme } from "../theme";

/** Blank splash — AuthGuard in _layout redirects to login / setup / tabs. */
export default function Index() {
  const { c } = useTheme();
  return <View style={{ flex: 1, backgroundColor: c.bg }} />;
}
