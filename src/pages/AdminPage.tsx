import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ref, onValue, set, remove, update, push, get } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import MarkdownRenderer from "../components/MarkdownRenderer";
import {
  Lock, Search, Ban, Trash2, ChevronDown, Save, Check, TrendingUp, Users, MessageCircle, FolderOpen,
  Eye, Send, ArrowLeft as Back, Radio, Bot, Shield, Folder, ChevronRight, MessageSquare,
  Power, PowerOff, ImagePlus, X as XIcon, TicketCheck, Clock
} from "lucide-react";

// Firebase paths can't contain ".", "#", "$", "[", or "]"
const sanitizeKey = (key: string) => key.replace(/\./g, "_");

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

interface TicketData {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  serialNumber: string;
  subject: string;
  status: "open" | "closed";
  createdAt: number;
  messages?: Record<string, { role: "user" | "admin"; content: string; timestamp: number }>;
}

const UPTIME_COMPONENTS = [
  { name: "API Gateway", key: "api_gateway" },
  { name: "AI Models Router", key: "ai_router" },
  { name: "Веб-приложение", key: "web_app" },
  { name: "База данных", key: "database" },
  { name: "Аутентификация", key: "auth" },
  { name: "CDN & Networking", key: "cdn" },
];

const STATUS_COLORS: Record<UptimeStatus, string> = { operational: "bg-emerald-500", degraded: "bg-yellow-500", down: "bg-red-500", maintenance: "bg-zinc-500" };
const STATUS_LABELS: Record<UptimeStatus, string> = { operational: "Работает", degraded: "Деградация", down: "Не работает", maintenance: "Тех. работы" };
const STATUS_OPTIONS: UptimeStatus[] = ["operational", "degraded", "down", "maintenance"];

const adminModels = [
  { id: "gpt-5.2-codex", name: "GPT-5.2 Codex", provider: "OpenAI", logo: "https://img.icons8.com/fluency-systems-regular/48/chatgpt.png", logoFilter: "invert(1) brightness(2)" },
  { id: "claude-opus-4.6", name: "Claude Opus 4.6", provider: "Anthropic", logo: "https://img.icons8.com/fluency/48/claude-ai.png", logoFilter: "" },
  { id: "gemini-3-pro", name: "Gemini 3 Pro", provider: "Google", logo: "https://img.icons8.com/color/48/google-logo.png", logoFilter: "" },
];

function AdminModelLogo({ modelId, size = 20 }: { modelId: string; size?: number }) {
  const model = adminModels.find(m => m.id === modelId);
  if (!model) return <div className="bg-violet-600/10 rounded-lg flex items-center justify-center" style={{ width: size, height: size }}><span className="text-violet-400 font-bold" style={{ fontSize: size * 0.4 }}>R</span></div>;
  return <img src={model.logo} alt={model.name} width={size} height={size} style={{ filter: model.logoFilter || "none" }} />;
}

function getDefaultHours(): UptimeStatus[] { return Array.from({ length: 90 }, () => "operational" as UptimeStatus); }

type GodModeType = "auto" | "manual" | "admin";

interface GodMessage { id: string; role: "user" | "assistant" | "admin"; content: string; model: string; timestamp: number; imageUrl?: string; }
interface GodChat { id: string; title: string; model: string; createdAt: number; lastMessage: number; messageCount: number; folderId?: string; }
interface GodFolder { id: string; name: string; collapsed?: boolean; }

export default function AdminPage() {
  const navigate = useNavigate();
  const [authenticated, setAuthenticated] = useState(() => typeof window !== "undefined" && localStorage.getItem("relay_admin") === "true");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [users, setUsers] = useState<UserData[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    maintenance: false, maintenanceMessage: "Мы проводим плановые технические работы.", maintenanceEstimate: "2 часа",
    registrationEnabled: true, freeRequestsLimit: 5, announcement: "",
  });
  const [activeTab, setActiveTab] = useState<"dashboard" | "users" | "settings" | "uptime" | "models" | "tickets">("dashboard");
  const [stats, setStats] = useState({ totalUsers: 0, totalChats: 0, totalMessages: 0, totalVisits: 0, newUsersToday: 0, newChatsToday: 0, newMessagesToday: 0 });
  const [searchUser, setSearchUser] = useState("");
  const [saved, setSaved] = useState(false);
  const [componentUptimes, setComponentUptimes] = useState<ComponentUptime[]>(UPTIME_COMPONENTS.map(c => ({ ...c, hours: getDefaultHours() })));
  const [selectedHour, setSelectedHour] = useState<{ compIdx: number; hourIdx: number } | null>(null);
  const [disabledModels, setDisabledModels] = useState<Record<string, boolean>>({});

  // Ban dialog
  const [banDialog, setBanDialog] = useState<{ uid: string; name: string } | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState("60");
  const [banPermanent, setBanPermanent] = useState(false);

  // God Mode
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

  // Tickets
  const [allTickets, setAllTickets] = useState<TicketData[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<TicketData | null>(null);
  const [ticketMessages, setTicketMessages] = useState<{ id: string; role: string; content: string; timestamp: number }[]>([]);
  const [ticketReply, setTicketReply] = useState("");
  const [ticketFilter, setTicketFilter] = useState<"all" | "open" | "closed">("all");
  const ticketEndRef = useRef<HTMLDivElement>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "4321") { setAuthenticated(true); setError(""); localStorage.setItem("relay_admin", "true"); }
    else setError("Неверный пароль");
  };

  // ========================
  // DISABLED MODELS — FIXED with sanitizeKey
  // ========================
  useEffect(() => {
    if (!authenticated) return;
    const unsub = onValue(ref(db, "disabledModels"), (snap) => {
      const val = snap.val();
      setDisabledModels(val && typeof val === "object" ? (val as Record<string, boolean>) : {});
    });
    return () => unsub();
  }, [authenticated]);

  const handleToggleModel = async (modelId: string) => {
    const key = sanitizeKey(modelId);
    const isCurrentlyDisabled = !!disabledModels[key];
    const modelRef = ref(db, `disabledModels/${key}`);
    try {
      if (isCurrentlyDisabled) await remove(modelRef);
      else await set(modelRef, true);
    } catch (err) {
      console.error("Toggle model error:", err);
      alert("Ошибка: " + (err instanceof Error ? err.message : "Неизвестная ошибка"));
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
          return { uid, displayName: (v.displayName as string) || "Без имени", email: (v.email as string) || "—",
            plan: (v.plan as string) || "free", role: (v.role as string) || "user",
            lastLogin: (v.lastLogin as number) || 0, createdAt: (v.createdAt as number) || 0,
            banned: (v.banned as boolean) || false, visibleNick: (v.visibleNick as string) || "" };
        });
        setUsers(list);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        setStats(prev => ({ ...prev, totalUsers: list.length, newUsersToday: list.filter(u => u.createdAt >= today.getTime()).length }));
      }
    });
    return () => unsub();
  }, [authenticated]);

  // Load settings
  useEffect(() => {
    if (!authenticated) return;
    const unsub = onValue(ref(db, "settings"), (snap) => { const data = snap.val(); if (data) setSettings(prev => ({ ...prev, ...data })); });
    return () => unsub();
  }, [authenticated]);

  // Load stats
  useEffect(() => {
    if (!authenticated) return;
    const unsub = onValue(ref(db, "chats"), (snap) => {
      const data = snap.val();
      if (data) {
        let total = 0, newToday = 0;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        Object.values(data).forEach((uc: any) => { Object.values(uc).forEach((c: any) => { total++; if (c.createdAt >= today.getTime()) newToday++; }); });
        setStats(prev => ({ ...prev, totalChats: total, newChatsToday: newToday }));
      }
    });
    return () => unsub();
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    const unsub = onValue(ref(db, "messages"), (snap) => {
      const data = snap.val();
      if (data) {
        let total = 0, newToday = 0;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        Object.values(data).forEach((uc: any) => { Object.values(uc).forEach((cm: any) => { Object.values(cm).forEach((m: any) => { total++; if (m.timestamp >= today.getTime()) newToday++; }); }); });
        setStats(prev => ({ ...prev, totalMessages: total, newMessagesToday: newToday }));
      }
    });
    return () => unsub();
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    set(ref(db, `visits/${Date.now()}`), { timestamp: Date.now() });
    const unsub = onValue(ref(db, "visits"), (snap) => { const data = snap.val(); if (data) setStats(prev => ({ ...prev, totalVisits: Object.keys(data).length })); });
    return () => unsub();
  }, [authenticated]);

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

  // Tickets
  useEffect(() => {
    if (!authenticated) return;
    const unsub = onValue(ref(db, "tickets"), (snap) => {
      const data = snap.val();
      if (data) {
        const list: TicketData[] = Object.entries(data).map(([id, v]: [string, any]) => ({ id, ...v })).sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
        setAllTickets(list);
      } else setAllTickets([]);
    });
    return () => unsub();
  }, [authenticated]);

  useEffect(() => {
    if (!selectedTicket) { setTicketMessages([]); return; }
    const unsub = onValue(ref(db, `tickets/${selectedTicket.id}/messages`), (snap) => {
      const data = snap.val();
      if (data) {
        const msgs = Object.entries(data).map(([id, v]: [string, any]) => ({ id, role: v.role, content: v.content, timestamp: v.timestamp })).sort((a, b) => a.timestamp - b.timestamp);
        setTicketMessages(msgs);
      } else setTicketMessages([]);
    });
    return () => unsub();
  }, [selectedTicket]);

  useEffect(() => { ticketEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [ticketMessages]);

  const sendAdminTicketReply = async () => {
    if (!selectedTicket || !ticketReply.trim()) return;
    await push(ref(db, `tickets/${selectedTicket.id}/messages`), { role: "admin", content: ticketReply.trim(), timestamp: Date.now() });
    setTicketReply("");
  };

  const changeTicketStatus = async (ticketId: string, status: "open" | "closed") => {
    await update(ref(db, `tickets/${ticketId}`), { status });
    if (selectedTicket && selectedTicket.id === ticketId) setSelectedTicket({ ...selectedTicket, status });
  };

  const deleteTicket = async (ticketId: string) => {
    await remove(ref(db, `tickets/${ticketId}`));
    if (selectedTicket && selectedTicket.id === ticketId) { setSelectedTicket(null); setTicketMessages([]); }
  };

  // ========================
  // GOD MODE
  // ========================
  useEffect(() => {
    if (!godSelectedUser) { setGodChats([]); setGodFolders([]); return; }
    const u1 = onValue(ref(db, `chats/${godSelectedUser.uid}`), (snap) => {
      const data = snap.val();
      if (data) { setGodChats(Object.entries(data).map(([id, v]: [string, any]) => ({ id, title: v.title || "Новый чат", model: v.model || "gpt-5.2-codex", createdAt: v.createdAt || 0, lastMessage: v.lastMessage || 0, messageCount: v.messageCount || 0, folderId: v.folderId || undefined })).sort((a, b) => b.lastMessage - a.lastMessage)); }
      else setGodChats([]);
    });
    const u2 = onValue(ref(db, `folders/${godSelectedUser.uid}`), (snap) => {
      const data = snap.val();
      if (data) { setGodFolders(Object.entries(data).map(([id, v]: [string, any]) => ({ id, name: v.name || "Папка", collapsed: v.collapsed || false }))); }
      else setGodFolders([]);
    });
    return () => { u1(); u2(); };
  }, [godSelectedUser]);

  useEffect(() => {
    if (!godSelectedUser || !godSelectedChat) { setGodMessages([]); return; }
    const unsub = onValue(ref(db, `messages/${godSelectedUser.uid}/${godSelectedChat.id}`), (snap) => {
      const data = snap.val();
      if (data) { setGodMessages(Object.entries(data).map(([id, v]: [string, any]) => ({ id, role: v.role || "user", content: v.content || "", model: v.model || "", timestamp: v.timestamp || 0, imageUrl: v.imageUrl || undefined })).sort((a, b) => a.timestamp - b.timestamp)); }
      else setGodMessages([]);
    });
    return () => unsub();
  }, [godSelectedUser, godSelectedChat]);

  useEffect(() => {
    if (!godSelectedUser || !godSelectedChat) return;
    get(ref(db, `godmode/${godSelectedUser.uid}/${godSelectedChat.id}/mode`)).then((snap) => {
      const mode = snap.val();
      if (mode && ["auto", "manual", "admin"].includes(mode)) setGodResponseMode(mode);
      else setGodResponseMode("auto");
    });
    const unsub = onValue(ref(db, `godmode/${godSelectedUser.uid}/${godSelectedChat.id}`), (snap) => {
      const data = snap.val();
      if (data && data.mode) setGodResponseMode(data.mode as GodModeType);
    });
    return () => unsub();
  }, [godSelectedUser, godSelectedChat]);

  const changeGodMode = async (newMode: GodModeType) => {
    setGodResponseMode(newMode);
    if (godSelectedUser && godSelectedChat) await set(ref(db, `godmode/${godSelectedUser.uid}/${godSelectedChat.id}`), { mode: newMode, timestamp: Date.now() });
  };

  useEffect(() => { godMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [godMessages]);

  const saveSettings = async () => { await set(ref(db, "settings"), settings); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const toggleMaintenance = async () => { const ns = { ...settings, maintenance: !settings.maintenance }; setSettings(ns); await set(ref(db, "settings"), ns); };

  // Ban functions
  const openBanDialog = (uid: string, name: string) => { setBanDialog({ uid, name }); setBanReason(""); setBanDuration("60"); setBanPermanent(false); };
  const confirmBan = async () => {
    if (!banDialog) return;
    const banData = { reason: banReason || "Нарушение правил", duration: banPermanent ? 0 : parseInt(banDuration) || 60, bannedAt: Date.now() };
    await set(ref(db, `bans/${banDialog.uid}`), banData);
    await update(ref(db, `users/${banDialog.uid}`), { banned: true });
    setBanDialog(null);
  };
  const unbanUser = async (uid: string) => {
    await remove(ref(db, `bans/${uid}`));
    await update(ref(db, `users/${uid}`), { banned: false });
  };

  const deleteUser = async (uid: string) => {
    if (!confirm("Удалить пользователя?")) return;
    await remove(ref(db, `users/${uid}`)); await remove(ref(db, `chats/${uid}`));
    await remove(ref(db, `messages/${uid}`)); await remove(ref(db, `folders/${uid}`)); await remove(ref(db, `godmode/${uid}`)); await remove(ref(db, `bans/${uid}`));
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
  const getUptimePercent = (hours: UptimeStatus[]) => ((hours.filter(h => h === "operational").length / hours.length) * 100).toFixed(1);
  const getCurrentStatus = (hours: UptimeStatus[]): UptimeStatus => hours[hours.length - 1];

  // God mode image
  const handleGodFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return;
    setGodImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setGodImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    if (e.target) e.target.value = "";
  };
  const clearGodImage = () => { setGodImageFile(null); setGodImagePreview(null); };
  const uploadGodImage = async (file: File): Promise<string> => {
    const sRef = storageRef(storage, `god-images/${Date.now()}_${file.name}`);
    await uploadBytes(sRef, file);
    return getDownloadURL(sRef);
  };

  const godSendMessage = async () => {
    if ((!godInput.trim() && !godImageFile) || !godSelectedUser || !godSelectedChat) return;
    const text = godInput.trim(); setGodInput("");
    let imageUrl: string | undefined;
    if (godImageFile) {
      setGodUploadingImage(true);
      try { imageUrl = await uploadGodImage(godImageFile); } catch (err) { console.error(err); }
      setGodUploadingImage(false);
      clearGodImage();
    }
    const msgsRef = ref(db, `messages/${godSelectedUser.uid}/${godSelectedChat.id}`);
    const chatRef = ref(db, `chats/${godSelectedUser.uid}/${godSelectedChat.id}`);
    const msgData: Record<string, any> = { timestamp: Date.now() };
    if (text) msgData.content = text;
    if (imageUrl) msgData.imageUrl = imageUrl;
    if (godResponseMode === "manual") { msgData.role = "assistant"; msgData.model = godSelectedChat.model; }
    else if (godResponseMode === "admin") { msgData.role = "admin"; msgData.model = "admin"; }
    await push(msgsRef, msgData);
    await update(chatRef, { lastMessage: Date.now(), messageCount: (godSelectedChat.messageCount || 0) + 1 });
  };

  const godExitChat = () => { setGodSelectedChat(null); setGodMessages([]); };
  const godExitUser = () => { setGodSelectedUser(null); setGodSelectedChat(null); setGodMessages([]); setGodChats([]); setGodFolders([]); };
  const godExitMode = () => { setGodMode(false); godExitUser(); setGodResponseMode("auto"); };

  const filteredUsers = users.filter(u => u.displayName.toLowerCase().includes(searchUser.toLowerCase()) || u.email.toLowerCase().includes(searchUser.toLowerCase()) || u.uid.toLowerCase().includes(searchUser.toLowerCase()));
  const getModelName = (modelId: string) => adminModels.find(m => m.id === modelId)?.name || modelId;
  const filteredTickets = allTickets.filter(t => ticketFilter === "all" || t.status === ticketFilter);

  // ========================
  // LOGIN
  // ========================
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#050507] text-zinc-100 flex items-center justify-center px-6">
        <div className="w-full max-w-xs">
          <button onClick={() => navigate("/chat")} className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors mb-10">
            <Back className="w-3.5 h-3.5" /> Назад
          </button>
          <div className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-6"><Lock className="w-4 h-4 text-violet-400" /><h1 className="font-semibold text-sm">Админ панель</h1></div>
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
        <input ref={godFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleGodFileSelect} />
        <div className="border-b border-white/[0.04] bg-[#050507]/80 backdrop-blur-xl shrink-0">
          <div className="max-w-full mx-auto px-4 h-12 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={godExitMode} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"><Back className="w-3.5 h-3.5" /> Выход</button>
              <span className="text-white/[0.08]">|</span>
              <div className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5 text-red-400" /><span className="text-xs font-medium text-red-400">Режим бога</span></div>
              {godSelectedUser && <><span className="text-white/[0.08]">|</span><span className="text-xs text-zinc-500">{godSelectedUser.visibleNick || godSelectedUser.displayName}</span></>}
              {godSelectedChat && <><span className="text-white/[0.08]">→</span><span className="text-xs text-zinc-400">{godSelectedChat.title}</span></>}
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
                      godResponseMode === m.mode ? m.mode === "auto" ? "bg-emerald-500/10 text-emerald-400" : m.mode === "manual" ? "bg-violet-500/10 text-violet-400" : "bg-red-500/10 text-red-400" : "text-zinc-600 hover:text-zinc-400"
                    }`}><m.icon className="w-3 h-3" /> {m.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
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
                    <div className="w-8 h-8 rounded-lg bg-violet-600/10 flex items-center justify-center text-xs font-medium text-violet-400 shrink-0">{(u.visibleNick || u.displayName)[0]?.toUpperCase() || "U"}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{u.visibleNick || u.displayName}</p>
                      <p className="text-[10px] text-zinc-700 truncate">{u.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {godSelectedUser && !godSelectedChat && (
            <div className="flex-1 overflow-y-auto p-6">
              <button onClick={godExitUser} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-4"><Back className="w-3 h-3" /> Назад</button>
              <h2 className="text-sm font-medium mb-1">Чаты — {godSelectedUser.visibleNick || godSelectedUser.displayName}</h2>
              <p className="text-xs text-zinc-600 mb-4">{godChats.length} чатов</p>
              {godFolders.map((folder) => {
                const fc = godChats.filter(c => c.folderId === folder.id);
                const col = godCollapsedFolders.has(folder.id);
                return (
                  <div key={folder.id} className="mb-2">
                    <button onClick={() => { const n = new Set(godCollapsedFolders); col ? n.delete(folder.id) : n.add(folder.id); setGodCollapsedFolders(n); }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 w-full text-left transition-colors">
                      <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${!col ? "rotate-90" : ""}`} />
                      <Folder className="w-3.5 h-3.5 text-violet-400/60" /><span className="font-medium">{folder.name}</span><span className="text-[10px] text-zinc-700 ml-auto">{fc.length}</span>
                    </button>
                    {!col && <div className="pl-6 space-y-1 mt-1">{fc.map((ch) => (
                      <button key={ch.id} onClick={() => setGodSelectedChat(ch)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left border border-white/[0.04] hover:border-violet-500/20 bg-white/[0.01] hover:bg-white/[0.02] transition-all">
                        <MessageSquare className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                        <div className="min-w-0 flex-1"><p className="text-xs font-medium truncate">{ch.title}</p><p className="text-[10px] text-zinc-700">{getModelName(ch.model)} · {ch.messageCount} сообщ.</p></div>
                      </button>
                    ))}</div>}
                  </div>
                );
              })}
              <div className="space-y-1 mt-2">{godChats.filter(c => !c.folderId).map((ch) => (
                <button key={ch.id} onClick={() => setGodSelectedChat(ch)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left border border-white/[0.04] hover:border-violet-500/20 bg-white/[0.01] hover:bg-white/[0.02] transition-all">
                  <MessageSquare className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                  <div className="min-w-0 flex-1"><p className="text-xs font-medium truncate">{ch.title}</p><p className="text-[10px] text-zinc-700">{getModelName(ch.model)} · {ch.messageCount} сообщ.</p></div>
                </button>
              ))}</div>
              {godChats.length === 0 && <div className="text-center py-16 text-xs text-zinc-700">Нет чатов</div>}
            </div>
          )}

          {godSelectedUser && godSelectedChat && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-2 border-b border-white/[0.04] flex items-center gap-3 shrink-0">
                <button onClick={godExitChat} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"><Back className="w-3 h-3" /> Чаты</button>
                <span className="text-white/[0.06]">|</span><span className="text-xs font-medium">{godSelectedChat.title}</span>
                <div className="ml-auto flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium ${
                    godResponseMode === "auto" ? "bg-emerald-500/10 text-emerald-400" : godResponseMode === "manual" ? "bg-violet-500/10 text-violet-400" : "bg-red-500/10 text-red-400"
                  }`}><Radio className="w-2.5 h-2.5" />{godResponseMode === "auto" ? "ИИ отвечает" : godResponseMode === "manual" ? "Вы = ИИ" : "Вы = Админ"}</div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="max-w-2xl mx-auto space-y-4">
                  {godMessages.map((msg) => (
                    <div key={msg.id} className={msg.role === "user" ? "flex justify-end" : ""}>
                      {msg.role === "user" ? (
                        <div className="max-w-[80%]">
                          {msg.imageUrl && <div className="mb-2 flex justify-end"><img src={msg.imageUrl} alt="" className="max-w-[300px] max-h-[300px] rounded-xl object-cover border border-white/[0.06]" /></div>}
                          {msg.content && <div className="bg-violet-600/15 text-zinc-100 px-4 py-3 rounded-2xl rounded-br-md text-sm"><span className="whitespace-pre-wrap">{msg.content}</span><div className="text-[9px] text-zinc-500 mt-1">{new Date(msg.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</div></div>}
                        </div>
                      ) : msg.role === "admin" ? (
                        <div className="max-w-[80%]">
                          <div className="flex items-center gap-2 mb-1.5"><div className="w-5 h-5 rounded-md bg-red-600/10 flex items-center justify-center"><Shield className="w-3 h-3 text-red-400" /></div><span className="text-[11px] font-medium text-red-400">Администратор</span></div>
                          {msg.imageUrl && <div className="mb-2"><img src={msg.imageUrl} alt="" className="max-w-[300px] max-h-[300px] rounded-xl object-cover border border-red-500/10" /></div>}
                          <div className="bg-red-600/5 border border-red-500/10 text-zinc-300 px-4 py-3 rounded-2xl rounded-tl-md text-sm"><MarkdownRenderer content={msg.content} /></div>
                        </div>
                      ) : (
                        <div className="max-w-[80%]">
                          <div className="flex items-center gap-2 mb-1.5"><AdminModelLogo modelId={msg.model} size={18} /><span className="text-[11px] font-medium text-zinc-400">{getModelName(msg.model)}</span></div>
                          {msg.imageUrl && <div className="mb-2"><img src={msg.imageUrl} alt="" className="max-w-[300px] max-h-[300px] rounded-xl object-cover border border-white/[0.06]" /></div>}
                          <div className="text-zinc-300 text-sm"><MarkdownRenderer content={msg.content} /></div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={godMessagesEndRef} />
                </div>
              </div>
              {godResponseMode !== "auto" ? (
                <div className="p-4 border-t border-white/[0.04] shrink-0">
                  <div className="max-w-2xl mx-auto">
                    {godImagePreview && (
                      <div className="mb-2 flex items-start gap-2">
                        <div className="relative"><img src={godImagePreview} alt="" className="w-16 h-16 rounded-xl object-cover border border-white/[0.06]" />
                          <button onClick={clearGodImage} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 border border-white/[0.1] rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-red-600 transition-all"><XIcon className="w-3 h-3" /></button>
                        </div>{godUploadingImage && <span className="text-[10px] text-zinc-500 py-2">Загрузка...</span>}
                      </div>
                    )}
                    <div className={`flex items-end gap-2 border rounded-2xl px-4 py-3 transition-all duration-200 ${godResponseMode === "manual" ? "border-violet-500/20 bg-violet-600/5" : "border-red-500/20 bg-red-600/5"}`}>
                      {godResponseMode === "manual" ? <Bot className="w-3.5 h-3.5 text-violet-400 shrink-0" /> : <Shield className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                      <button onClick={() => godFileInputRef.current?.click()} className="p-1.5 rounded-lg shrink-0 text-zinc-500 hover:text-zinc-300 transition-all"><ImagePlus className="w-4 h-4" /></button>
                      <textarea value={godInput} onChange={(e) => setGodInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); godSendMessage(); } }}
                        placeholder={godResponseMode === "manual" ? `От имени ${getModelName(godSelectedChat.model)}...` : "От имени администратора..."}
                        rows={1} className="flex-1 bg-transparent text-sm placeholder-zinc-700 focus:outline-none resize-none max-h-32 min-h-[20px]" style={{ height: "20px" }}
                        onInput={(e) => { const el = e.target as HTMLTextAreaElement; el.style.height = "20px"; el.style.height = Math.min(el.scrollHeight, 128) + "px"; }} />
                      <button onClick={godSendMessage} disabled={!godInput.trim() && !godImageFile}
                        className={`p-2 rounded-xl transition-all disabled:opacity-30 ${godResponseMode === "manual" ? "text-violet-400 hover:bg-violet-600/10" : "text-red-400 hover:bg-red-600/10"}`}><Send className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 border-t border-white/[0.04] shrink-0"><div className="max-w-2xl mx-auto text-center"><p className="text-xs text-zinc-600">Режим наблюдения — ИИ отвечает автоматически</p></div></div>
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
    { id: "tickets" as const, label: `Тикеты${allTickets.filter(t => t.status === "open").length > 0 ? ` (${allTickets.filter(t => t.status === "open").length})` : ""}` },
    { id: "uptime" as const, label: "Uptime" },
    { id: "settings" as const, label: "Настройки" },
    { id: "models" as const, label: "Модели" },
  ];

  return (
    <div className="min-h-screen bg-[#050507] text-zinc-100">
      {/* Ban dialog modal */}
      {banDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setBanDialog(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-[#111114] border border-white/[0.06] rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2"><Ban className="w-4 h-4 text-red-400" /><h2 className="text-sm font-semibold">Заблокировать {banDialog.name}</h2></div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Причина</label>
                <input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Нарушение правил"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-red-500/40" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Длительность (минуты)</label>
                <div className="flex items-center gap-3">
                  <input type="number" value={banDuration} onChange={(e) => setBanDuration(e.target.value)} disabled={banPermanent}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm focus:outline-none focus:border-red-500/40 disabled:opacity-30" />
                  <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
                    <input type="checkbox" checked={banPermanent} onChange={(e) => setBanPermanent(e.target.checked)} className="rounded border-zinc-700" />
                    Навсегда
                  </label>
                </div>
                <div className="flex gap-2 mt-2">
                  {[30, 60, 1440, 10080].map((m) => (
                    <button key={m} onClick={() => { setBanDuration(String(m)); setBanPermanent(false); }}
                      className="px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04] text-[10px] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.08] transition-all">
                      {m < 60 ? `${m}м` : m < 1440 ? `${m / 60}ч` : `${m / 1440}д`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setBanDialog(null)} className="flex-1 py-2.5 rounded-xl border border-white/[0.06] text-sm text-zinc-400 hover:text-zinc-200 transition-all">Отмена</button>
                <button onClick={confirmBan} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-500 transition-all">Заблокировать</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-white/[0.04] sticky top-0 z-40 bg-[#050507]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-violet-600 rounded-md flex items-center justify-center"><span className="text-white font-bold text-[10px]">R</span></div>
            <span className="text-white/[0.08]">|</span><span className="text-xs text-zinc-500 font-medium">Администрирование</span>
          </div>
          <button onClick={() => { navigate("/chat"); }} className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors">Выйти</button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex gap-1 mb-8 border-b border-white/[0.04] overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
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
                    {s.change !== null && s.change > 0 && <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">+{s.change} сегодня</span>}
                  </div>
                  <div className="text-2xl font-bold mb-0.5">{s.value}</div>
                  <div className="text-xs text-zinc-600">{s.label}</div>
                </div>
              ))}
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
                <button onClick={() => setGodMode(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/20 bg-red-600/5 text-red-400 text-xs font-medium hover:bg-red-600/10 transition-all"><Eye className="w-3.5 h-3.5" /> Режим бога</button>
              </div>
            </div>
            <div className="border border-white/[0.04] rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="border-b border-white/[0.04]">
                  {["Пользователь", "Email", "Тариф", "Статус", ""].map((h) => (<th key={h} className="text-left text-[10px] text-zinc-600 font-medium px-4 py-3 uppercase tracking-wider">{h}</th>))}
                </tr></thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.uid} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                      <td className="px-4 py-3"><p className="text-xs font-medium">{u.visibleNick || u.displayName}</p><p className="text-[10px] text-zinc-700 font-mono">{u.uid.substring(0, 12)}…</p></td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{u.email}</td>
                      <td className="px-4 py-3">
                        <div className="relative inline-block">
                          <select value={u.plan} onChange={(e) => changePlan(u.uid, e.target.value)}
                            className="appearance-none pl-2 pr-6 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[11px] text-zinc-300 focus:outline-none cursor-pointer">
                            <option value="free" className="bg-[#111114]">Free</option>
                            <option value="pro" className="bg-[#111114]">Pro</option>
                            <option value="ultra" className="bg-[#111114]">Ultra</option>
                          </select>
                          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-zinc-600 pointer-events-none" />
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className={`text-[11px] font-medium ${u.banned ? "text-red-400" : "text-emerald-500"}`}>{u.banned ? "Заблокирован" : "Активен"}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {u.banned ? (
                            <button onClick={() => unbanUser(u.uid)} className="p-1.5 rounded-lg hover:bg-white/[0.03] text-emerald-500 hover:text-emerald-400 transition-colors" title="Разбанить"><Ban className="w-3.5 h-3.5" /></button>
                          ) : (
                            <button onClick={() => openBanDialog(u.uid, u.visibleNick || u.displayName)} className="p-1.5 rounded-lg hover:bg-white/[0.03] text-zinc-600 hover:text-yellow-400 transition-colors" title="Забанить"><Ban className="w-3.5 h-3.5" /></button>
                          )}
                          <button onClick={() => deleteUser(u.uid)} className="p-1.5 rounded-lg hover:bg-white/[0.03] text-zinc-600 hover:text-red-400 transition-colors" title="Удалить"><Trash2 className="w-3.5 h-3.5" /></button>
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

        {activeTab === "tickets" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-sm font-medium">Тикеты</h3>
              <div className="flex items-center gap-1 bg-white/[0.02] border border-white/[0.06] rounded-xl p-0.5 ml-auto">
                {(["all", "open", "closed"] as const).map((f) => (
                  <button key={f} onClick={() => setTicketFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${ticketFilter === f ? "bg-violet-600/10 text-violet-400" : "text-zinc-600 hover:text-zinc-400"}`}>
                    {f === "all" ? "Все" : f === "open" ? "Открытые" : "Закрытые"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-4" style={{ height: "calc(100vh - 220px)" }}>
              {/* Ticket list */}
              <div className="w-80 shrink-0 border border-white/[0.04] rounded-2xl overflow-y-auto">
                {filteredTickets.length === 0 && <div className="py-16 text-center text-xs text-zinc-700">Нет тикетов</div>}
                {filteredTickets.map((t) => (
                  <button key={t.id} onClick={() => setSelectedTicket(t)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-white/[0.02] hover:bg-white/[0.01] transition-all ${selectedTicket?.id === t.id ? "bg-violet-600/5" : ""}`}>
                    <TicketCheck className={`w-4 h-4 shrink-0 ${t.status === "open" ? "text-emerald-400" : "text-zinc-600"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{t.subject}</p>
                      <p className="text-[10px] text-zinc-600">#{t.serialNumber} · {t.userName}</p>
                    </div>
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0 ${t.status === "open" ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"}`}>{t.status === "open" ? "Открыт" : "Закрыт"}</span>
                  </button>
                ))}
              </div>
              {/* Ticket detail */}
              <div className="flex-1 border border-white/[0.04] rounded-2xl flex flex-col overflow-hidden">
                {selectedTicket ? (
                  <>
                    <div className="px-5 py-3 border-b border-white/[0.04] flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{selectedTicket.subject}</p>
                        <p className="text-[10px] text-zinc-600">#{selectedTicket.serialNumber} · {selectedTicket.userName} · {selectedTicket.userEmail}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {selectedTicket.status === "open" ? (
                          <button onClick={() => changeTicketStatus(selectedTicket.id, "closed")} className="px-3 py-1.5 rounded-lg border border-white/[0.06] text-[11px] text-zinc-400 hover:text-zinc-200 transition-all">Закрыть</button>
                        ) : (
                          <button onClick={() => changeTicketStatus(selectedTicket.id, "open")} className="px-3 py-1.5 rounded-lg border border-emerald-500/20 text-[11px] text-emerald-400 hover:bg-emerald-500/10 transition-all">Открыть</button>
                        )}
                        <button onClick={() => deleteTicket(selectedTicket.id)} className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-600/5 transition-all" title="Удалить"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                      {ticketMessages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === "admin" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                            msg.role === "admin" ? "bg-violet-600/15 text-zinc-100 rounded-br-md" : "bg-white/[0.03] border border-white/[0.04] text-zinc-300 rounded-bl-md"
                          }`}>
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                            <p className="text-[9px] text-zinc-600 mt-1">
                              {msg.role === "admin" && <span className="text-violet-400 mr-1">Вы · </span>}
                              {new Date(msg.timestamp).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      ))}
                      <div ref={ticketEndRef} />
                    </div>
                    <div className="p-4 border-t border-white/[0.04]">
                      <div className="flex items-center gap-2">
                        <input value={ticketReply} onChange={(e) => setTicketReply(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") sendAdminTicketReply(); }}
                          placeholder="Ответить..." className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40" />
                        <button onClick={sendAdminTicketReply} disabled={!ticketReply.trim()} className="p-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 transition-all"><Send className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center"><p className="text-xs text-zinc-700">Выберите тикет</p></div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "uptime" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div><h3 className="text-sm font-medium mb-1">Управление Uptime</h3><p className="text-xs text-zinc-600">Нажмите на полоску для изменения статуса</p></div>
              <div className="flex items-center gap-4">{STATUS_OPTIONS.map(s => (<div key={s} className="flex items-center gap-1.5"><div className={`w-2.5 h-2.5 rounded-sm ${STATUS_COLORS[s]}`} /><span className="text-[10px] text-zinc-500">{STATUS_LABELS[s]}</span></div>))}</div>
            </div>
            {componentUptimes.map((comp, compIdx) => {
              const cs = getCurrentStatus(comp.hours);
              return (
                <div key={comp.key} className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3"><h4 className="text-sm font-medium">{comp.name}</h4><div className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[cs]}`} /><span className={`text-[11px] font-medium ${cs === "operational" ? "text-emerald-400" : cs === "degraded" ? "text-yellow-400" : cs === "down" ? "text-red-400" : "text-zinc-400"}`}>{STATUS_LABELS[cs]}</span></div></div>
                    <span className="text-xs text-zinc-500">{getUptimePercent(comp.hours)}% uptime</span>
                  </div>
                  <div className="flex gap-[2px] mb-2">
                    {comp.hours.map((status, hourIdx) => (
                      <button key={hourIdx} onClick={() => handleHourClick(compIdx, hourIdx)}
                        className={`flex-1 h-7 rounded-[2px] transition-all cursor-pointer hover:opacity-80 ${STATUS_COLORS[status]} ${
                          selectedHour?.compIdx === compIdx && selectedHour?.hourIdx === hourIdx ? "ring-2 ring-white ring-offset-1 ring-offset-[#050507] opacity-100" : "opacity-40 hover:opacity-60"
                        }`} title={`Час ${90 - hourIdx}: ${STATUS_LABELS[status]}`} />
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-700 mb-3"><span>90ч назад</span><span>Сейчас</span></div>
                  {selectedHour?.compIdx === compIdx && (
                    <div className="flex items-center gap-2 pt-3 border-t border-white/[0.04]">
                      <span className="text-xs text-zinc-500 mr-2">Час {90 - selectedHour.hourIdx}:</span>
                      {STATUS_OPTIONS.map(s => (
                        <button key={s} onClick={() => setHourStatus(s)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                          comp.hours[selectedHour.hourIdx] === s ? "border-violet-500/30 bg-violet-600/10 text-violet-300" : "border-white/[0.04] text-zinc-500 hover:border-white/[0.08] hover:text-zinc-300"
                        }`}><span className={`w-2 h-2 rounded-sm ${STATUS_COLORS[s]}`} /> {STATUS_LABELS[s]}</button>
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
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${settings.maintenance ? "bg-yellow-500/10 text-yellow-500" : "bg-zinc-800 text-zinc-500"}`}>{settings.maintenance ? "Включено" : "Выключено"}</span>
              </button>
              <div><label className="block text-xs text-zinc-600 mb-1.5">Сообщение</label>
                <textarea value={settings.maintenanceMessage} onChange={(e) => setSettings(p => ({ ...p, maintenanceMessage: e.target.value }))} rows={2}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40 resize-none" /></div>
              <div><label className="block text-xs text-zinc-600 mb-1.5">Ожидаемое время</label>
                <input value={settings.maintenanceEstimate} onChange={(e) => setSettings(p => ({ ...p, maintenanceEstimate: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm focus:outline-none focus:border-violet-500/40" /></div>
            </div>
            <div className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-medium">Общие</h3>
              <button onClick={() => setSettings(p => ({ ...p, registrationEnabled: !p.registrationEnabled }))}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-all text-sm">
                <span>Регистрация</span>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${settings.registrationEnabled ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-400"}`}>{settings.registrationEnabled ? "Открыта" : "Закрыта"}</span>
              </button>
              <div><label className="block text-xs text-zinc-600 mb-1.5">Лимит запросов (Free)</label>
                <input type="number" value={settings.freeRequestsLimit} onChange={(e) => setSettings(p => ({ ...p, freeRequestsLimit: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm focus:outline-none focus:border-violet-500/40" /></div>
              <div><label className="block text-xs text-zinc-600 mb-1.5">Объявление</label>
                <textarea value={settings.announcement} onChange={(e) => setSettings(p => ({ ...p, announcement: e.target.value }))} rows={2} placeholder="Пусто — скрыто"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40 resize-none" /></div>
            </div>
            <button onClick={saveSettings} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${saved ? "bg-emerald-600 text-white" : "bg-violet-600 text-white hover:bg-violet-500"}`}>
              {saved ? <><Check className="w-3.5 h-3.5" /> Сохранено</> : <><Save className="w-3.5 h-3.5" /> Сохранить</>}
            </button>
          </div>
        )}

        {activeTab === "models" && (
          <div className="space-y-4">
            <div><h3 className="text-sm font-medium mb-1">Управление моделями</h3><p className="text-xs text-zinc-600">Включайте и отключайте AI модели.</p></div>
            <div className="border border-white/[0.04] rounded-2xl overflow-hidden divide-y divide-white/[0.02]">
              {adminModels.map((m) => {
                const key = sanitizeKey(m.id);
                const isDisabled = !!disabledModels[key];
                return (
                  <div key={m.id} className={`flex items-center justify-between px-5 py-4 transition-all duration-300 ${isDisabled ? "opacity-60" : "hover:bg-white/[0.01]"}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDisabled ? "opacity-30" : ""}`}><AdminModelLogo modelId={m.id} size={24} /></div>
                      <div><p className="text-sm font-medium">{m.name}</p><p className="text-[11px] text-zinc-600">{m.provider}</p></div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${isDisabled ? "bg-red-500" : "bg-emerald-500"}`} />
                        <span className={`text-[11px] font-medium ${isDisabled ? "text-red-400" : "text-emerald-400"}`}>{isDisabled ? "Отключена" : "Активна"}</span>
                      </div>
                      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleToggleModel(m.id); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border cursor-pointer select-none transition-all duration-200 ${
                          isDisabled ? "border-emerald-500/20 text-emerald-400 hover:bg-emerald-600/10" : "border-red-500/20 text-red-400 hover:bg-red-600/10"
                        }`}>
                        {isDisabled ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                        {isDisabled ? "Включить" : "Отключить"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
