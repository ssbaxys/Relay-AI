import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ref, onValue, set, remove, update, push, get } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import MarkdownRenderer from "../components/MarkdownRenderer";
import {
  Lock, ArrowLeft, Search, Ban, Trash2, ChevronDown, Save, Check, TrendingUp, Users, MessageCircle, FolderOpen,
  Eye, Send, Square, ArrowLeft as Back, Radio, Bot, Shield, Folder, ChevronRight, MessageSquare,
  Power, PowerOff, ImagePlus, X as XIcon
} from "lucide-react";

interface UserData {
  uid: string;
  displayName: string;
  email: string;
  plan: string;
  role: string;
  lastLogin: number;
  createdAt: number;
  banned?: boolean;
  visibleNick?: string;
}

interface SystemSettings {
  maintenance: boolean;
  maintenanceMessage: string;
  maintenanceEstimate: string;
  registrationEnabled: boolean;
  freeRequestsLimit: number;
  announcement: string;
}

type UptimeStatus = "operational" | "degraded" | "down" | "maintenance";

interface ComponentUptime {
  name: string;
  key: string;
  hours: UptimeStatus[];
}

const UPTIME_COMPONENTS = [
  { name: "API Gateway", key: "api_gateway" },
  { name: "AI Models Router", key: "ai_router" },
  { name: "Веб-приложение", key: "web_app" },
  { name: "База данных", key: "database" },
  { name: "Аутентификация", key: "auth" },
  { name: "CDN & Networking", key: "cdn" },
];

const STATUS_COLORS: Record<UptimeStatus, string> = {
  operational: "bg-emerald-500",
  degraded: "bg-yellow-500",
  down: "bg-red-500",
  maintenance: "bg-zinc-500",
};

const STATUS_LABELS: Record<UptimeStatus, string> = {
  operational: "Работает",
  degraded: "Деградация",
  down: "Не работает",
  maintenance: "Тех. работы",
};

const STATUS_OPTIONS: UptimeStatus[] = ["operational", "degraded", "down", "maintenance"];

const adminModels = [
  { id: "gpt-5.2-codex", name: "GPT-5.2 Codex", provider: "OpenAI", logo: "https://img.icons8.com/fluency-systems-regular/48/chatgpt.png", logoFilter: "invert(1) brightness(2)" },
  { id: "claude-opus-4.6", name: "Claude Opus 4.6", provider: "Anthropic", logo: "https://img.icons8.com/fluency/48/claude-ai.png", logoFilter: "" },
  { id: "gemini-3-pro", name: "Gemini 3 Pro", provider: "Google", logo: "https://img.icons8.com/color/48/google-logo.png", logoFilter: "" },
];

function AdminModelLogo({ modelId, size = 20 }: { modelId: string; size?: number }) {
  const model = adminModels.find(m => m.id === modelId);
  if (!model) {
    return (
      <div className="bg-violet-600/10 rounded-lg flex items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-violet-400 font-bold" style={{ fontSize: size * 0.4 }}>R</span>
      </div>
    );
  }
  return <img src={model.logo} alt={model.name} width={size} height={size} style={{ filter: model.logoFilter || "none" }} />;
}

function getDefaultHours(): UptimeStatus[] {
  return Array.from({ length: 90 }, () => "operational" as UptimeStatus);
}

type GodModeType = "auto" | "manual" | "admin";

interface GodMessage {
  id: string;
  role: "user" | "assistant" | "admin";
  content: string;
  model: string;
  timestamp: number;
  imageUrl?: string;
}

interface GodChat {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  lastMessage: number;
  messageCount: number;
  folderId?: string;
}

interface GodFolder {
  id: string;
  name: string;
  collapsed?: boolean;
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(() => {
    return typeof window !== "undefined" && localStorage.getItem("relay_admin") === "true";
  });
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [users, setUsers] = useState<UserData[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    maintenance: false,
    maintenanceMessage: "Мы проводим плановые технические работы для улучшения сервиса.",
    maintenanceEstimate: "2 часа",
    registrationEnabled: true,
    freeRequestsLimit: 5,
    announcement: "",
  });
  const [activeTab, setActiveTab] = useState<"dashboard" | "users" | "settings" | "uptime" | "models">("dashboard");
  const [stats, setStats] = useState({ totalUsers: 0, totalChats: 0, totalMessages: 0, totalVisits: 0, newUsersToday: 0, newChatsToday: 0, newMessagesToday: 0 });
  const [searchUser, setSearchUser] = useState("");
  const [saved, setSaved] = useState(false);
  const [componentUptimes, setComponentUptimes] = useState<ComponentUptime[]>(
    UPTIME_COMPONENTS.map(c => ({ ...c, hours: getDefaultHours() }))
  );
  const [selectedHour, setSelectedHour] = useState<{ compIdx: number; hourIdx: number } | null>(null);

  // Model enable/disable — store as simple object
  const [disabledModels, setDisabledModels] = useState<Record<string, boolean>>({});

  // God Mode states
  const [godMode, setGodMode] = useState(false);
  const [godSelectedUser, setGodSelectedUser] = useState<UserData | null>(null);
  const [godChats, setGodChats] = useState<GodChat[]>([]);
  const [godFolders, setGodFolders] = useState<GodFolder[]>([]);
  const [godSelectedChat, setGodSelectedChat] = useState<GodChat | null>(null);
  const [godMessages, setGodMessages] = useState<GodMessage[]>([]);
  const [godInput, setGodInput] = useState("");
  const [godResponseMode, setGodResponseMode] = useState<GodModeType>("auto");
  const [godCollapsedFolders, setGodCollapsedFolders] = useState<Set<string>>(new Set());
  const [godImageFile, setGodImageFile] = useState<File | null>(null);
  const [godImagePreview, setGodImagePreview] = useState<string | null>(null);
  const [godUploadingImage, setGodUploadingImage] = useState(false);
  const godMessagesEndRef = useRef<HTMLDivElement>(null);
  const godFileInputRef = useRef<HTMLInputElement>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "4321") {
      setAuthenticated(true);
      setError("");
      localStorage.setItem("relay_admin", "true");
    } else setError("Неверный пароль");
  };

  // ========================
  // DISABLED MODELS — FIXED
  // ========================
  useEffect(() => {
    if (!authenticated) return;
    const dbRef = ref(db, "disabledModels");
    const unsub = onValue(dbRef, (snapshot) => {
      const val = snapshot.val();
      if (val && typeof val === "object") {
        setDisabledModels(val as Record<string, boolean>);
      } else {
        setDisabledModels({});
      }
    });
    return () => unsub();
  }, [authenticated]);

  // Simple, direct toggle — write directly to Firebase
  const handleToggleModel = async (modelId: string) => {
    const isCurrentlyDisabled = !!disabledModels[modelId];
    const modelRef = ref(db, "disabledModels/" + modelId);
    
    try {
      if (isCurrentlyDisabled) {
        // Enable: remove the key
        await remove(modelRef);
      } else {
        // Disable: set to true
        await set(modelRef, true);
      }
    } catch (err) {
      console.error("Toggle model error:", err);
      alert("Ошибка Firebase. Проверьте подключение.");
    }
  };

  // Load users
  useEffect(() => {
    if (!authenticated) return;
    const unsub = onValue(ref(db, "users"), (snap) => {
      const data = snap.val();
      if (data) {
        const list: UserData[] = Object.entries(data).map(([uid, val]) => {
          const v = val as Record<string, unknown>;
          return {
            uid, displayName: (v.displayName as string) || "Без имени", email: (v.email as string) || "—",
            plan: (v.plan as string) || "free", role: (v.role as string) || "user",
            lastLogin: (v.lastLogin as number) || 0, createdAt: (v.createdAt as number) || 0,
            banned: (v.banned as boolean) || false, visibleNick: (v.visibleNick as string) || "",
          };
        });
        setUsers(list);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const todayMs = today.getTime();
        const newToday = list.filter(u => u.createdAt >= todayMs).length;
        setStats(prev => ({ ...prev, totalUsers: list.length, newUsersToday: newToday }));
      }
    });
    return () => unsub();
  }, [authenticated]);

  // Load settings
  useEffect(() => {
    if (!authenticated) return;
    const unsub = onValue(ref(db, "settings"), (snap) => {
      const data = snap.val();
      if (data) setSettings(prev => ({ ...prev, ...data }));
    });
    return () => unsub();
  }, [authenticated]);

  // Load chats stats
  useEffect(() => {
    if (!authenticated) return;
    const unsub = onValue(ref(db, "chats"), (snap) => {
      const data = snap.val();
      if (data) {
        let total = 0; let newToday = 0;
        const today = new Date(); today.setHours(0, 0, 0, 0); const todayMs = today.getTime();
        Object.values(data).forEach((uc) => {
          const userChats = uc as Record<string, any>;
          Object.values(userChats).forEach((chat: any) => { total++; if (chat.createdAt >= todayMs) newToday++; });
        });
        setStats(prev => ({ ...prev, totalChats: total, newChatsToday: newToday }));
      }
    });
    return () => unsub();
  }, [authenticated]);

  // Load messages stats
  useEffect(() => {
    if (!authenticated) return;
    const unsub = onValue(ref(db, "messages"), (snap) => {
      const data = snap.val();
      if (data) {
        let total = 0; let newToday = 0;
        const today = new Date(); today.setHours(0, 0, 0, 0); const todayMs = today.getTime();
        Object.values(data).forEach((userChats) => {
          Object.values(userChats as Record<string, unknown>).forEach((chatMsgs) => {
            Object.values(chatMsgs as Record<string, unknown>).forEach((msg) => {
              total++; const m = msg as Record<string, unknown>;
              if ((m.timestamp as number) >= todayMs) newToday++;
            });
          });
        });
        setStats(prev => ({ ...prev, totalMessages: total, newMessagesToday: newToday }));
      }
    });
    return () => unsub();
  }, [authenticated]);

  // Load visits
  useEffect(() => {
    if (!authenticated) return;
    const visitRef = ref(db, `visits/${Date.now()}`);
    set(visitRef, { timestamp: Date.now() });
    const unsub = onValue(ref(db, "visits"), (snap) => {
      const data = snap.val();
      if (data) setStats(prev => ({ ...prev, totalVisits: Object.keys(data).length }));
    });
    return () => unsub();
  }, [authenticated]);

  // Load uptime
  useEffect(() => {
    if (!authenticated) return;
    const unsub = onValue(ref(db, "uptime"), (snap) => {
      const data = snap.val();
      if (data) {
        const loaded = UPTIME_COMPONENTS.map(c => {
          const hours = data[c.key] ? (data[c.key] as UptimeStatus[]) : getDefaultHours();
          return { ...c, hours: Array.from({ length: 90 }, (_, i) => hours[i] || "operational") as UptimeStatus[] };
        });
        setComponentUptimes(loaded);
      }
    });
    return () => unsub();
  }, [authenticated]);

  // ========================
  // GOD MODE — FIXED PERSISTENCE
  // ========================
  
  // Load user's chats when user is selected
  useEffect(() => {
    if (!godSelectedUser) { setGodChats([]); setGodFolders([]); return; }
    const unsubChats = onValue(ref(db, `chats/${godSelectedUser.uid}`), (snap) => {
      const data = snap.val();
      if (data) {
        const list: GodChat[] = Object.entries(data).map(([id, val]: [string, any]) => ({
          id, title: val.title || "Новый чат", model: val.model || "gpt-5.2-codex",
          createdAt: val.createdAt || 0, lastMessage: val.lastMessage || 0,
          messageCount: val.messageCount || 0, folderId: val.folderId || undefined,
        }));
        setGodChats(list.sort((a, b) => b.lastMessage - a.lastMessage));
      } else setGodChats([]);
    });
    const unsubFolders = onValue(ref(db, `folders/${godSelectedUser.uid}`), (snap) => {
      const data = snap.val();
      if (data) {
        const list: GodFolder[] = Object.entries(data).map(([id, val]: [string, any]) => ({
          id, name: val.name || "Папка", collapsed: val.collapsed || false,
        }));
        setGodFolders(list);
      } else setGodFolders([]);
    });
    return () => { unsubChats(); unsubFolders(); };
  }, [godSelectedUser]);

  // Load chat messages
  useEffect(() => {
    if (!godSelectedUser || !godSelectedChat) { setGodMessages([]); return; }
    const unsub = onValue(ref(db, `messages/${godSelectedUser.uid}/${godSelectedChat.id}`), (snap) => {
      const data = snap.val();
      if (data) {
        const msgs: GodMessage[] = Object.entries(data).map(([id, val]: [string, any]) => ({
          id, role: val.role || "user", content: val.content || "", model: val.model || "",
          timestamp: val.timestamp || 0, imageUrl: val.imageUrl || undefined,
        })).sort((a, b) => a.timestamp - b.timestamp);
        setGodMessages(msgs);
      } else setGodMessages([]);
    });
    return () => unsub();
  }, [godSelectedUser, godSelectedChat]);

  // Load saved god mode from Firebase when entering a chat
  useEffect(() => {
    if (!godSelectedUser || !godSelectedChat) return;
    const godRef = ref(db, `godmode/${godSelectedUser.uid}/${godSelectedChat.id}/mode`);
    // Read the saved mode
    get(godRef).then((snap) => {
      const mode = snap.val();
      if (mode && (mode === "auto" || mode === "manual" || mode === "admin")) {
        setGodResponseMode(mode);
      } else {
        setGodResponseMode("auto");
      }
    });
    // Also listen live
    const parentRef = ref(db, `godmode/${godSelectedUser.uid}/${godSelectedChat.id}`);
    const unsub = onValue(parentRef, (snap) => {
      const data = snap.val();
      if (data && data.mode) {
        setGodResponseMode(data.mode as GodModeType);
      }
    });
    return () => unsub();
  }, [godSelectedUser, godSelectedChat]);

  // Change god mode AND persist to Firebase
  const changeGodMode = async (newMode: GodModeType) => {
    setGodResponseMode(newMode);
    if (godSelectedUser && godSelectedChat) {
      const godRef = ref(db, `godmode/${godSelectedUser.uid}/${godSelectedChat.id}`);
      await set(godRef, { mode: newMode, timestamp: Date.now() });
    }
  };

  useEffect(() => { godMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [godMessages]);

  const saveSettings = async () => {
    await set(ref(db, "settings"), settings);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const toggleMaintenance = async () => {
    const newSettings = { ...settings, maintenance: !settings.maintenance };
    setSettings(newSettings);
    await set(ref(db, "settings"), newSettings);
  };

  const toggleBan = async (uid: string, banned: boolean) => { await update(ref(db, `users/${uid}`), { banned: !banned }); };
  const deleteUser = async (uid: string) => {
    if (!confirm("Удалить пользователя?")) return;
    await remove(ref(db, `users/${uid}`)); await remove(ref(db, `chats/${uid}`));
    await remove(ref(db, `messages/${uid}`)); await remove(ref(db, `folders/${uid}`)); await remove(ref(db, `godmode/${uid}`));
  };
  const changePlan = async (uid: string, plan: string) => { await update(ref(db, `users/${uid}`), { plan }); };

  const handleHourClick = (compIdx: number, hourIdx: number) => {
    if (selectedHour && selectedHour.compIdx === compIdx && selectedHour.hourIdx === hourIdx) setSelectedHour(null);
    else setSelectedHour({ compIdx, hourIdx });
  };

  const setHourStatus = async (status: UptimeStatus) => {
    if (!selectedHour) return;
    const updated = [...componentUptimes];
    updated[selectedHour.compIdx].hours[selectedHour.hourIdx] = status;
    setComponentUptimes(updated);
    await set(ref(db, `uptime/${updated[selectedHour.compIdx].key}`), updated[selectedHour.compIdx].hours);
    setSelectedHour(null);
  };

  const getUptimePercent = (hours: UptimeStatus[]) => {
    const good = hours.filter(h => h === "operational").length;
    return ((good / hours.length) * 100).toFixed(1);
  };

  const getCurrentStatus = (hours: UptimeStatus[]): UptimeStatus => hours[hours.length - 1];

  const handleGodFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return;
    setGodImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setGodImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    if (e.target) e.target.value = "";
  };

  const clearGodImage = () => {
    setGodImageFile(null);
    setGodImagePreview(null);
  };

  const uploadGodImage = async (file: File): Promise<string> => {
    const timestamp = Date.now();
    const fileName = `god-images/${timestamp}_${file.name}`;
    const sRef = storageRef(storage, fileName);
    await uploadBytes(sRef, file);
    return getDownloadURL(sRef);
  };

  const godSendMessage = async () => {
    if ((!godInput.trim() && !godImageFile) || !godSelectedUser || !godSelectedChat) return;
    const text = godInput.trim(); setGodInput("");

    let imageUrl: string | undefined;
    if (godImageFile) {
      setGodUploadingImage(true);
      try {
        imageUrl = await uploadGodImage(godImageFile);
      } catch (err) {
        console.error("God mode image upload failed:", err);
      }
      setGodUploadingImage(false);
      clearGodImage();
    }

    const msgsRef = ref(db, `messages/${godSelectedUser.uid}/${godSelectedChat.id}`);
    const chatRef = ref(db, `chats/${godSelectedUser.uid}/${godSelectedChat.id}`);
    const msgData: Record<string, any> = { timestamp: Date.now() };
    if (text) msgData.content = text;
    if (imageUrl) msgData.imageUrl = imageUrl;

    if (godResponseMode === "manual") {
      msgData.role = "assistant";
      msgData.model = godSelectedChat.model;
      await push(msgsRef, msgData);
    } else if (godResponseMode === "admin") {
      msgData.role = "admin";
      msgData.model = "admin";
      await push(msgsRef, msgData);
    }
    await update(chatRef, { lastMessage: Date.now(), messageCount: (godSelectedChat.messageCount || 0) + 1 });
  };

  const godExitChat = () => {
    // Don't delete godmode data — mode persists
    setGodSelectedChat(null);
    setGodMessages([]);
  };

  const godExitUser = () => {
    setGodSelectedUser(null);
    setGodSelectedChat(null);
    setGodMessages([]);
    setGodChats([]);
    setGodFolders([]);
  };

  const godExitMode = () => {
    setGodMode(false);
    setGodSelectedUser(null);
    setGodSelectedChat(null);
    setGodMessages([]);
    setGodChats([]);
    setGodFolders([]);
    setGodResponseMode("auto");
  };

  const filteredUsers = users.filter(u =>
    u.displayName.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.email.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.uid.toLowerCase().includes(searchUser.toLowerCase())
  );

  const getModelName = (modelId: string) => {
    const m = adminModels.find(am => am.id === modelId);
    return m ? m.name : modelId;
  };

  // ========================
  // LOGIN SCREEN
  // ========================
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#050507] text-zinc-100 flex items-center justify-center px-6">
        <div className="w-full max-w-xs">
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors mb-10">
            <ArrowLeft className="w-3.5 h-3.5" /> На главную
          </Link>
          <div className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <Lock className="w-4 h-4 text-violet-400" />
              <h1 className="font-semibold text-sm">Админ панель</h1>
            </div>
            <form onSubmit={handleLogin} className="space-y-3">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40" autoFocus />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button type="submit" className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors">Войти</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ========================
  // GOD MODE UI
  // ========================
  if (godMode) {
    return (
      <div className="h-screen bg-[#050507] text-zinc-100 flex flex-col overflow-hidden">
        <div className="border-b border-white/[0.04] bg-[#050507]/80 backdrop-blur-xl shrink-0">
          <div className="max-w-full mx-auto px-4 h-12 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={godExitMode} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                <Back className="w-3.5 h-3.5" /> Выход
              </button>
              <span className="text-white/[0.08]">|</span>
              <div className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs font-medium text-red-400">Режим бога</span>
              </div>
              {godSelectedUser && (
                <><span className="text-white/[0.08]">|</span><span className="text-xs text-zinc-500">{godSelectedUser.visibleNick || godSelectedUser.displayName}</span></>
              )}
              {godSelectedChat && (
                <><span className="text-white/[0.08]">→</span><span className="text-xs text-zinc-400">{godSelectedChat.title}</span></>
              )}
            </div>
            {godSelectedChat && (
              <div className="flex items-center gap-1 bg-white/[0.02] border border-white/[0.06] rounded-xl p-0.5">
                {([
                  { mode: "auto" as GodModeType, label: "Авто", icon: Bot, desc: "ИИ отвечает сам" },
                  { mode: "manual" as GodModeType, label: "Ручной", icon: Send, desc: "Вы пишете как ИИ" },
                  { mode: "admin" as GodModeType, label: "Админ", icon: Shield, desc: "Вы пишете как админ" },
                ]).map((m) => (
                  <button key={m.mode} onClick={() => changeGodMode(m.mode)} title={m.desc}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 ${
                      godResponseMode === m.mode
                        ? m.mode === "auto" ? "bg-emerald-500/10 text-emerald-400" : m.mode === "manual" ? "bg-violet-500/10 text-violet-400" : "bg-red-500/10 text-red-400"
                        : "text-zinc-600 hover:text-zinc-400"
                    }`}>
                    <m.icon className="w-3 h-3" /> {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Select user */}
          {!godSelectedUser && (
            <div className="flex-1 overflow-y-auto p-6">
              <h2 className="text-sm font-medium mb-4">Выберите пользователя</h2>
              <div className="relative max-w-sm mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                <input type="text" value={searchUser} onChange={(e) => setSearchUser(e.target.value)} placeholder="Поиск..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {filteredUsers.map((u) => (
                  <button key={u.uid} onClick={() => { setGodSelectedUser(u); setGodSelectedChat(null); }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.04] hover:border-violet-500/20 bg-white/[0.01] hover:bg-white/[0.02] transition-all duration-200 text-left">
                    <div className="w-8 h-8 rounded-lg bg-violet-600/10 flex items-center justify-center text-xs font-medium text-violet-400 shrink-0">
                      {(u.visibleNick || u.displayName)[0]?.toUpperCase() || "U"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{u.visibleNick || u.displayName}</p>
                      <p className="text-[10px] text-zinc-700 truncate">{u.email}</p>
                    </div>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${u.banned ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                      {u.banned ? "Бан" : u.plan}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Select chat */}
          {godSelectedUser && !godSelectedChat && (
            <div className="flex-1 overflow-y-auto p-6">
              <button onClick={godExitUser} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-4">
                <Back className="w-3 h-3" /> Назад к пользователям
              </button>
              <h2 className="text-sm font-medium mb-1">Чаты пользователя {godSelectedUser.visibleNick || godSelectedUser.displayName}</h2>
              <p className="text-xs text-zinc-600 mb-4">{godChats.length} чатов</p>
              {godChats.length === 0 && <div className="text-center py-16 text-xs text-zinc-700">Нет чатов</div>}
              {godFolders.map((folder) => {
                const folderChats = godChats.filter(c => c.folderId === folder.id);
                const isCollapsed = godCollapsedFolders.has(folder.id);
                return (
                  <div key={folder.id} className="mb-2">
                    <button onClick={() => { const next = new Set(godCollapsedFolders); isCollapsed ? next.delete(folder.id) : next.add(folder.id); setGodCollapsedFolders(next); }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 w-full text-left transition-colors">
                      <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${!isCollapsed ? "rotate-90" : ""}`} />
                      <Folder className="w-3.5 h-3.5 text-violet-400/60" />
                      <span className="font-medium">{folder.name}</span>
                      <span className="text-[10px] text-zinc-700 ml-auto">{folderChats.length}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="pl-6 space-y-1 mt-1">
                        {folderChats.map((chat) => (
                          <button key={chat.id} onClick={() => setGodSelectedChat(chat)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left border border-white/[0.04] hover:border-violet-500/20 bg-white/[0.01] hover:bg-white/[0.02] transition-all duration-200">
                            <MessageSquare className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{chat.title}</p>
                              <p className="text-[10px] text-zinc-700">{getModelName(chat.model)} · {chat.messageCount} сообщ.</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="space-y-1 mt-2">
                {godChats.filter(c => !c.folderId).map((chat) => (
                  <button key={chat.id} onClick={() => setGodSelectedChat(chat)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left border border-white/[0.04] hover:border-violet-500/20 bg-white/[0.01] hover:bg-white/[0.02] transition-all duration-200">
                    <MessageSquare className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{chat.title}</p>
                      <p className="text-[10px] text-zinc-700">{getModelName(chat.model)} · {chat.messageCount} сообщ.</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat view */}
          {godSelectedUser && godSelectedChat && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-2 border-b border-white/[0.04] flex items-center gap-3 shrink-0">
                <button onClick={godExitChat} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                  <Back className="w-3 h-3" /> Чаты
                </button>
                <span className="text-white/[0.06]">|</span>
                <span className="text-xs font-medium">{godSelectedChat.title}</span>
                <span className="text-[10px] text-zinc-600">{getModelName(godSelectedChat.model)}</span>
                <div className="ml-auto flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium ${
                    godResponseMode === "auto" ? "bg-emerald-500/10 text-emerald-400" :
                    godResponseMode === "manual" ? "bg-violet-500/10 text-violet-400" : "bg-red-500/10 text-red-400"
                  }`}>
                    <Radio className="w-2.5 h-2.5" />
                    {godResponseMode === "auto" ? "ИИ отвечает" : godResponseMode === "manual" ? "Вы = ИИ" : "Вы = Админ"}
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="max-w-2xl mx-auto space-y-4">
                  {godMessages.map((msg) => (
                    <div key={msg.id} className={`${msg.role === "user" ? "flex justify-end" : ""}`}>
                      {msg.role === "user" ? (
                        <div className="max-w-[80%]">
                          {msg.imageUrl && (
                            <div className="mb-2 flex justify-end">
                              <img src={msg.imageUrl} alt="User" className="max-w-[300px] max-h-[300px] rounded-xl object-cover border border-white/[0.06]" />
                            </div>
                          )}
                          {msg.content && (
                            <div className="bg-violet-600/15 text-zinc-100 px-4 py-3 rounded-2xl rounded-br-md text-sm leading-relaxed">
                              <span className="whitespace-pre-wrap">{msg.content}</span>
                              <div className="text-[9px] text-zinc-500 mt-1">
                                {new Date(msg.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : msg.role === "admin" ? (
                        <div className="max-w-[80%]">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-5 h-5 rounded-md bg-red-600/10 flex items-center justify-center">
                              <Shield className="w-3 h-3 text-red-400" />
                            </div>
                            <span className="text-[11px] font-medium text-red-400">Администратор</span>
                          </div>
                          {msg.imageUrl && (
                            <div className="mb-2">
                              <img src={msg.imageUrl} alt="Admin" className="max-w-[300px] max-h-[300px] rounded-xl object-cover border border-red-500/10" />
                            </div>
                          )}
                          <div className="bg-red-600/5 border border-red-500/10 text-zinc-300 px-4 py-3 rounded-2xl rounded-tl-md text-sm leading-relaxed">
                            <MarkdownRenderer content={msg.content} />
                            <div className="text-[9px] text-zinc-500 mt-1">
                              {new Date(msg.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="max-w-[80%]">
                          <div className="flex items-center gap-2 mb-1.5">
                            <AdminModelLogo modelId={msg.model} size={18} />
                            <span className="text-[11px] font-medium text-zinc-400">{getModelName(msg.model)}</span>
                          </div>
                          {msg.imageUrl && (
                            <div className="mb-2">
                              <img src={msg.imageUrl} alt="AI" className="max-w-[300px] max-h-[300px] rounded-xl object-cover border border-white/[0.06]" />
                            </div>
                          )}
                          <div className="text-zinc-300 text-sm leading-relaxed">
                            <MarkdownRenderer content={msg.content} />
                            <div className="text-[9px] text-zinc-500 mt-1">
                              {new Date(msg.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={godMessagesEndRef} />
                </div>
              </div>
              {godResponseMode !== "auto" ? (
                <div className="p-4 border-t border-white/[0.04] shrink-0">
                  <input ref={godFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleGodFileSelect} />
                  <div className="max-w-2xl mx-auto">
                    {godImagePreview && (
                      <div className="mb-2 flex items-start gap-2">
                        <div className="relative">
                          <img src={godImagePreview} alt="Preview" className="w-16 h-16 rounded-xl object-cover border border-white/[0.06]" />
                          <button onClick={clearGodImage}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 border border-white/[0.1] rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-red-600 transition-all">
                            <XIcon className="w-3 h-3" />
                          </button>
                        </div>
                        {godUploadingImage && <span className="text-[10px] text-zinc-500 py-2">Загрузка...</span>}
                      </div>
                    )}
                    <div className={`flex items-end gap-2 border rounded-2xl px-4 py-3 transition-all duration-200 ${
                      godResponseMode === "manual" ? "border-violet-500/20 bg-violet-600/5" : "border-red-500/20 bg-red-600/5"
                    }`}>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {godResponseMode === "manual" ? <Bot className="w-3.5 h-3.5 text-violet-400" /> : <Shield className="w-3.5 h-3.5 text-red-400" />}
                      </div>
                      <button onClick={() => godFileInputRef.current?.click()}
                        className={`p-1.5 rounded-lg shrink-0 transition-all duration-200 ${
                          godResponseMode === "manual" ? "text-violet-400/60 hover:text-violet-400 hover:bg-violet-600/10" : "text-red-400/60 hover:text-red-400 hover:bg-red-600/10"
                        }`} title="Прикрепить изображение">
                        <ImagePlus className="w-4 h-4" />
                      </button>
                      <textarea value={godInput} onChange={(e) => setGodInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); godSendMessage(); } }}
                        placeholder={godResponseMode === "manual" ? `Написать от имени ${getModelName(godSelectedChat.model)}...` : "Написать от имени администратора..."}
                        rows={1} className="flex-1 bg-transparent text-sm placeholder-zinc-700 focus:outline-none resize-none max-h-32 min-h-[20px]"
                        style={{ height: "20px" }}
                        onInput={(e) => { const el = e.target as HTMLTextAreaElement; el.style.height = "20px"; el.style.height = Math.min(el.scrollHeight, 128) + "px"; }} />
                      <button onClick={godSendMessage} disabled={!godInput.trim() && !godImageFile}
                        className={`p-2 rounded-xl transition-all duration-200 disabled:opacity-30 ${
                          godResponseMode === "manual" ? "text-violet-400 hover:bg-violet-600/10" : "text-red-400 hover:bg-red-600/10"
                        }`}><Send className="w-4 h-4" /></button>
                    </div>
                    <p className="text-center text-[10px] mt-2 text-zinc-700">
                      {godResponseMode === "manual" ? "Сообщение будет отправлено от имени ИИ модели. Пользователь не узнает." : "Сообщение будет отправлено от имени администратора."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 border-t border-white/[0.04] shrink-0">
                  <div className="max-w-2xl mx-auto text-center">
                    <p className="text-xs text-zinc-600">Режим наблюдения — ИИ отвечает автоматически</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========================
  // MAIN ADMIN PANEL
  // ========================
  const tabs = [
    { id: "dashboard" as const, label: "Обзор" },
    { id: "users" as const, label: "Пользователи" },
    { id: "uptime" as const, label: "Uptime" },
    { id: "settings" as const, label: "Настройки" },
    { id: "models" as const, label: "Модели" },
  ];

  return (
    <div className="min-h-screen bg-[#050507] text-zinc-100">
      <div className="border-b border-white/[0.04] sticky top-0 z-40 bg-[#050507]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-6 h-6 bg-violet-600 rounded-md flex items-center justify-center">
                <span className="text-white font-bold text-[10px]">R</span>
              </div>
            </Link>
            <span className="text-white/[0.08]">|</span>
            <span className="text-xs text-zinc-500 font-medium">Администрирование</span>
          </div>
          <button onClick={() => { setAuthenticated(false); localStorage.removeItem("relay_admin"); }} className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors">Выйти</button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex gap-1 mb-8 border-b border-white/[0.04]">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === t.id ? "text-violet-400 border-violet-500" : "text-zinc-600 border-transparent hover:text-zinc-400"
              }`}>{t.label}</button>
          ))}
        </div>

        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Посещений", value: stats.totalVisits, icon: TrendingUp, change: null },
                { label: "Пользователей", value: stats.totalUsers, icon: Users, change: stats.newUsersToday },
                { label: "Сообщений", value: stats.totalMessages, icon: MessageCircle, change: stats.newMessagesToday },
                { label: "Чатов", value: stats.totalChats, icon: FolderOpen, change: stats.newChatsToday },
              ].map((s) => (
                <div key={s.label} className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <s.icon className="w-4 h-4 text-violet-400" />
                    {s.change !== null && s.change > 0 && (
                      <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">+{s.change} сегодня</span>
                    )}
                  </div>
                  <div className="text-2xl font-bold mb-0.5">{s.value}</div>
                  <div className="text-xs text-zinc-600">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-5">
                <h3 className="text-sm font-medium mb-4">Последние пользователи</h3>
                <div className="space-y-2">
                  {users.slice(0, 5).map((u) => (
                    <div key={u.uid} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-violet-600/10 flex items-center justify-center text-[10px] font-medium text-violet-400 shrink-0">
                          {(u.visibleNick || u.displayName)[0]?.toUpperCase() || "U"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{u.visibleNick || u.displayName}</p>
                          <p className="text-[10px] text-zinc-700 truncate">{u.email}</p>
                        </div>
                      </div>
                      <span className="text-[10px] text-zinc-600 font-medium uppercase">{u.plan}</span>
                    </div>
                  ))}
                  {users.length === 0 && <p className="text-xs text-zinc-700 py-4 text-center">Нет данных</p>}
                </div>
              </div>
              <div className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-5">
                <h3 className="text-sm font-medium mb-4">Быстрые действия</h3>
                <div className="space-y-2">
                  <button onClick={toggleMaintenance}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-all text-left text-sm">
                    <span>{settings.maintenance ? "Выключить тех. работы" : "Включить тех. работы"}</span>
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${settings.maintenance ? "bg-yellow-500/10 text-yellow-500" : "bg-zinc-800 text-zinc-500"}`}>
                      {settings.maintenance ? "Вкл" : "Выкл"}
                    </span>
                  </button>
                  <button onClick={() => setActiveTab("users")}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-all text-left text-sm">
                    <span>Управление пользователями</span><span className="text-xs text-zinc-600">{users.length}</span>
                  </button>
                  <button onClick={() => setActiveTab("models")}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-all text-left text-sm">
                    <span>Управление моделями</span><span className="text-xs text-zinc-600">{adminModels.length}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "users" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                <input type="text" value={searchUser} onChange={(e) => setSearchUser(e.target.value)} placeholder="Поиск..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40" />
              </div>
              <span className="text-xs text-zinc-600">{filteredUsers.length} найдено</span>
              <div className="ml-auto">
                <button onClick={() => setGodMode(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/20 bg-red-600/5 text-red-400 text-xs font-medium hover:bg-red-600/10 hover:border-red-500/30 transition-all duration-200">
                  <Eye className="w-3.5 h-3.5" /> Режим бога
                </button>
              </div>
            </div>
            <div className="border border-white/[0.04] rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    {["Пользователь", "Email", "Тариф", "Статус", ""].map((h) => (
                      <th key={h} className="text-left text-[10px] text-zinc-600 font-medium px-4 py-3 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.uid} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-xs font-medium">{u.visibleNick || u.displayName}</p>
                        <p className="text-[10px] text-zinc-700 font-mono">{u.uid.substring(0, 12)}…</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{u.email}</td>
                      <td className="px-4 py-3">
                        <div className="relative inline-block">
                          <select value={u.plan} onChange={(e) => changePlan(u.uid, e.target.value)}
                            className="appearance-none pl-2 pr-6 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[11px] text-zinc-300 focus:outline-none cursor-pointer">
                            <option value="free">Free</option>
                            <option value="pro">Pro</option>
                            <option value="ultra">Ultra</option>
                          </select>
                          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-zinc-600 pointer-events-none" />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-medium ${u.banned ? "text-red-400" : "text-emerald-500"}`}>
                          {u.banned ? "Заблокирован" : "Активен"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => toggleBan(u.uid, u.banned || false)}
                            className="p-1.5 rounded-lg hover:bg-white/[0.03] text-zinc-600 hover:text-yellow-400 transition-colors" title={u.banned ? "Разбанить" : "Забанить"}>
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteUser(u.uid)}
                            className="p-1.5 rounded-lg hover:bg-white/[0.03] text-zinc-600 hover:text-red-400 transition-colors" title="Удалить">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredUsers.length === 0 && <div className="py-10 text-center text-xs text-zinc-700">Не найдено</div>}
            </div>
          </div>
        )}

        {activeTab === "uptime" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium mb-1">Управление Uptime</h3>
                <p className="text-xs text-zinc-600">Нажмите на полоску для изменения статуса часа</p>
              </div>
              <div className="flex items-center gap-4">
                {STATUS_OPTIONS.map(s => (
                  <div key={s} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-sm ${STATUS_COLORS[s]}`} />
                    <span className="text-[10px] text-zinc-500">{STATUS_LABELS[s]}</span>
                  </div>
                ))}
              </div>
            </div>
            {componentUptimes.map((comp, compIdx) => {
              const currentStatus = getCurrentStatus(comp.hours);
              return (
                <div key={comp.key} className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h4 className="text-sm font-medium">{comp.name}</h4>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[currentStatus]}`} />
                        <span className={`text-[11px] font-medium ${
                          currentStatus === "operational" ? "text-emerald-400" : currentStatus === "degraded" ? "text-yellow-400" :
                          currentStatus === "down" ? "text-red-400" : "text-zinc-400"
                        }`}>{STATUS_LABELS[currentStatus]}</span>
                      </div>
                    </div>
                    <span className="text-xs text-zinc-500">{getUptimePercent(comp.hours)}% uptime</span>
                  </div>
                  <div className="flex gap-[2px] mb-2 relative">
                    {comp.hours.map((status, hourIdx) => (
                      <button key={hourIdx} onClick={() => handleHourClick(compIdx, hourIdx)}
                        className={`flex-1 h-7 rounded-[2px] transition-all cursor-pointer hover:opacity-80 ${STATUS_COLORS[status]} ${
                          selectedHour?.compIdx === compIdx && selectedHour?.hourIdx === hourIdx
                            ? "ring-2 ring-white ring-offset-1 ring-offset-[#050507] opacity-100" : "opacity-40 hover:opacity-60"
                        }`} title={`Час ${90 - hourIdx}: ${STATUS_LABELS[status]}`} />
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-700 mb-3">
                    <span>90ч назад</span><span>Сейчас</span>
                  </div>
                  {selectedHour?.compIdx === compIdx && (
                    <div className="flex items-center gap-2 pt-3 border-t border-white/[0.04]">
                      <span className="text-xs text-zinc-500 mr-2">Час {90 - selectedHour.hourIdx}:</span>
                      {STATUS_OPTIONS.map(s => (
                        <button key={s} onClick={() => setHourStatus(s)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                            comp.hours[selectedHour.hourIdx] === s
                              ? "border-violet-500/30 bg-violet-600/10 text-violet-300"
                              : "border-white/[0.04] text-zinc-500 hover:border-white/[0.08] hover:text-zinc-300"
                          }`}>
                          <span className={`w-2 h-2 rounded-sm ${STATUS_COLORS[s]}`} /> {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="max-w-lg space-y-6">
            <div className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-medium">Технические работы</h3>
              <button onClick={() => setSettings(p => ({ ...p, maintenance: !p.maintenance }))}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-all text-sm">
                <span>Режим тех. работ</span>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${settings.maintenance ? "bg-yellow-500/10 text-yellow-500" : "bg-zinc-800 text-zinc-500"}`}>
                  {settings.maintenance ? "Включено" : "Выключено"}
                </span>
              </button>
              <div>
                <label className="block text-xs text-zinc-600 mb-1.5">Сообщение</label>
                <textarea value={settings.maintenanceMessage} onChange={(e) => setSettings(p => ({ ...p, maintenanceMessage: e.target.value }))} rows={2}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40 resize-none" />
              </div>
              <div>
                <label className="block text-xs text-zinc-600 mb-1.5">Ожидаемое время</label>
                <input value={settings.maintenanceEstimate} onChange={(e) => setSettings(p => ({ ...p, maintenanceEstimate: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm focus:outline-none focus:border-violet-500/40" />
              </div>
            </div>
            <div className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-medium">Общие</h3>
              <button onClick={() => setSettings(p => ({ ...p, registrationEnabled: !p.registrationEnabled }))}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-all text-sm">
                <span>Регистрация</span>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${settings.registrationEnabled ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-400"}`}>
                  {settings.registrationEnabled ? "Открыта" : "Закрыта"}
                </span>
              </button>
              <div>
                <label className="block text-xs text-zinc-600 mb-1.5">Лимит запросов (Free)</label>
                <input type="number" value={settings.freeRequestsLimit} onChange={(e) => setSettings(p => ({ ...p, freeRequestsLimit: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm focus:outline-none focus:border-violet-500/40" />
              </div>
              <div>
                <label className="block text-xs text-zinc-600 mb-1.5">Объявление</label>
                <textarea value={settings.announcement} onChange={(e) => setSettings(p => ({ ...p, announcement: e.target.value }))} rows={2} placeholder="Пусто — скрыто"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40 resize-none" />
              </div>
            </div>
            <button onClick={saveSettings}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${
                saved ? "bg-emerald-600 text-white" : "bg-violet-600 text-white hover:bg-violet-500"
              }`}>
              {saved ? <><Check className="w-3.5 h-3.5" /> Сохранено</> : <><Save className="w-3.5 h-3.5" /> Сохранить</>}
            </button>
          </div>
        )}

        {/* ======================== */}
        {/* MODELS TAB — FIXED TOGGLE */}
        {/* ======================== */}
        {activeTab === "models" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-medium mb-1">Управление моделями</h3>
                <p className="text-xs text-zinc-600">Включайте и отключайте AI модели. Отключённые модели недоступны пользователям.</p>
              </div>
            </div>
            <div className="border border-white/[0.04] rounded-2xl overflow-hidden divide-y divide-white/[0.02]">
              {adminModels.map((m) => {
                const isDisabled = !!disabledModels[m.id];
                return (
                  <div key={m.id} className={`flex items-center justify-between px-5 py-4 transition-all duration-300 ${isDisabled ? "opacity-60" : "hover:bg-white/[0.01]"}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-opacity duration-300 ${isDisabled ? "opacity-30" : ""}`}>
                        <AdminModelLogo modelId={m.id} size={24} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{m.name}</p>
                        <p className="text-[11px] text-zinc-600">{m.provider}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${isDisabled ? "bg-red-500" : "bg-emerald-500"}`} />
                        <span className={`text-[11px] font-medium transition-colors duration-300 ${isDisabled ? "text-red-400" : "text-emerald-400"}`}>
                          {isDisabled ? "Отключена" : "Активна"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleModel(m.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all duration-200 cursor-pointer select-none ${
                          isDisabled
                            ? "border-emerald-500/20 text-emerald-400 hover:bg-emerald-600/10 hover:border-emerald-500/30"
                            : "border-red-500/20 text-red-400 hover:bg-red-600/10 hover:border-red-500/30"
                        }`}>
                        {isDisabled ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                        {isDisabled ? "Включить" : "Отключить"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-4">
              <p className="text-xs text-zinc-500">
                <span className="font-medium text-zinc-400">Примечание:</span> При отключении модели все пользователи, которые её используют, будут автоматически переключены на первую доступную модель.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
