import AppRoutes from "./routes/AppRoutes";
import { usePreventNumberInputScroll } from "./hooks/usePreventNumberInputScroll";

export default function App() {
  usePreventNumberInputScroll();
  return <AppRoutes />;
}
