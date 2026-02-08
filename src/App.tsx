import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect, createContext, useContext } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./firebase";
import HomePage from "./pages/HomePage";
import SignPage from "./pages/SignPage";
import ChatPage from "./pages/ChatPage";
import TermsPage from "./pages/TermsPage";
import AdminPage from "./pages/AdminPage";
import UptimePage from "./pages/UptimePage";
import PaymentPage from "./pages/PaymentPage";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

export const AuthContext = createContext<AuthContextType>({ user: null, loading: true });
export function useAuth() { return useContext(AuthContext); }

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-[#050507] flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-violet-900 border-t-violet-400 rounded-full animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/sign" replace />;
  return <>{children}</>;
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/sign" element={<SignPage />} />
          <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/uptime" element={<UptimePage />} />
          <Route path="/payment" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </HashRouter>
    </AuthContext.Provider>
  );
}
