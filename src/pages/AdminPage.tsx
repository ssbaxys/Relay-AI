import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ref, onValue, set, remove, update, push, get } from "firebase/database";
import { db } from "../firebase";
import MarkdownRenderer from "../components/MarkdownRenderer";
import {
  Lock, Search, Ban, Trash2, ChevronDown, Save, Check, TrendingUp, Users, MessageCircle, FolderOpen,
  Eye, Send, ArrowLeft as Back, Radio, Bot, Shield, Folder, ChevronRight, MessageSquare,
  Power, PowerOff, X as XIcon, TicketCheck, Clock, Music, Play, Pause, Download,
  Code, Image as ImageIcon, PanelLeft, Plus, Home, LogOut, Pencil, ArrowDownAZ,
  GripVertical, ExternalLink, AlertTriangle, Square, Globe
} from "lucide-react";
import { useTranslation } from "react-i18next";

const sanitizeKey = (k: string) => k.replace(/\./g, "_");

interface UserData { uid: string; displayName: string; email: string; plan: string; role: string; lastLogin: number; createdAt: number; banned?: boolean; visibleNick?: string; language?: string; }
interface SystemSettings { maintenance: boolean; maintenanceMessage: string; maintenanceEstimate: string; registrationEnabled: boolean; freeRequestsLimit: number; announcement: string; paymentMode: "success" | "insufficient_funds" | "invalid_card"; }
type UptimeStatus = "operational" | "degraded" | "down" | "maintenance";
type GodModeType = "auto" | "manual" | "admin";

const UPTIME_COMPONENTS = [
  { name: "API Gateway", key: "api_gateway" }, { name: "AI Models Router", key: "ai_router" },
  { name: "Web App", key: "web_app" }, { name: "Database", key: "database" },
  { name: "Auth", key: "auth" }, { name: "CDN & Networking", key: "cdn" },
];
const STATUS_COLORS: Record<UptimeStatus, string> = { operational: "bg-emerald-500", degraded: "bg-yellow-500", down: "bg-red-500", maintenance: "bg-zinc-500" };
const STATUS_OPTIONS: UptimeStatus[] = ["operational", "degraded", "down", "maintenance"];

const adminModels = [
  { id: "gpt-5.2-codex", name: "GPT-5.2 Codex", provider: "OpenAI", logo: "https://img.icons8.com/fluency-systems-regular/48/chatgpt.png", logoFilter: "invert(1) brightness(2)" },
  { id: "claude-opus-4.6", name: "Claude Opus 4.6", provider: "Anthropic", logo: "https://img.icons8.com/fluency/48/claude-ai.png", logoFilter: "" },
  { id: "gemini-3-pro", name: "Gemini 3 Pro", provider: "Google", logo: "https://img.icons8.com/color/48/google-logo.png", logoFilter: "" },
];

function AdminModelLogo({ modelId, size = 20 }: { modelId: string; size?: number }) {
  const m = adminModels.find(x => x.id === modelId);
  if (!m) return <div className="bg-violet-600/10 rounded-lg flex items-center justify-center" style={{ width: size, height: size }}><span className="text-violet-400 font-bold" style={{ fontSize: size * 0.4 }}>R</span></div>;
  return <img src={m.logo} alt="" width={size} height={size} style={{ filter: m.logoFilter || "none" }} />;
}

function getDefaultHours(): UptimeStatus[] { return Array.from({ length: 90 }, () => "operational" as UptimeStatus); }
function formatDur(sec: number): string { const m = Math.floor(sec / 60); const s = Math.floor(sec % 60); return `${m}:${s.toString().padStart(2, "0")}`; }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function AdminAudioPlayer({ url }: { url: string }) {
  const aRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dur, setDur] = useState(0);
  const [cur, setCur] = useState(0);
  useEffect(() => {
    const a = aRef.current; if (!a) return;
    const h1 = () => setDur(a.duration || 0);
    const h2 = () => { setCur(a.currentTime); setProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0); };
    const h3 = () => { setPlaying(false); setProgress(0); setCur(0); };
    a.addEventListener("loadedmetadata", h1); a.addEventListener("timeupdate", h2); a.addEventListener("ended", h3);
    return () => { a.removeEventListener("loadedmetadata", h1); a.removeEventListener("timeupdate", h2); a.removeEventListener("ended", h3); };
  }, []);
  return (
    <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-2xl px-4 py-3 max-w-[300px]">
      <audio ref={aRef} src={url} preload="metadata" />
      <button onClick={() => { if (!aRef.current) return; if (playing) aRef.current.pause(); else aRef.current.play(); setPlaying(!playing); }} className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center shrink-0 hover:bg-violet-500 transition-colors">{playing ? <Pause className="w-3.5 h-3.5 text-white fill-white" /> : <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />}</button>
      <div className="flex-1 min-w-0"><div className="cursor-pointer rounded-full h-1.5 bg-white/[0.06] mb-1" onClick={(e) => { if (!aRef.current || !dur) return; const r = e.currentTarget.getBoundingClientRect(); aRef.current.currentTime = ((e.clientX - r.left) / r.width) * dur; }}><div className="h-full bg-violet-500 rounded-full transition-all duration-100" style={{ width: `${progress}%` }} /></div><div className="flex justify-between text-[9px] text-zinc-600 font-mono"><span>{formatDur(cur)}</span><span>{formatDur(dur)}</span></div></div>
      <a href={url} download className="p-1 rounded-lg text-zinc-600 hover:text-violet-400 transition-colors shrink-0"><Download className="w-3 h-3" /></a>
    </div>
  );
}

// ===================== VIEW AS USER COMPONENT =====================
function ViewAsUserPanel({ targetUser, onExit }: { targetUser: UserData; onExit: () => void }) {
  const { t } = useTranslation();
  const TOOL_LABELS: Record<string, string> = {
    search: t('admin.toolSearch'),
    code: t('admin.toolCode'),
    photo: t('admin.toolPhoto'),
    music: t('admin.toolMusic')
  };
  const [chats, setChats] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load user's chats in real-time
  useEffect(() => {
    const u1 = onValue(ref(db, `chats/${targetUser.uid}`), (s) => {
      const d = s.val();
      if (d) {
        setChats(Object.entries(d).map(([id, v]: [string, any]) => ({
          id, title: v.title || t('chat.newChat'), model: v.model || "gpt-5.2-codex",
          createdAt: v.createdAt || 0, lastMessage: v.lastMessage || 0,
          messageCount: v.messageCount || 0, folderId: v.folderId || undefined
        })).sort((a: any, b: any) => b.lastMessage - a.lastMessage));
      } else setChats([]);
    });
    const u2 = onValue(ref(db, `folders/${targetUser.uid}`), (s) => {
      const d = s.val();
      if (d) {
        setFolders(Object.entries(d).map(([id, v]: [string, any]) => ({
          id, name: v.name || "Folder", createdAt: v.createdAt || 0, collapsed: v.collapsed || false
        })));
      } else setFolders([]);
    });
    return () => { u1(); u2(); };
  }, [targetUser.uid]);

  // Load messages for selected chat in real-time
  useEffect(() => {
    if (!selectedChat) { setMessages([]); return; }
    const u = onValue(ref(db, `messages/${targetUser.uid}/${selectedChat.id}`), (s) => {
      const d = s.val();
      if (d) {
        setMessages(Object.entries(d).map(([id, v]: [string, any]) => ({ id, ...v })).sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0)));
      } else setMessages([]);
    });
    return () => u();
  }, [targetUser.uid, selectedChat]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const getModelName = (id: string) => adminModels.find(m => m.id === id)?.name || id;
  const filteredChats = chats.filter(c => !searchQuery.trim() || c.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const folderedChats = filteredChats.filter(c => c.folderId);
  const unfolderedChats = filteredChats.filter(c => !c.folderId);

  const renderMsg = (msg: any) => {
    const role = String(msg.role || "user");
    const mType = String(msg.type || "");
    const content = String(msg.content || "");

    if (role === "user") {
      return (
        <div className="flex justify-end">
          <div className="max-w-[75%]">
            {msg.imageUrl && <div className="mb-2 flex justify-end"><img src={String(msg.imageUrl)} alt="" className="max-w-[260px] max-h-[260px] rounded-xl object-cover border border-white/[0.06]" /></div>}
            {content && <div className="bg-violet-600/15 text-zinc-100 px-4 py-3 rounded-2xl rounded-br-md text-sm"><span className="whitespace-pre-wrap">{content}</span></div>}
            {msg.tool && <div className="flex justify-end mt-1"><span className="text-[9px] text-zinc-600 bg-white/[0.02] px-2 py-0.5 rounded-full">🔧 {TOOL_LABELS[String(msg.tool)] || msg.tool}</span></div>}
          </div>
        </div>
      );
    }

    if (role === "admin") {
      return (
        <div className="max-w-[75%]">
          <div className="flex items-center gap-2 mb-1.5"><Shield className="w-4 h-4 text-red-400" /><span className="text-[11px] font-medium text-red-400">{t('admin.adminRole')}</span></div>
          {msg.imageUrl && <img src={String(msg.imageUrl)} alt="" className="max-w-[260px] max-h-[260px] rounded-xl object-cover border border-red-500/10 mb-2" />}
          <div className="bg-red-600/5 border border-red-500/10 text-zinc-300 px-4 py-3 rounded-2xl rounded-tl-md text-sm"><MarkdownRenderer content={content} /></div>
        </div>
      );
    }

    // Assistant
    return (
      <div className="max-w-[75%]">
        <div className="flex items-center gap-2 mb-1.5"><AdminModelLogo modelId={msg.model || ""} size={18} /><span className="text-[11px] font-medium text-zinc-400">{getModelName(String(msg.model || ""))}</span></div>
        {mType === "search_pending" && (
          <div className="flex items-center gap-3 bg-blue-600/5 border border-blue-500/10 rounded-2xl px-5 py-4 max-w-[300px]">
            <Search className="w-5 h-5 text-blue-400 animate-search-spin" />
            <p className="text-sm text-blue-400 animate-pulse">{t('chat.searching')}</p>
          </div>
        )}
        {mType === "search_done" && (
          <div className="flex items-center gap-3 bg-blue-600/5 border border-blue-500/10 rounded-2xl px-5 py-4 max-w-[300px]">
            <Search className="w-5 h-5 text-blue-400" />
            <p className="text-sm text-blue-400">{t('chat.searchDone')}</p>
          </div>
        )}
        {mType === "photo_pending" && (
          <div className="w-[180px] h-[180px] rounded-2xl bg-zinc-800/50 border border-white/[0.06] flex flex-col items-center justify-center gap-3">
            <ImageIcon className="w-8 h-8 text-zinc-500" /><p className="text-xs text-zinc-500 animate-pulse">{t('common.generating')}</p>
          </div>
        )}
        {mType === "photo" && msg.imageUrl && <img src={String(msg.imageUrl)} alt="" className="max-w-[260px] max-h-[260px] rounded-2xl object-cover border border-white/[0.06]" />}
        {mType === "music_generating" && (
          <div className="flex items-center gap-3 bg-violet-600/5 border border-violet-500/10 rounded-2xl px-5 py-4 max-w-[300px]">
            <Music className="w-5 h-5 text-violet-400 animate-spin" style={{ animationDuration: "3s" }} />
            <p className="text-sm text-violet-400 animate-pulse">{t('admin.toolMusic')}...</p>
          </div>
        )}
        {mType === "music" && msg.audioUrl && <AdminAudioPlayer url={String(msg.audioUrl)} />}
        {mType === "code_action" && (() => {
          const acts: any[] = Array.isArray(msg.actions) ? msg.actions : (msg.actions ? Object.values(msg.actions) : []);
          return (
            <div className="space-y-1.5">{acts.map((a: any, i: number) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${a.success !== false ? "border-emerald-500/10 bg-emerald-600/5" : "border-red-500/10 bg-red-600/5"}`}>
                <span className="text-[11px] font-medium text-zinc-400 capitalize w-14">{String(a.action || "")}</span>
                <span className="text-[11px] text-zinc-500 font-mono truncate flex-1">{String(a.path || "")}</span>
                {a.success !== false ? <Check className="w-3 h-3 text-emerald-400" /> : <XIcon className="w-3 h-3 text-red-400" />}
              </div>
            ))}</div>
          );
        })()}
        {!["search_pending", "search_done", "photo_pending", "photo", "music_generating", "music", "code_action"].includes(mType) && (
          <>
            {msg.imageUrl && <img src={String(msg.imageUrl)} alt="" className="max-w-[260px] max-h-[260px] rounded-xl object-cover border border-white/[0.06] mb-2" />}
            {msg.audioUrl && <div className="mb-2"><AdminAudioPlayer url={String(msg.audioUrl)} /></div>}
            {content && <div className="text-zinc-300 text-sm"><MarkdownRenderer content={content} /></div>}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="h-screen bg-[#050507] text-zinc-100 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 bg-violet-600/10 border-b border-violet-500/20 px-4 h-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Eye className="w-4 h-4 text-violet-400" />
          <div>
            <span className="text-xs font-medium text-violet-300">{t('admin.viewingBanner')}: </span>
            <span className="text-xs text-violet-200 font-semibold">{targetUser.visibleNick || targetUser.displayName}</span>
            <span className="text-[10px] text-violet-400/60 ml-2">{targetUser.email}</span>
          </div>
        </div>
        <button onClick={onExit} className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 transition-all">
          <XIcon className="w-3.5 h-3.5" /> {t('admin.exitChat')}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="shrink-0 border-r border-white/[0.04] bg-[#0a0a0d] transition-all duration-300 overflow-hidden" style={{ width: sidebarOpen ? 260 : 0 }}>
          <div className="w-[260px] min-w-[260px] flex flex-col h-full">
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="flex-1 text-xs font-medium text-zinc-400 px-2">{t('admin.chats')}</div>
                <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-xl border border-white/[0.06] hover:bg-white/[0.03] text-zinc-500 transition-all"><PanelLeft className="w-4 h-4" /></button>
              </div>
              <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-700" /><input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t('admin.searchPlaceholder')} className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[11px] text-white placeholder-zinc-700 focus:outline-none focus:border-violet-500/30" /></div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">
              {folders.map((folder: any) => {
                const fc = folderedChats.filter(c => c.folderId === folder.id);
                const col = collapsedFolders.has(folder.id);
                return (
                  <div key={folder.id} className="mb-1">
                    <button onClick={() => { const n = new Set(collapsedFolders); col ? n.delete(folder.id) : n.add(folder.id); setCollapsedFolders(n); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 w-full text-left transition-colors">
                      <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${!col ? "rotate-90" : ""}`} />
                      <Folder className="w-3.5 h-3.5 text-violet-400/60" />
                      <span className="flex-1 truncate font-medium">{folder.name}</span>
                      <span className="text-[10px] text-zinc-700">{fc.length}</span>
                    </button>
                    {!col && <div className="pl-4 space-y-0.5 mt-0.5">{fc.map((ch: any) => (
                      <button key={ch.id} onClick={() => setSelectedChat(ch)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-all ${selectedChat?.id === ch.id ? "bg-violet-600/10 text-violet-300" : "text-zinc-500 hover:bg-white/[0.03]"}`}>
                        <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-50" /><span className="truncate">{ch.title}</span>
                      </button>
                    ))}</div>}
                  </div>
                );
              })}
              {unfolderedChats.map((ch: any) => (
                <button key={ch.id} onClick={() => setSelectedChat(ch)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-all ${selectedChat?.id === ch.id ? "bg-violet-600/10 text-violet-300" : "text-zinc-500 hover:bg-white/[0.03]"}`}>
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-50" /><span className="truncate flex-1">{ch.title}</span>
                  <span className="text-[10px] text-zinc-700">{ch.messageCount}</span>
                </button>
              ))}
              {chats.length === 0 && <div className="text-center py-10 text-xs text-zinc-700">{t('admin.noChats')}</div>}
            </div>
            <div className="p-3 border-t border-white/[0.04]">
              <div className="flex items-center gap-2 px-2">
                <div className="w-7 h-7 rounded-lg bg-violet-600/20 flex items-center justify-center text-xs font-medium text-violet-400">{(targetUser.visibleNick || targetUser.displayName)[0]?.toUpperCase()}</div>
                <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{targetUser.visibleNick || targetUser.displayName}</p><p className="text-[10px] text-zinc-600 truncate">{targetUser.email}</p></div>
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-12 border-b border-white/[0.04] flex items-center px-4 shrink-0">
            {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-white/[0.03] text-zinc-500 transition-all mr-3"><PanelLeft className="w-4 h-4" /></button>}
            {selectedChat ? (
              <div className="flex items-center gap-2">
                <AdminModelLogo modelId={selectedChat.model} size={18} />
                <span className="text-sm font-medium">{selectedChat.title}</span>
                <span className="text-xs text-zinc-600">· {getModelName(selectedChat.model)} · {selectedChat.messageCount} {t('admin.messages').toLowerCase()}</span>
              </div>
            ) : <span className="text-sm text-zinc-600">{t('chat.selectChat')}</span>}
            <div className="ml-auto text-[10px] text-zinc-700 bg-white/[0.02] px-2 py-1 rounded-lg">Read Only</div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {selectedChat ? (
              <div className="max-w-2xl mx-auto py-6 px-4 space-y-5">
                {messages.map((msg: any) => <div key={msg.id}>{renderMsg(msg)}</div>)}
                {messages.length === 0 && <div className="text-center py-20 text-xs text-zinc-700">{t('admin.noMessages')}</div>}
                <div ref={messagesEndRef} />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Eye className="w-10 h-10 text-violet-400/20 mx-auto mb-4" />
                  <p className="text-sm text-zinc-500">{t('admin.selectChatToView')}</p>
                  <p className="text-xs text-zinc-700 mt-1">{t('admin.userChatsCount', { count: chats.length })}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===================== MAIN ADMIN PAGE =====================
export default function AdminPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const STATUS_LABELS: Record<UptimeStatus, string> = {
    operational: t('admin.statusOperational'),
    degraded: t('admin.statusDegraded'),
    down: t('admin.statusDown'),
    maintenance: t('admin.statusMaintenance')
  };
  const [authenticated, setAuthenticated] = useState(() => typeof window !== "undefined" && localStorage.getItem("relay_admin") === "true");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [users, setUsers] = useState<UserData[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({ maintenance: false, maintenanceMessage: t('admin.maintenanceDefaultMsg'), maintenanceEstimate: "2 hours", registrationEnabled: true, freeRequestsLimit: 5, announcement: "", paymentMode: "success" });
  const [activeTab, setActiveTab] = useState<"dashboard" | "users" | "settings" | "uptime" | "models" | "tickets" | "payments">("dashboard");
  const [payments, setPayments] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalChats: 0, totalMessages: 0, totalVisits: 0, newUsersToday: 0, newChatsToday: 0, newMessagesToday: 0 });
  const [searchUser, setSearchUser] = useState("");
  const [saved, setSaved] = useState(false);
  const [componentUptimes, setComponentUptimes] = useState(UPTIME_COMPONENTS.map(c => ({ ...c, hours: getDefaultHours() })));
  const [selectedHour, setSelectedHour] = useState<{ compIdx: number; hourIdx: number } | null>(null);
  const [disabledModels, setDisabledModels] = useState<Record<string, boolean>>({});
  const [banDialog, setBanDialog] = useState<{ uid: string; name: string } | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState("60");
  const [banPermanent, setBanPermanent] = useState(false);

  // View as user — renders a full panel inside admin
  const [viewingAsUser, setViewingAsUser] = useState<UserData | null>(null);

  // God Mode
  const [godMode, setGodMode] = useState(false);
  const [godSelectedUser, setGodSelectedUser] = useState<UserData | null>(null);
  const [godChats, setGodChats] = useState<any[]>([]);
  const [godFolders, setGodFolders] = useState<any[]>([]);
  const [godSelectedChat, setGodSelectedChat] = useState<any | null>(null);
  const [godMessages, setGodMessages] = useState<any[]>([]);
  const [godInput, setGodInput] = useState("");
  const [godResponseMode, setGodResponseMode] = useState<GodModeType>("auto");
  const [godCollapsedFolders, setGodCollapsedFolders] = useState<Set<string>>(new Set());
  const [godImageFile, setGodImageFile] = useState<File | null>(null);
  const [godImagePreview, setGodImagePreview] = useState<string | null>(null);
  const [godUploadingImage, setGodUploadingImage] = useState(false);
  const [godMusicPending, setGodMusicPending] = useState<string | null>(null);
  const [godMusicFile, setGodMusicFile] = useState<File | null>(null);
  const [godMusicFileName, setGodMusicFileName] = useState<string | null>(null);
  const [godUploadingMusic, setGodUploadingMusic] = useState(false);
  const [godPhotoPending, setGodPhotoPending] = useState<string | null>(null);
  const [godPhotoFile, setGodPhotoFile] = useState<File | null>(null);
  const [godPhotoPreview, setGodPhotoPreview] = useState<string | null>(null);
  const [godUploadingPhoto, setGodUploadingPhoto] = useState(false);
  const [godSearchPending, setGodSearchPending] = useState<string | null>(null);
  const [godSearchSources, setGodSearchSources] = useState<{ url: string; title: string; description: string }[]>([]);
  const [godSourceUrl, setGodSourceUrl] = useState("");
  const [godFetchingMeta, setGodFetchingMeta] = useState(false);
  const [godProjectFiles, setGodProjectFiles] = useState<Record<string, { path: string; content: string }>>({});
  const [godCodeMode, setGodCodeMode] = useState<"read" | "create" | "edit" | "delete">("create");
  const [godCodePath, setGodCodePath] = useState("");
  const [godCodeContent, setGodCodeContent] = useState("");
  const [godCodeSuccess, setGodCodeSuccess] = useState(true);
  const [godShowCodePanel, setGodShowCodePanel] = useState(false);
  const [godSelectedFile, setGodSelectedFile] = useState<string | null>(null);

  const godMessagesEndRef = useRef<HTMLDivElement>(null);
  const godFileInputRef = useRef<HTMLInputElement>(null);
  const godMusicInputRef = useRef<HTMLInputElement>(null);
  const godPhotoInputRef = useRef<HTMLInputElement>(null);

  // Tickets
  const [allTickets, setAllTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [ticketMessages, setTicketMessages] = useState<any[]>([]);
  const [ticketReply, setTicketReply] = useState("");
  const [ticketFilter, setTicketFilter] = useState<"all" | "open" | "closed">("all");
  const ticketEndRef = useRef<HTMLDivElement>(null);

  const handleLogin = (e: React.FormEvent) => { e.preventDefault(); if (password === "4321") { setAuthenticated(true); setError(""); localStorage.setItem("relay_admin", "true"); } else setError("Неверный пароль"); };

  // ALL DATA LOADING — onValue for real-time sync
  useEffect(() => { if (!authenticated) return; const u = onValue(ref(db, "disabledModels"), (s) => { const v = s.val(); setDisabledModels(v && typeof v === "object" ? v : {}); }); return () => u(); }, [authenticated]);
  useEffect(() => { if (!authenticated) return; const u = onValue(ref(db, "users"), (s) => { const d = s.val(); if (d) { const l: UserData[] = Object.entries(d).map(([uid, val]: [string, any]) => ({ uid, displayName: val.displayName || "Без имени", email: val.email || "—", plan: val.plan || "free", role: val.role || "user", lastLogin: val.lastLogin || 0, createdAt: val.createdAt || 0, banned: val.banned || false, visibleNick: val.visibleNick || "", language: val.language || "en" })); setUsers(l); const t = new Date(); t.setHours(0, 0, 0, 0); setStats(p => ({ ...p, totalUsers: l.length, newUsersToday: l.filter(u2 => u2.createdAt >= t.getTime()).length })); } }); return () => u(); }, [authenticated]);
  useEffect(() => { if (!authenticated) return; const u = onValue(ref(db, "settings"), (s) => { const d = s.val(); if (d) setSettings(p => ({ ...p, ...d })); }); return () => u(); }, [authenticated]);
  useEffect(() => { if (!authenticated) return; const u = onValue(ref(db, "chats"), (s) => { const d = s.val(); if (d) { let t = 0, n = 0; const td = new Date(); td.setHours(0, 0, 0, 0); Object.values(d).forEach((uc: any) => { Object.values(uc).forEach((c: any) => { t++; if (c.createdAt >= td.getTime()) n++; }); }); setStats(p => ({ ...p, totalChats: t, newChatsToday: n })); } }); return () => u(); }, [authenticated]);
  useEffect(() => { if (!authenticated) return; const u = onValue(ref(db, "messages"), (s) => { const d = s.val(); if (d) { let t = 0, n = 0; const td = new Date(); td.setHours(0, 0, 0, 0); Object.values(d).forEach((uc: any) => { Object.values(uc).forEach((cm: any) => { Object.values(cm).forEach((m: any) => { t++; if (m.timestamp >= td.getTime()) n++; }); }); }); setStats(p => ({ ...p, totalMessages: t, newMessagesToday: n })); } }); return () => u(); }, [authenticated]);
  useEffect(() => { if (!authenticated) return; set(ref(db, `visits/${Date.now()}`), { timestamp: Date.now() }); const u = onValue(ref(db, "visits"), (s) => { const d = s.val(); if (d) setStats(p => ({ ...p, totalVisits: Object.keys(d).length })); }); return () => u(); }, [authenticated]);
  useEffect(() => { if (!authenticated) return; const u = onValue(ref(db, "uptime"), (s) => { const d = s.val(); if (d) { setComponentUptimes(UPTIME_COMPONENTS.map(c => { const h = d[c.key] ? (d[c.key] as UptimeStatus[]) : getDefaultHours(); return { ...c, hours: Array.from({ length: 90 }, (_, i) => h[i] || "operational") as UptimeStatus[] }; })); } }); return () => u(); }, [authenticated]);
  useEffect(() => { if (!authenticated) return; const u = onValue(ref(db, "tickets"), (s) => { const d = s.val(); if (d) { setAllTickets(Object.entries(d).map(([id, v]: [string, any]) => ({ id, ...v })).sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))); } else setAllTickets([]); }); return () => u(); }, [authenticated]);
  useEffect(() => { if (!authenticated) return; const u = onValue(ref(db, "payments"), (s) => { const d = s.val(); if (d) { setPayments(Object.entries(d).map(([id, v]: [string, any]) => ({ id, ...v })).sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))); } else setPayments([]); }); return () => u(); }, [authenticated]);
  useEffect(() => { if (!selectedTicket) { setTicketMessages([]); return; } const u = onValue(ref(db, `tickets/${selectedTicket.id}/messages`), (s) => { const d = s.val(); if (d) { setTicketMessages(Object.entries(d).map(([id, v]: [string, any]) => ({ id, ...v })).sort((a: any, b: any) => a.timestamp - b.timestamp)); } else setTicketMessages([]); }); return () => u(); }, [selectedTicket]);
  useEffect(() => { ticketEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [ticketMessages]);

  const sendAdminTicketReply = async () => { if (!selectedTicket || !ticketReply.trim()) return; await push(ref(db, `tickets/${selectedTicket.id}/messages`), { role: "admin", content: ticketReply.trim(), timestamp: Date.now() }); setTicketReply(""); };
  const changeTicketStatus = async (id: string, st: "open" | "closed") => { await update(ref(db, `tickets/${id}`), { status: st }); if (selectedTicket?.id === id) setSelectedTicket({ ...selectedTicket, status: st }); };
  const deleteTicket = async (id: string) => { await remove(ref(db, `tickets/${id}`)); if (selectedTicket?.id === id) { setSelectedTicket(null); setTicketMessages([]); } };

  // God Mode data loading
  useEffect(() => { if (!godSelectedUser) { setGodChats([]); setGodFolders([]); return; } const u1 = onValue(ref(db, `chats/${godSelectedUser.uid}`), (s) => { const d = s.val(); if (d) { setGodChats(Object.entries(d).map(([id, v]: [string, any]) => ({ id, title: v.title || "Новый чат", model: v.model || "gpt-5.2-codex", createdAt: v.createdAt || 0, lastMessage: v.lastMessage || 0, messageCount: v.messageCount || 0, folderId: v.folderId || undefined })).sort((a: any, b: any) => b.lastMessage - a.lastMessage)); } else setGodChats([]); }); const u2 = onValue(ref(db, `folders/${godSelectedUser.uid}`), (s) => { const d = s.val(); if (d) { setGodFolders(Object.entries(d).map(([id, v]: [string, any]) => ({ id, name: v.name || "Папка", collapsed: v.collapsed || false }))); } else setGodFolders([]); }); return () => { u1(); u2(); }; }, [godSelectedUser]);
  useEffect(() => { if (!godSelectedUser || !godSelectedChat) { setGodMessages([]); return; } const u = onValue(ref(db, `messages/${godSelectedUser.uid}/${godSelectedChat.id}`), (s) => { const d = s.val(); if (d) { setGodMessages(Object.entries(d).map(([id, v]: [string, any]) => ({ id, ...v })).sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0))); } else setGodMessages([]); }); return () => u(); }, [godSelectedUser, godSelectedChat]);

  // Load persisted god mode when entering chat
  useEffect(() => {
    if (!godSelectedUser || !godSelectedChat) return;
    const u = onValue(ref(db, `godmode/${godSelectedUser.uid}/${godSelectedChat.id}`), (s) => {
      const d = s.val();
      if (d?.mode && ["auto", "manual", "admin"].includes(d.mode)) setGodResponseMode(d.mode as GodModeType);
      else setGodResponseMode("auto");
    });
    return () => u();
  }, [godSelectedUser, godSelectedChat]);

  // Check pending tools
  useEffect(() => {
    if (!godSelectedChat) { setGodMusicPending(null); setGodPhotoPending(null); setGodSearchPending(null); return; }
    const u1 = onValue(ref(db, `godMusicPending/${godSelectedChat.id}`), (s) => { setGodMusicPending(s.val()?.messageKey || null); });
    const u2 = onValue(ref(db, `godPhotoPending/${godSelectedChat.id}`), (s) => { setGodPhotoPending(s.val()?.messageKey || null); });
    const u3 = onValue(ref(db, `godSearchPending/${godSelectedChat.id}`), (s) => { setGodSearchPending(s.val()?.messageKey || null); });
    return () => { u1(); u2(); u3(); };
  }, [godSelectedChat]);

  const changeGodMode = async (m: GodModeType) => {
    setGodResponseMode(m);
    if (godSelectedUser && godSelectedChat) {
      await set(ref(db, `godmode/${godSelectedUser.uid}/${godSelectedChat.id}`), { mode: m, timestamp: Date.now() });
    }
  };

  useEffect(() => { godMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [godMessages]);

  // MODEL TOGGLE
  const handleToggleModel = async (modelId: string) => {
    const key = sanitizeKey(modelId);
    const currentlyDisabled = !!disabledModels[key];
    try {
      if (currentlyDisabled) {
        await set(ref(db, `disabledModels/${key}`), null);
      } else {
        await set(ref(db, `disabledModels/${key}`), true);
      }
    } catch (err) {
      console.error("Toggle model error:", err);
      alert(t('admin.error') + ": " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const saveSettings = async () => { await set(ref(db, "settings"), settings); setSaved(true); };
  const openBanDialog = (uid: string, name: string) => { setBanDialog({ uid, name }); setBanReason(""); setBanDuration("60"); setBanPermanent(false); };
  const confirmBan = async () => { if (!banDialog) return; await set(ref(db, `bans/${banDialog.uid}`), { reason: banReason || t('admin.banReasonDefault'), duration: banPermanent ? 0 : parseInt(banDuration) || 60, bannedAt: Date.now() }); await update(ref(db, `users/${banDialog.uid}`), { banned: true }); setBanDialog(null); };
  const unbanUser = async (uid: string) => { await remove(ref(db, `bans/${uid}`)); await update(ref(db, `users/${uid}`), { banned: false }); };
  const deleteUser = async (uid: string) => { if (!confirm(t('admin.deleteConfirm'))) return; await remove(ref(db, `users/${uid}`)); await remove(ref(db, `chats/${uid}`)); await remove(ref(db, `messages/${uid}`)); await remove(ref(db, `folders/${uid}`)); await remove(ref(db, `godmode/${uid}`)); await remove(ref(db, `bans/${uid}`)); };
  const changePlan = async (uid: string, plan: string) => { await update(ref(db, `users/${uid}`), { plan }); };
  const handleHourClick = (ci: number, hi: number) => { if (selectedHour?.compIdx === ci && selectedHour?.hourIdx === hi) setSelectedHour(null); else setSelectedHour({ compIdx: ci, hourIdx: hi }); };
  const setHourStatus = async (status: UptimeStatus) => { if (!selectedHour) return; const u = [...componentUptimes]; u[selectedHour.compIdx].hours[selectedHour.hourIdx] = status; setComponentUptimes(u); await set(ref(db, `uptime/${u[selectedHour.compIdx].key}`), u[selectedHour.compIdx].hours); setSelectedHour(null); };
  const getUptimePercent = (h: UptimeStatus[]) => ((h.filter(x => x === "operational").length / h.length) * 100).toFixed(1);
  const getCurrentStatus = (h: UptimeStatus[]): UptimeStatus => h[h.length - 1];

  const handleGodFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (!f || !f.type.startsWith("image/") || f.size > 5 * 1024 * 1024) return; setGodImageFile(f); const r = new FileReader(); r.onload = () => setGodImagePreview(r.result as string); r.readAsDataURL(f); if (e.target) e.target.value = ""; };
  const clearGodImage = () => { setGodImageFile(null); setGodImagePreview(null); };
  const handleGodMusicFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (!f || f.size > 15 * 1024 * 1024) return; setGodMusicFile(f); setGodMusicFileName(f.name); if (e.target) e.target.value = ""; };
  const handleGodPhotoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (!f || !f.type.startsWith("image/") || f.size > 5 * 1024 * 1024) return; setGodPhotoFile(f); const r = new FileReader(); r.onload = () => setGodPhotoPreview(r.result as string); r.readAsDataURL(f); if (e.target) e.target.value = ""; };

  const msgsPath = () => godSelectedUser && godSelectedChat ? `messages/${godSelectedUser.uid}/${godSelectedChat.id}` : null;
  const chatPath = () => godSelectedUser && godSelectedChat ? `chats/${godSelectedUser.uid}/${godSelectedChat.id}` : null;
  const incCount = async () => { const cp = chatPath(); if (cp && godSelectedChat) await update(ref(db, cp), { lastMessage: Date.now(), messageCount: (godSelectedChat.messageCount || 0) + 1 }); };

  // Tool: Search
  const startSearch = async () => { const mp = msgsPath(); if (!mp || !godSelectedChat) return; const m = await push(ref(db, mp), { role: "assistant", content: "", model: godSelectedChat.model, timestamp: Date.now(), type: "search_pending" }); if (m.key) { await set(ref(db, `godSearchPending/${godSelectedChat.id}`), { messageKey: m.key }); await incCount(); } setGodSearchSources([]); };
  const addSearchSource = async () => {
    if (!godSourceUrl.trim()) return;
    const url = godSourceUrl.trim(); setGodFetchingMeta(true);
    let title = url; let description = "";
    try { const resp = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000) }); const html = await resp.text(); const doc = new DOMParser().parseFromString(html, "text/html"); const pt = doc.querySelector("title")?.textContent?.trim(); if (pt) title = pt; const md = doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim(); const og = doc.querySelector('meta[property="og:description"]')?.getAttribute("content")?.trim(); description = md || og || ""; } catch { try { title = new URL(url).hostname; } catch { } }
    setGodFetchingMeta(false); setGodSearchSources(p => [...p, { url, title, description }]); setGodSourceUrl("");
  };
  const finishSearch = async () => { if (!godSelectedUser || !godSelectedChat || !godSearchPending) return; await update(ref(db, `messages/${godSelectedUser.uid}/${godSelectedChat.id}/${godSearchPending}`), { type: "search_done", sources: godSearchSources, content: "" }); await remove(ref(db, `godSearchPending/${godSelectedChat.id}`)); setGodSearchSources([]); };

  // Load project files for current chat
  useEffect(() => {
    if (!godSelectedChat) { setGodProjectFiles({}); return; }
    const u = onValue(ref(db, `projectFiles/${godSelectedChat.id}`), (s) => {
      const d = s.val();
      if (d && typeof d === "object") setGodProjectFiles(d);
      else setGodProjectFiles({});
    });
    return () => u();
  }, [godSelectedChat]);

  // Tool: Code - Create
  const sendCodeCreate = async () => {
    if (!godCodePath.trim() || !godCodeContent.trim()) return;
    const mp = msgsPath(); if (!mp || !godSelectedChat) return;
    const path = godCodePath.trim();
    const content = godCodeContent.trim();
    const m = await push(ref(db, mp), { role: "assistant", content: "", model: godSelectedChat.model, timestamp: Date.now(), type: "code_action", actions: [{ action: "create", path }] });
    await incCount();
    try {
      await push(ref(db, `projectFiles/${godSelectedChat.id}`), { path, content });
      if (m.key) await update(ref(db, `${mp}/${m.key}/actions/0`), { success: true, content });
    } catch {
      if (m.key) await update(ref(db, `${mp}/${m.key}/actions/0`), { success: false });
    }
    setGodCodePath(""); setGodCodeContent("");
  };

  // Tool: Code - Edit
  const sendCodeEdit = async () => {
    if (!godSelectedFile || !godCodeContent.trim()) return;
    const mp = msgsPath(); if (!mp || !godSelectedChat) return;
    const fileData = godProjectFiles[godSelectedFile];
    if (!fileData) return;
    const content = godCodeContent.trim();
    const m = await push(ref(db, mp), { role: "assistant", content: "", model: godSelectedChat.model, timestamp: Date.now(), type: "code_action", actions: [{ action: "edit", path: fileData.path }] });
    await incCount();
    try {
      await update(ref(db, `projectFiles/${godSelectedChat.id}/${godSelectedFile}`), { content });
      if (m.key) await update(ref(db, `${mp}/${m.key}/actions/0`), { success: true, content });
    } catch {
      if (m.key) await update(ref(db, `${mp}/${m.key}/actions/0`), { success: false });
    }
    setGodCodeContent("");
  };

  // Tool: Code - Read
  const sendCodeRead = async () => {
    if (!godSelectedFile) return;
    const mp = msgsPath(); if (!mp || !godSelectedChat) return;
    const fileData = godProjectFiles[godSelectedFile];
    if (!fileData) return;
    const m = await push(ref(db, mp), { role: "assistant", content: "", model: godSelectedChat.model, timestamp: Date.now(), type: "code_action", actions: [{ action: "read", path: fileData.path }] });
    await incCount();
    if (m.key) await update(ref(db, `${mp}/${m.key}/actions/0`), { success: godCodeSuccess });
  };

  // Tool: Code - Delete
  const sendCodeDelete = async () => {
    if (!godSelectedFile) return;
    const mp = msgsPath(); if (!mp || !godSelectedChat) return;
    const fileData = godProjectFiles[godSelectedFile];
    if (!fileData) return;
    const m = await push(ref(db, mp), { role: "assistant", content: "", model: godSelectedChat.model, timestamp: Date.now(), type: "code_action", actions: [{ action: "delete", path: fileData.path }] });
    await incCount();
    try {
      await remove(ref(db, `projectFiles/${godSelectedChat.id}/${godSelectedFile}`));
      if (m.key) await update(ref(db, `${mp}/${m.key}/actions/0`), { success: true });
    } catch {
      if (m.key) await update(ref(db, `${mp}/${m.key}/actions/0`), { success: false });
    }
    setGodSelectedFile(null); setGodCodeContent("");
  };

  // Tool: Photo
  const startPhotoGeneration = async () => { const mp = msgsPath(); if (!mp || !godSelectedChat) return; const m = await push(ref(db, mp), { role: "assistant", content: "", model: godSelectedChat.model, timestamp: Date.now(), type: "photo_pending" }); if (m.key) { await set(ref(db, `godPhotoPending/${godSelectedChat.id}`), { messageKey: m.key }); await incCount(); } };
  const finishPhotoGeneration = async () => { if (!godSelectedUser || !godSelectedChat || !godPhotoPending || !godPhotoFile) return; setGodUploadingPhoto(true); try { const base64 = await fileToBase64(godPhotoFile); await update(ref(db, `messages/${godSelectedUser.uid}/${godSelectedChat.id}/${godPhotoPending}`), { type: "photo", imageUrl: base64, content: "" }); await remove(ref(db, `godPhotoPending/${godSelectedChat.id}`)); setGodPhotoFile(null); setGodPhotoPreview(null); } catch (err) { console.error(err); alert("Ошибка загрузки"); } setGodUploadingPhoto(false); };

  // Tool: Music
  const startMusicGeneration = async () => { const mp = msgsPath(); if (!mp || !godSelectedChat) return; const m = await push(ref(db, mp), { role: "assistant", content: "", model: godSelectedChat.model, timestamp: Date.now(), type: "music_generating" }); if (m.key) { await set(ref(db, `godMusicPending/${godSelectedChat.id}`), { messageKey: m.key }); await incCount(); } };
  const finishMusicGeneration = async () => { if (!godSelectedUser || !godSelectedChat || !godMusicPending || !godMusicFile) return; setGodUploadingMusic(true); try { const base64 = await fileToBase64(godMusicFile); await update(ref(db, `messages/${godSelectedUser.uid}/${godSelectedChat.id}/${godMusicPending}`), { type: "music", audioUrl: base64, content: "🎵 Музыка" }); await remove(ref(db, `godMusicPending/${godSelectedChat.id}`)); setGodMusicFile(null); setGodMusicFileName(null); } catch (err) { console.error(err); alert("Ошибка загрузки"); } setGodUploadingMusic(false); };

  // God send text message
  const godSendMessage = async () => { if ((!godInput.trim() && !godImageFile) || !godSelectedUser || !godSelectedChat) return; const text = godInput.trim(); setGodInput(""); let imageUrl: string | undefined; if (godImageFile) { setGodUploadingImage(true); try { imageUrl = await fileToBase64(godImageFile); } catch (err) { console.error(err); } setGodUploadingImage(false); clearGodImage(); } const mp = msgsPath(); if (!mp) return; const msgData: any = { timestamp: Date.now() }; if (text) msgData.content = text; if (imageUrl) msgData.imageUrl = imageUrl; if (godResponseMode === "manual") { msgData.role = "assistant"; msgData.model = godSelectedChat.model; } else if (godResponseMode === "admin") { msgData.role = "admin"; msgData.model = "admin"; } await push(ref(db, mp), msgData); await incCount(); };

  const godExitChat = () => { setGodSelectedChat(null); setGodMessages([]); setGodMusicPending(null); setGodPhotoPending(null); setGodSearchPending(null); setGodMusicFile(null); setGodMusicFileName(null); setGodPhotoFile(null); setGodPhotoPreview(null); setGodSearchSources([]); setGodShowCodePanel(false); setGodCodePath(""); setGodCodeContent(""); setGodSelectedFile(null); setGodProjectFiles({}); };
  const godExitUser = () => { setGodSelectedUser(null); godExitChat(); };
  const godExitMode = () => { setGodMode(false); godExitUser(); setGodResponseMode("auto"); };

  const filteredUsers = users.filter(u => u.displayName.toLowerCase().includes(searchUser.toLowerCase()) || u.email.toLowerCase().includes(searchUser.toLowerCase()) || u.uid.toLowerCase().includes(searchUser.toLowerCase()));
  const getModelName = (id: string) => adminModels.find(m => m.id === id)?.name || id;
  const filteredTickets = allTickets.filter(t => ticketFilter === "all" || t.status === ticketFilter);

  // LOGIN
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#050507] text-zinc-100 flex items-center justify-center px-6">
        <div className="w-full max-w-xs">
          <button onClick={() => navigate("/chat")} className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors mb-10"><Back className="w-3.5 h-3.5" /> {t('common.back')}</button>
          <div className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-6"><Lock className="w-4 h-4 text-violet-400" /><h1 className="font-semibold text-sm">{t('admin.title')}</h1></div>
            <form onSubmit={handleLogin} className="space-y-3">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('admin.passwordPlaceholder')} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40" autoFocus />
              {error && <p className="text-xs text-red-400">{error === "Неверный пароль" ? t('admin.invalidPassword') : error}</p>}
              <button type="submit" className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors">{t('admin.loginBtn')}</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // VIEW AS USER — full panel inside admin, reads target user data from Firebase
  if (viewingAsUser) {
    return <ViewAsUserPanel targetUser={viewingAsUser} onExit={() => setViewingAsUser(null)} />;
  }

  // GOD MODE
  if (godMode) {
    return (
      <div className="h-screen bg-[#050507] text-zinc-100 flex flex-col overflow-hidden">
        <input ref={godFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleGodFileSelect} />
        <input ref={godMusicInputRef} type="file" accept="audio/*" className="hidden" onChange={handleGodMusicFileSelect} />
        <input ref={godPhotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleGodPhotoFileSelect} />
        <div className="border-b border-white/[0.04] shrink-0">
          <div className="px-4 h-12 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={godExitMode} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"><Back className="w-3.5 h-3.5" /> {t('admin.exit')}</button>
              <span className="text-white/[0.08]">|</span>
              <div className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5 text-red-400" /><span className="text-xs font-medium text-red-400">{t('admin.godMode')}</span></div>
              {godSelectedUser && <><span className="text-white/[0.08]">|</span><span className="text-xs text-zinc-500">{godSelectedUser.visibleNick || godSelectedUser.displayName}</span></>}
              {godSelectedChat && <><span className="text-white/[0.08]">→</span><span className="text-xs text-zinc-400">{godSelectedChat.title}</span></>}
            </div>
            {godSelectedChat && (
              <div className="flex items-center gap-1 bg-white/[0.02] border border-white/[0.06] rounded-xl p-0.5">
                {([{ mode: "auto" as GodModeType, label: t('admin.auto'), icon: Bot }, { mode: "manual" as GodModeType, label: t('admin.manual'), icon: Send }, { mode: "admin" as GodModeType, label: t('admin.admin'), icon: Shield }]).map((m) => (
                  <button key={m.mode} onClick={() => changeGodMode(m.mode)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${godResponseMode === m.mode ? m.mode === "auto" ? "bg-emerald-500/10 text-emerald-400" : m.mode === "manual" ? "bg-violet-500/10 text-violet-400" : "bg-red-500/10 text-red-400" : "text-zinc-600 hover:text-zinc-400"}`}><m.icon className="w-3 h-3" /> {m.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {!godSelectedUser && (
            <div className="flex-1 overflow-y-auto p-6">
              <h2 className="text-sm font-medium mb-4">{t('admin.selectUser')}</h2>
              <div className="relative max-w-sm mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" /><input type="text" value={searchUser} onChange={(e) => setSearchUser(e.target.value)} placeholder={t('admin.searchPlaceholder')} className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">{filteredUsers.map((u) => (<button key={u.uid} onClick={() => { setGodSelectedUser(u); setGodSelectedChat(null); }} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.04] hover:border-violet-500/20 bg-white/[0.01] transition-all text-left"><div className="w-8 h-8 rounded-lg bg-violet-600/10 flex items-center justify-center text-xs font-medium text-violet-400 shrink-0">{(u.visibleNick || u.displayName)[0]?.toUpperCase() || "U"}</div><div className="min-w-0 flex-1"><p className="text-xs font-medium truncate">{u.visibleNick || u.displayName}</p><p className="text-[10px] text-zinc-700 truncate">{u.email}</p></div></button>))}</div>
            </div>
          )}

          {godSelectedUser && !godSelectedChat && (
            <div className="flex-1 overflow-y-auto p-6">
              <button onClick={godExitUser} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-4"><Back className="w-3 h-3" /> {t('common.back')}</button>
              <h2 className="text-sm font-medium mb-1">{t('admin.chats')} — {godSelectedUser.visibleNick || godSelectedUser.displayName}</h2>
              <p className="text-xs text-zinc-600 mb-4">{godChats.length} {t('admin.found')}</p>
              {godFolders.map((folder: any) => { const fc = godChats.filter((c: any) => c.folderId === folder.id); const col = godCollapsedFolders.has(folder.id); return (<div key={folder.id} className="mb-2"><button onClick={() => { const n = new Set(godCollapsedFolders); col ? n.delete(folder.id) : n.add(folder.id); setGodCollapsedFolders(n); }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 w-full text-left transition-colors"><ChevronRight className={`w-3 h-3 transition-transform duration-200 ${!col ? "rotate-90" : ""}`} /><Folder className="w-3.5 h-3.5 text-violet-400/60" /><span className="font-medium">{folder.name}</span><span className="text-[10px] text-zinc-700 ml-auto">{fc.length}</span></button>{!col && <div className="pl-6 space-y-1 mt-1">{fc.map((ch: any) => (<button key={ch.id} onClick={() => setGodSelectedChat(ch)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left border border-white/[0.04] hover:border-violet-500/20 transition-all"><MessageSquare className="w-3.5 h-3.5 text-zinc-600 shrink-0" /><div className="min-w-0 flex-1"><p className="text-xs font-medium truncate">{ch.title}</p><p className="text-[10px] text-zinc-700">{getModelName(ch.model)} · {ch.messageCount} {t('admin.messages').toLowerCase()}</p></div></button>))}</div>}</div>); })}
              <div className="space-y-1 mt-2">{godChats.filter((c: any) => !c.folderId).map((ch: any) => (<button key={ch.id} onClick={() => setGodSelectedChat(ch)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left border border-white/[0.04] hover:border-violet-500/20 transition-all"><MessageSquare className="w-3.5 h-3.5 text-zinc-600 shrink-0" /><div className="min-w-0 flex-1"><p className="text-xs font-medium truncate">{ch.title}</p><p className="text-[10px] text-zinc-700">{getModelName(ch.model)} · {ch.messageCount} {t('admin.messages').toLowerCase()}</p></div></button>))}</div>
              {godChats.length === 0 && <div className="text-center py-16 text-xs text-zinc-700">{t('admin.noChats')}</div>}
            </div>
          )}

          {godSelectedUser && godSelectedChat && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-2 border-b border-white/[0.04] flex items-center gap-3 shrink-0">
                <button onClick={godExitChat} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"><Back className="w-3 h-3" /> {t('admin.chats')}</button>
                <span className="text-white/[0.06]">|</span><span className="text-xs font-medium">{godSelectedChat.title}</span>
                <div className="ml-auto flex items-center gap-1.5"><div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium ${godResponseMode === "auto" ? "bg-emerald-500/10 text-emerald-400" : godResponseMode === "manual" ? "bg-violet-500/10 text-violet-400" : "bg-red-500/10 text-red-400"}`}><Radio className="w-2.5 h-2.5" />{godResponseMode === "auto" ? t('admin.aiResponding') : godResponseMode === "manual" ? t('admin.youAsAi') : t('admin.youAsAdmin')}</div></div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="max-w-2xl mx-auto space-y-4">
                  {godMessages.map((msg: any) => (
                    <div key={msg.id} className={msg.role === "user" ? "flex justify-end" : ""}>
                      {msg.role === "user" ? (
                        <div className="max-w-[80%]">
                          {msg.imageUrl && <div className="mb-2 flex justify-end"><img src={String(msg.imageUrl)} alt="" className="max-w-[300px] max-h-[300px] rounded-xl object-cover border border-white/[0.06]" /></div>}
                          {msg.content && <div className="bg-violet-600/15 text-zinc-100 px-4 py-3 rounded-2xl rounded-br-md text-sm"><span className="whitespace-pre-wrap">{String(msg.content)}</span></div>}
                          {msg.tool && <div className="flex justify-end mt-1"><span className="text-[9px] text-zinc-600 bg-white/[0.03] px-2 py-0.5 rounded-full flex items-center gap-1">{msg.tool === "search" && <Search className="w-2.5 h-2.5" />}{msg.tool === "code" && <Code className="w-2.5 h-2.5" />}{msg.tool === "photo" && <ImageIcon className="w-2.5 h-2.5" />}{msg.tool === "music" && <Music className="w-2.5 h-2.5" />}{t('admin.tool')}: {TOOL_LABELS[String(msg.tool)] || msg.tool}</span></div>}
                        </div>
                      ) : msg.role === "admin" ? (
                        <div className="max-w-[80%]">
                          <div className="flex items-center gap-2 mb-1.5"><Shield className="w-4 h-4 text-red-400" /><span className="text-[11px] font-medium text-red-400">{t('admin.admin')}</span></div>
                          {msg.imageUrl && <img src={String(msg.imageUrl)} alt="" className="max-w-[300px] max-h-[300px] rounded-xl object-cover border border-red-500/10 mb-2" />}
                          <div className="bg-red-600/5 border border-red-500/10 text-zinc-300 px-4 py-3 rounded-2xl rounded-tl-md text-sm"><MarkdownRenderer content={String(msg.content || "")} /></div>
                        </div>
                      ) : (
                        <div className="max-w-[80%]">
                          <div className="flex items-center gap-2 mb-1.5"><AdminModelLogo modelId={msg.model || ""} size={18} /><span className="text-[11px] font-medium text-zinc-400">{getModelName(String(msg.model || ""))}</span></div>
                          {msg.type === "music_generating" ? (
                            <div className="flex items-center gap-3 bg-violet-600/5 border border-violet-500/10 rounded-2xl px-5 py-4 max-w-[300px]"><Music className="w-5 h-5 text-violet-400 animate-spin" style={{ animationDuration: "3s" }} /><div><p className="text-sm text-violet-400 animate-pulse">{t('admin.generatingMusic')}</p></div></div>
                          ) : msg.type === "music" && msg.audioUrl ? (<AdminAudioPlayer url={String(msg.audioUrl)} />
                          ) : msg.type === "search_pending" ? (
                            <div className="flex items-center gap-3 bg-blue-600/5 border border-blue-500/10 rounded-2xl px-5 py-4 max-w-[300px]"><Search className="w-5 h-5 text-blue-400 animate-search-spin" /><p className="text-sm text-blue-400 animate-pulse">{t('admin.searchingWeb')}</p></div>
                          ) : msg.type === "search_done" ? (
                            <div className="flex items-center gap-3 bg-blue-600/5 border border-blue-500/10 rounded-2xl px-5 py-4 max-w-[300px]"><Search className="w-5 h-5 text-blue-400" /><p className="text-sm text-blue-400">{t('admin.searchFinished')}</p></div>
                          ) : msg.type === "photo_pending" ? (
                            <div className="w-[180px] h-[180px] rounded-2xl bg-zinc-800/50 border border-white/[0.06] flex flex-col items-center justify-center gap-3"><ImageIcon className="w-8 h-8 text-zinc-500" /><p className="text-xs text-zinc-500 animate-pulse">{t('admin.generating')}</p></div>
                          ) : msg.type === "photo" && msg.imageUrl ? (
                            <img src={String(msg.imageUrl)} alt="" className="max-w-[300px] max-h-[300px] rounded-2xl object-cover border border-white/[0.06]" />
                          ) : msg.type === "code_action" ? (() => {
                            const acts: any[] = Array.isArray(msg.actions) ? msg.actions : (msg.actions ? Object.values(msg.actions) : []);
                            return (<div className="space-y-1.5">{acts.map((a: any, i: number) => (<div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${a.success !== false ? "border-emerald-500/10 bg-emerald-600/5" : "border-red-500/10 bg-red-600/5"}`}><span className="text-[11px] font-medium text-zinc-400 capitalize w-14">{String(a.action || "")}</span><span className="text-[11px] text-zinc-500 font-mono truncate flex-1">{String(a.path || "")}</span>{a.success !== false ? <Check className="w-3 h-3 text-emerald-400" /> : <XIcon className="w-3 h-3 text-red-400" />}</div>))}</div>);
                          })() : (
                            <>{msg.imageUrl && <img src={String(msg.imageUrl)} alt="" className="max-w-[300px] max-h-[300px] rounded-xl object-cover border border-white/[0.06] mb-2" />}{msg.audioUrl && <div className="mb-2"><AdminAudioPlayer url={String(msg.audioUrl)} /></div>}<div className="text-zinc-300 text-sm"><MarkdownRenderer content={String(msg.content || "")} /></div></>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={godMessagesEndRef} />
                </div>
              </div>

              {/* God mode input */}
              {godResponseMode !== "auto" ? (
                <div className="p-4 border-t border-white/[0.04] shrink-0">
                  <div className="max-w-2xl mx-auto space-y-3">
                    {godSearchPending && (
                      <div className="border border-blue-500/20 bg-blue-600/5 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-2"><Search className="w-4 h-4 text-blue-400" /><span className="text-xs font-medium text-blue-400">{t('admin.searchAddSources')}</span></div>
                        <div className="flex items-center gap-2">
                          <input value={godSourceUrl} onChange={(e) => setGodSourceUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addSearchSource(); }} placeholder="URL" className="flex-1 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs text-white placeholder-zinc-700 focus:outline-none" />
                          <button onClick={addSearchSource} disabled={!godSourceUrl.trim() || godFetchingMeta} className="px-3 py-2 rounded-lg bg-blue-600/10 text-blue-400 text-[11px] font-medium hover:bg-blue-600/20 disabled:opacity-40 transition-all">{godFetchingMeta ? "..." : `+ ${t('admin.add')}`}</button>
                        </div>
                        {godSearchSources.length > 0 && <div className="space-y-1">{godSearchSources.map((s, i) => (<div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.02] text-xs text-zinc-400"><span className="truncate flex-1">{s.title}</span><button onClick={() => setGodSearchSources(p => p.filter((_, j) => j !== i))} className="text-zinc-600 hover:text-red-400"><XIcon className="w-3 h-3" /></button></div>))}</div>}
                        <button onClick={finishSearch} className="w-full py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 transition-all">{t('admin.finishSearch')} ({godSearchSources.length})</button>
                      </div>
                    )}
                    {godMusicPending && (
                      <div className="border border-violet-500/20 bg-violet-600/5 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3"><Music className="w-4 h-4 text-violet-400" /><span className="text-xs font-medium text-violet-400">{t('admin.musicPending')}</span></div>
                        {godMusicFileName ? (<div className="space-y-2"><div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]"><Music className="w-3.5 h-3.5 text-violet-400" /><span className="text-xs text-zinc-400 truncate flex-1">{godMusicFileName}</span><button onClick={() => { setGodMusicFile(null); setGodMusicFileName(null); }} className="text-zinc-600 hover:text-red-400"><XIcon className="w-3 h-3" /></button></div><button onClick={finishMusicGeneration} disabled={godUploadingMusic} className="w-full py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 disabled:opacity-50 transition-all">{godUploadingMusic ? t('admin.uploading') : t('admin.sendMusic')}</button></div>) : (<button onClick={() => godMusicInputRef.current?.click()} className="w-full py-2.5 rounded-lg border border-dashed border-violet-500/30 text-xs text-violet-400 hover:bg-violet-600/5 transition-all">{t('admin.uploadAudio')}</button>)}
                      </div>
                    )}
                    {godPhotoPending && (
                      <div className="border border-emerald-500/20 bg-emerald-600/5 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3"><ImageIcon className="w-4 h-4 text-emerald-400" /><span className="text-xs font-medium text-emerald-400">{t('admin.photoPending')}</span></div>
                        {godPhotoPreview ? (<div className="space-y-2"><div className="relative inline-block"><img src={godPhotoPreview} alt="" className="w-32 h-32 rounded-xl object-cover border border-white/[0.06]" /><button onClick={() => { setGodPhotoFile(null); setGodPhotoPreview(null); }} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 border border-white/[0.1] rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-red-600 transition-all"><XIcon className="w-3 h-3" /></button></div><button onClick={finishPhotoGeneration} disabled={godUploadingPhoto} className="w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 disabled:opacity-50 transition-all">{godUploadingPhoto ? t('admin.uploading') : t('admin.sendPhoto')}</button></div>) : (<button onClick={() => godPhotoInputRef.current?.click()} className="w-full py-2.5 rounded-lg border border-dashed border-emerald-500/30 text-xs text-emerald-400 hover:bg-emerald-600/5 transition-all">{t('admin.uploadImage')}</button>)}
                      </div>
                    )}
                    {!godSearchPending && !godMusicPending && !godPhotoPending && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={startSearch} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-blue-400 border border-blue-500/20 hover:bg-blue-600/10 transition-all"><Search className="w-3.5 h-3.5" /> {t('admin.toolSearch')}</button>
                        <button onClick={startPhotoGeneration} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600/10 transition-all"><ImageIcon className="w-3.5 h-3.5" /> {t('admin.toolPhoto')}</button>
                        <button onClick={startMusicGeneration} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-violet-400 border border-violet-500/20 hover:bg-violet-600/10 transition-all"><Music className="w-3.5 h-3.5" /> {t('admin.toolMusic')}</button>
                        <button onClick={() => setGodShowCodePanel(!godShowCodePanel)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${godShowCodePanel ? "border-orange-500/30 bg-orange-600/10 text-orange-400" : "text-orange-400 border-orange-500/20 hover:bg-orange-600/10"}`}><Code className="w-3.5 h-3.5" /> {t('admin.toolCode')}</button>
                      </div>
                    )}
                    {godShowCodePanel && (
                      <div className="border border-orange-500/20 bg-orange-600/5 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Code className="w-4 h-4 text-orange-400" />
                          <span className="text-xs font-medium text-orange-400">{t('admin.codeTools')}</span>
                          <button onClick={() => setGodShowCodePanel(false)} className="ml-auto p-1 rounded hover:bg-white/[0.05] text-zinc-600"><XIcon className="w-3 h-3" /></button>
                        </div>
                        <div className="flex items-center gap-1 bg-white/[0.02] border border-white/[0.06] rounded-lg p-0.5">
                          {(["read", "create", "edit", "delete"] as const).map(m => (
                            <button key={m} onClick={() => { setGodCodeMode(m); setGodCodeContent(""); setGodSelectedFile(null); setGodCodePath(""); }}
                              className={`flex-1 px-2 py-1.5 rounded-md text-[10px] font-medium transition-all ${godCodeMode === m ? "bg-orange-500/15 text-orange-400" : "text-zinc-600 hover:text-zinc-400"}`}>
                              {m === "read" ? "Read" : m === "create" ? "Create" : m === "edit" ? "Edit" : "Delete"}
                            </button>
                          ))}
                        </div>
                        {Object.keys(godProjectFiles).length > 0 && (
                          <div>
                            <p className="text-[10px] text-zinc-600 mb-1.5">{t('admin.projectFiles')} ({Object.keys(godProjectFiles).length})</p>
                            <div className="space-y-0.5 max-h-32 overflow-y-auto">
                              {Object.entries(godProjectFiles).map(([key, file]) => (
                                <button key={key} onClick={() => {
                                  setGodSelectedFile(key);
                                  if (godCodeMode === "edit") setGodCodeContent(file.content);
                                }} className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[11px] transition-all ${godSelectedFile === key ? "bg-orange-500/10 text-orange-400" : "text-zinc-500 hover:bg-white/[0.02]"}`}>
                                  <Code className="w-3 h-3 shrink-0" />
                                  <span className="font-mono truncate">{file.path}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {godCodeMode === "create" && (
                          <div className="space-y-2">
                            <input value={godCodePath} onChange={(e) => setGodCodePath(e.target.value)} placeholder="src/App.tsx" className="w-full px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-[11px] text-white font-mono placeholder-zinc-700 focus:outline-none focus:border-orange-500/30" />
                            <textarea value={godCodeContent} onChange={(e) => setGodCodeContent(e.target.value)} placeholder={t('admin.fileContentPlaceholder')} rows={6} className="w-full px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-[11px] text-white font-mono placeholder-zinc-700 focus:outline-none focus:border-orange-500/30 resize-none" />
                            <button onClick={sendCodeCreate} disabled={!godCodePath.trim() || !godCodeContent.trim()} className="w-full py-2 rounded-lg bg-orange-600 text-white text-xs font-medium hover:bg-orange-500 disabled:opacity-40 transition-all">{t('admin.createFile')}</button>
                          </div>
                        )}
                        {godCodeMode === "edit" && (
                          <div className="space-y-2">
                            {!godSelectedFile ? <p className="text-[10px] text-zinc-600">Выберите файл из списка выше</p> : (
                              <>
                                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                                  <Code className="w-3 h-3 text-orange-400" />
                                  <span className="text-[11px] font-mono text-zinc-400">{godProjectFiles[godSelectedFile]?.path}</span>
                                </div>
                                <textarea value={godCodeContent} onChange={(e) => setGodCodeContent(e.target.value)} rows={6} className="w-full px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-[11px] text-white font-mono placeholder-zinc-700 focus:outline-none focus:border-orange-500/30 resize-none" />
                                <button onClick={sendCodeEdit} disabled={!godCodeContent.trim()} className="w-full py-2 rounded-lg bg-orange-600 text-white text-xs font-medium hover:bg-orange-500 disabled:opacity-40 transition-all">{t('admin.editFile')}</button>
                              </>
                            )}
                          </div>
                        )}
                        {godCodeMode === "read" && (
                          <div className="space-y-2">
                            {!godSelectedFile ? <p className="text-[10px] text-zinc-600">Выберите файл из списка выше</p> : (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                                  <Code className="w-3 h-3 text-orange-400" />
                                  <span className="text-[11px] font-mono text-zinc-400">{godProjectFiles[godSelectedFile]?.path}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => setGodCodeSuccess(!godCodeSuccess)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${godCodeSuccess ? "border-emerald-500/20 bg-emerald-600/10 text-emerald-400" : "border-red-500/20 bg-red-600/10 text-red-400"}`}>
                                    {godCodeSuccess ? <Check className="w-3 h-3" /> : <XIcon className="w-3 h-3" />}
                                    {godCodeSuccess ? t('admin.success') : t('admin.error')}
                                  </button>
                                  <button onClick={sendCodeRead} className="flex-1 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-medium hover:bg-orange-500 transition-all">Read</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {godCodeMode === "delete" && (
                          <div className="space-y-2">
                            {!godSelectedFile ? <p className="text-[10px] text-zinc-600">Выберите файл из списка выше</p> : (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-red-600/5 border border-red-500/10">
                                  <Trash2 className="w-3 h-3 text-red-400" />
                                  <span className="text-[11px] font-mono text-red-400">{godProjectFiles[godSelectedFile]?.path}</span>
                                </div>
                                <button onClick={sendCodeDelete} className="w-full py-2 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-500 transition-all">{t('admin.deleteFile')}</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {godImagePreview && (<div className="flex items-start gap-2"><div className="relative"><img src={godImagePreview} alt="" className="w-16 h-16 rounded-xl object-cover border border-white/[0.06]" /><button onClick={clearGodImage} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 border border-white/[0.1] rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-red-600 transition-all"><XIcon className="w-3 h-3" /></button></div></div>)}
                    <div className={`flex items-end gap-2 border rounded-2xl px-4 py-3 transition-all ${godResponseMode === "manual" ? "border-violet-500/20 bg-violet-600/5" : "border-red-500/20 bg-red-600/5"}`}>
                      {godResponseMode === "manual" ? <Bot className="w-3.5 h-3.5 text-violet-400 shrink-0" /> : <Shield className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                      <button onClick={() => godFileInputRef.current?.click()} className="p-1.5 rounded-lg shrink-0 text-zinc-500 hover:text-zinc-300 transition-all"><ImageIcon className="w-4 h-4" /></button>
                      <textarea value={godInput} onChange={(e) => setGodInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); godSendMessage(); } }}
                        placeholder={godResponseMode === "manual" ? t('admin.sendAs', { name: getModelName(godSelectedChat.model) }) : t('admin.sendAsAdmin')}
                        rows={1} className="flex-1 bg-transparent text-sm placeholder-zinc-700 focus:outline-none resize-none max-h-32 min-h-[20px]" style={{ height: "20px" }}
                        onInput={(e) => { const el = e.target as HTMLTextAreaElement; el.style.height = "20px"; el.style.height = Math.min(el.scrollHeight, 128) + "px"; }} />
                      <button onClick={godSendMessage} disabled={!godInput.trim() && !godImageFile} className={`p-2 rounded-xl transition-all disabled:opacity-30 ${godResponseMode === "manual" ? "text-violet-400 hover:bg-violet-600/10" : "text-red-400 hover:bg-red-600/10"}`}><Send className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 border-t border-white/[0.04] shrink-0"><div className="max-w-2xl mx-auto text-center"><p className="text-xs text-zinc-600">{t('admin.observationMode')}</p></div></div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // MAIN ADMIN PANEL
  const tabs = [
    { id: "dashboard" as const, label: t('admin.dashboard') }, { id: "users" as const, label: t('admin.users') },
    { id: "tickets" as const, label: `${t('admin.tickets')}${allTickets.filter(t => t.status === "open").length > 0 ? ` (${allTickets.filter(t => t.status === "open").length})` : ""}` },
    { id: "payments" as const, label: `${t('admin.payments')}${payments.length > 0 ? ` (${payments.length})` : ""}` },
    { id: "uptime" as const, label: t('admin.uptime') }, { id: "settings" as const, label: t('admin.settings') }, { id: "models" as const, label: t('admin.models') },
  ];

  return (
    <div className="min-h-screen bg-[#050507] text-zinc-100">
      {banDialog && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setBanDialog(null)}><div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-[#111114] border border-white/[0.06] rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up"><div className="p-6 space-y-4"><div className="flex items-center gap-2"><Ban className="w-4 h-4 text-red-400" /><h2 className="text-sm font-semibold">{t('admin.ban')} {banDialog.name}</h2></div><div><label className="block text-xs text-zinc-500 mb-1.5">{t('admin.banReason')}</label><input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder={t('admin.banReason')} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-red-500/40" /></div><div><label className="block text-xs text-zinc-500 mb-1.5">{t('admin.banDuration')}</label><div className="flex items-center gap-3"><input type="number" value={banDuration} onChange={(e) => setBanDuration(e.target.value)} disabled={banPermanent} className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm focus:outline-none disabled:opacity-30" /><label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none"><input type="checkbox" checked={banPermanent} onChange={(e) => setBanPermanent(e.target.checked)} className="rounded border-zinc-700" />{t('admin.permanent')}</label></div><div className="flex gap-2 mt-2">{[30, 60, 1440, 10080].map((m) => (<button key={m} onClick={() => { setBanDuration(String(m)); setBanPermanent(false); }} className="px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04] text-[10px] text-zinc-500 hover:text-zinc-300 transition-all">{m < 60 ? `${m}${t('chat.seconds') === "s" ? "m" : "м"}` : m < 1440 ? `${m / 60}${t('chat.seconds') === "s" ? "h" : "ч"}` : `${m / 1440}${t('chat.seconds') === "s" ? "d" : "д"}`}</button>))}</div></div><div className="flex gap-2 pt-2"><button onClick={() => setBanDialog(null)} className="flex-1 py-2.5 rounded-xl border border-white/[0.06] text-sm text-zinc-400 hover:text-zinc-200 transition-all">{t('common.cancel')}</button><button onClick={confirmBan} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-500 transition-all">{t('admin.ban')}</button></div></div></div></div>)}

      <div className="border-b border-white/[0.04] sticky top-0 z-40 bg-[#050507]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="w-6 h-6 bg-violet-600 rounded-md flex items-center justify-center"><span className="text-white font-bold text-[10px]">R</span></div><span className="text-white/[0.08]">|</span><span className="text-xs text-zinc-500 font-medium">{t('admin.title')}</span></div>
          <button onClick={() => navigate("/chat")} className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors">{t('admin.exit')}</button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex gap-1 mb-8 border-b border-white/[0.04] overflow-x-auto">{tabs.map((t) => (<button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${activeTab === t.id ? "text-violet-400 border-violet-500" : "text-zinc-600 border-transparent hover:text-zinc-400"}`}>{t.label}</button>))}</div>

        {activeTab === "dashboard" && (<div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[{ label: t('admin.visits'), value: stats.totalVisits, icon: TrendingUp, change: null }, { label: t('admin.totalUsers'), value: stats.totalUsers, icon: Users, change: stats.newUsersToday }, { label: t('admin.messages'), value: stats.totalMessages, icon: MessageCircle, change: stats.newMessagesToday }, { label: t('admin.chats'), value: stats.totalChats, icon: FolderOpen, change: stats.newChatsToday }].map((s) => (<div key={s.label} className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-5"><div className="flex items-center justify-between mb-3"><s.icon className="w-4 h-4 text-violet-400" />{s.change !== null && s.change > 0 && <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">+{s.change} {t('admin.today')}</span>}</div><div className="text-2xl font-bold mb-0.5">{s.value}</div><div className="text-xs text-zinc-600">{s.label}</div></div>))}</div>)}

        {activeTab === "users" && (<div className="space-y-4"><div className="flex items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" /><input type="text" value={searchUser} onChange={(e) => setSearchUser(e.target.value)} placeholder={t('admin.searchPlaceholder')} className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40" /></div><span className="text-xs text-zinc-600">{filteredUsers.length} {t('admin.found')}</span><div className="ml-auto"><button onClick={() => setGodMode(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/20 bg-red-600/5 text-red-400 text-xs font-medium hover:bg-red-600/10 transition-all"><Eye className="w-3.5 h-3.5" /> {t('admin.godModeBtn')}</button></div></div>
          <div className="border border-white/[0.04] rounded-2xl overflow-hidden"><table className="w-full"><thead><tr className="border-b border-white/[0.04]">{[t('admin.displayName'), t('admin.email'), t('admin.plan'), t('admin.language'), t('admin.status'), ""].map((h) => (<th key={h} className="text-left text-[10px] text-zinc-600 font-medium px-4 py-3 uppercase tracking-wider">{h}</th>))}</tr></thead><tbody>{filteredUsers.map((u) => (<tr key={u.uid} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors"><td className="px-4 py-3"><p className="text-xs font-medium">{u.visibleNick || u.displayName}</p><p className="text-[10px] text-zinc-700 font-mono">{u.uid.substring(0, 12)}…</p></td><td className="px-4 py-3 text-xs text-zinc-500">{u.email}</td><td className="px-4 py-3"><select value={u.plan} onChange={(e) => changePlan(u.uid, e.target.value)} className="appearance-none pl-2 pr-6 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[11px] text-zinc-300 focus:outline-none cursor-pointer"><option value="free" className="bg-[#111114]">Free</option><option value="pro" className="bg-[#111114]">Pro</option><option value="ultra" className="bg-[#111114]">Ultra</option></select></td><td className="px-4 py-3"><span className="text-[11px] text-zinc-500 uppercase font-mono">{u.language || "ru"}</span></td><td className="px-4 py-3"><span className={`text-[11px] font-medium ${u.banned ? "text-red-400" : "text-emerald-500"}`}>{u.banned ? t('admin.statusBanned') : t('admin.statusActive')}</span></td><td className="px-4 py-3"><div className="flex items-center gap-1"><button onClick={() => setViewingAsUser(u)} className="p-1.5 rounded-lg hover:bg-white/[0.03] text-zinc-600 hover:text-violet-400 transition-colors" title={t('admin.viewAsUser')}><Eye className="w-3.5 h-3.5" /></button>{u.banned ? <button onClick={() => unbanUser(u.uid)} className="p-1.5 rounded-lg hover:bg-white/[0.03] text-emerald-500 hover:text-emerald-400 transition-colors" title={t('admin.unban')}><Ban className="w-3.5 h-3.5" /></button> : <button onClick={() => openBanDialog(u.uid, u.visibleNick || u.displayName)} className="p-1.5 rounded-lg hover:bg-white/[0.03] text-zinc-600 hover:text-yellow-400 transition-colors" title={t('admin.ban')}><Ban className="w-3.5 h-3.5" /></button>}<button onClick={() => deleteUser(u.uid)} className="p-1.5 rounded-lg hover:bg-white/[0.03] text-zinc-600 hover:text-red-400 transition-colors" title={t('admin.delete')}><Trash2 className="w-3.5 h-3.5" /></button></div></td></tr>))}</tbody></table>{filteredUsers.length === 0 && <div className="py-10 text-center text-xs text-zinc-700">{t('chat.noChats')}</div>}</div></div>)}

        {activeTab === "tickets" && (<div className="space-y-4"><div className="flex items-center gap-3 mb-4"><h3 className="text-sm font-medium">{t('admin.tickets')}</h3><div className="flex items-center gap-1 bg-white/[0.02] border border-white/[0.06] rounded-xl p-0.5 ml-auto">{(["all", "open", "closed"] as const).map((f) => (<button key={f} onClick={() => setTicketFilter(f)} className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${ticketFilter === f ? "bg-violet-600/10 text-violet-400" : "text-zinc-600 hover:text-zinc-400"}`}>{f === "all" ? t('admin.all') : f === "open" ? t('admin.open') : t('admin.closed')}</button>))}</div></div>
          <div className="flex gap-4" style={{ height: "calc(100vh - 220px)" }}>
            <div className="w-80 shrink-0 border border-white/[0.04] rounded-2xl overflow-y-auto">{filteredTickets.length === 0 && <div className="py-16 text-center text-xs text-zinc-700">{t('chat.noChats')}</div>}{filteredTickets.map((t: any) => (<button key={t.id} onClick={() => setSelectedTicket(t)} className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-white/[0.02] hover:bg-white/[0.01] transition-all ${selectedTicket?.id === t.id ? "bg-violet-600/5" : ""}`}><TicketCheck className={`w-4 h-4 shrink-0 ${t.status === "open" ? "text-emerald-400" : "text-zinc-600"}`} /><div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{t.subject}</p><p className="text-[10px] text-zinc-600">#{t.serialNumber} · {t.userName}</p></div><span className={`text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0 ${t.status === "open" ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"}`}>{t.status === "open" ? t('admin.open') : t('admin.closed')}</span></button>))}</div>
            <div className="flex-1 border border-white/[0.04] rounded-2xl flex flex-col overflow-hidden">{selectedTicket ? (<><div className="px-5 py-3 border-b border-white/[0.04] flex items-center gap-3"><div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{selectedTicket.subject}</p><p className="text-[10px] text-zinc-600">#{selectedTicket.serialNumber} · {selectedTicket.userName} · {selectedTicket.userEmail}</p></div><div className="flex items-center gap-2 shrink-0">{selectedTicket.status === "open" ? <button onClick={() => changeTicketStatus(selectedTicket.id, "closed")} className="px-3 py-1.5 rounded-lg border border-white/[0.06] text-[11px] text-zinc-400 hover:text-zinc-200 transition-all">{t('admin.closeTicket')}</button> : <button onClick={() => changeTicketStatus(selectedTicket.id, "open")} className="px-3 py-1.5 rounded-lg border border-emerald-500/20 text-[11px] text-emerald-400 hover:bg-emerald-500/10 transition-all">{t('admin.openTicket')}</button>}<button onClick={() => deleteTicket(selectedTicket.id)} className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-600/5 transition-all" title={t('admin.delete')}><Trash2 className="w-3.5 h-3.5" /></button></div></div><div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">{ticketMessages.map((msg: any) => (<div key={msg.id} className={`flex ${msg.role === "admin" ? "justify-end" : "justify-start"}`}><div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${msg.role === "admin" ? "bg-violet-600/15 text-zinc-100 rounded-br-md" : "bg-white/[0.03] border border-white/[0.04] text-zinc-300 rounded-bl-md"}`}><p className="whitespace-pre-wrap">{msg.content}</p><p className="text-[9px] text-zinc-600 mt-1">{msg.role === "admin" && <span className="text-violet-400 mr-1">{t('admin.you')} · </span>}{new Date(msg.timestamp).toLocaleString(i18n.language === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p></div></div>))}<div ref={ticketEndRef} /></div><div className="p-4 border-t border-white/[0.04]"><div className="flex items-center gap-2"><input value={ticketReply} onChange={(e) => setTicketReply(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendAdminTicketReply(); }} placeholder={t('admin.replyPlaceholder')} className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40" /><button onClick={sendAdminTicketReply} disabled={!ticketReply.trim()} className="p-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 transition-all"><Send className="w-4 h-4" /></button></div></div></>) : <div className="flex-1 flex items-center justify-center"><p className="text-xs text-zinc-700">{t('admin.selectTicket')}</p></div>}</div>
          </div></div>)}

        {activeTab === "uptime" && (<div className="space-y-6"><div className="flex items-center justify-between"><div><h3 className="text-sm font-medium mb-1">{t('admin.manageUptime')}</h3><p className="text-xs text-zinc-600">{t('admin.clickStatusChange')}</p></div><div className="flex items-center gap-4">{STATUS_OPTIONS.map(s => (<div key={s} className="flex items-center gap-1.5"><div className={`w-2.5 h-2.5 rounded-sm ${STATUS_COLORS[s]}`} /><span className="text-[10px] text-zinc-500">{STATUS_LABELS[s]}</span></div>))}</div></div>
          {componentUptimes.map((comp, ci) => { const cs = getCurrentStatus(comp.hours); return (<div key={comp.key} className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-5"><div className="flex items-center justify-between mb-4"><div className="flex items-center gap-3"><h4 className="text-sm font-medium">{comp.name}</h4><div className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[cs]}`} /><span className={`text-[11px] font-medium ${cs === "operational" ? "text-emerald-400" : cs === "degraded" ? "text-yellow-400" : cs === "down" ? "text-red-400" : "text-zinc-400"}`}>{STATUS_LABELS[cs]}</span></div></div><span className="text-xs text-zinc-500">{getUptimePercent(comp.hours)}% {t('admin.percent')}</span></div><div className="flex gap-[2px] mb-2">{comp.hours.map((st, hi) => (<button key={hi} onClick={() => handleHourClick(ci, hi)} className={`flex-1 h-7 rounded-[2px] transition-all cursor-pointer hover:opacity-80 ${STATUS_COLORS[st]} ${selectedHour?.compIdx === ci && selectedHour?.hourIdx === hi ? "ring-2 ring-white ring-offset-1 ring-offset-[#050507]" : "opacity-40 hover:opacity-60"}`} title={`${90 - hi}${t('admin.hoursAgo')}: ${STATUS_LABELS[st]}`} />))}</div><div className="flex justify-between text-[10px] text-zinc-700 mb-3"><span>90{t('admin.hoursAgo')}</span><span>{t('admin.now')}</span></div>{selectedHour?.compIdx === ci && (<div className="flex items-center gap-2 pt-3 border-t border-white/[0.04]"><span className="text-xs text-zinc-500 mr-2">{t('admin.selectHour')} ({90 - selectedHour.hourIdx}{t('admin.hoursAgo')}):</span>{STATUS_OPTIONS.map(s => (<button key={s} onClick={() => setHourStatus(s)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${comp.hours[selectedHour.hourIdx] === s ? "border-violet-500/30 bg-violet-600/10 text-violet-300" : "border-white/[0.04] text-zinc-500 hover:text-zinc-300"}`}><span className={`w-2 h-2 rounded-sm ${STATUS_COLORS[s]}`} /> {STATUS_LABELS[s]}</button>))}</div>)}</div>); })}</div>)}

        {activeTab === "settings" && (<div className="max-w-lg space-y-6"><div className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-5 space-y-4"><h3 className="text-sm font-medium">{t('admin.techMaintenance')}</h3><button onClick={() => setSettings(p => ({ ...p, maintenance: !p.maintenance }))} className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-all text-sm"><span>{t('admin.maintenanceMode')}</span><span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${settings.maintenance ? "bg-yellow-500/10 text-yellow-500" : "bg-zinc-800 text-zinc-500"}`}>{settings.maintenance ? t('admin.maintOn') : t('admin.maintOff')}</span></button><div><label className="block text-xs text-zinc-600 mb-1.5">{t('admin.maintenanceMsg')}</label><textarea value={settings.maintenanceMessage} onChange={(e) => setSettings(p => ({ ...p, maintenanceMessage: e.target.value }))} rows={2} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40 resize-none" /></div><div><label className="block text-xs text-zinc-600 mb-1.5">{t('admin.maintenanceEst')}</label><input value={settings.maintenanceEstimate} onChange={(e) => setSettings(p => ({ ...p, maintenanceEstimate: e.target.value }))} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm focus:outline-none focus:border-violet-500/40" /></div></div><div className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-5 space-y-4"><h3 className="text-sm font-medium">{t('admin.general')}</h3><button onClick={() => setSettings(p => ({ ...p, registrationEnabled: !p.registrationEnabled }))} className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.04] hover:border-violet-500/20 transition-all text-sm"><span>{t('admin.regEnabled')}</span><span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${settings.registrationEnabled ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-400"}`}>{settings.registrationEnabled ? t('admin.regOpen') : t('admin.regClosed')}</span></button><div><label className="block text-xs text-zinc-600 mb-1.5">{t('admin.freeLimit')}</label><input type="number" value={settings.freeRequestsLimit} onChange={(e) => setSettings(p => ({ ...p, freeRequestsLimit: parseInt(e.target.value) || 0 }))} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm focus:outline-none focus:border-violet-500/40" /></div><div><label className="block text-xs text-zinc-600 mb-1.5">{t('admin.announcement')}</label><textarea value={settings.announcement} onChange={(e) => setSettings(p => ({ ...p, announcement: e.target.value }))} rows={2} placeholder={t('chat.noChats')} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40 resize-none" /></div></div><button onClick={saveSettings} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${saved ? "bg-emerald-600 text-white" : "bg-violet-600 text-white hover:bg-violet-500"}`}>{saved ? <><Check className="w-3.5 h-3.5" /> {t('admin.saved')}</> : <><Save className="w-3.5 h-3.5" /> {t('admin.save')}</>}</button></div>)}

        {activeTab === "payments" && (
          <div className="space-y-4">
            {/* Payment Mode Toggle */}
            <div className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-5">
              <h3 className="text-sm font-medium mb-3">{t('admin.paymentMode')}</h3>
              <p className="text-xs text-zinc-600 mb-4">{t('admin.paymentResultAll')}</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { mode: "success" as const, label: t('chat.pay_success_title'), desc: t('admin.paymentProcessing'), color: "emerald" },
                  { mode: "insufficient_funds" as const, label: t('admin.insufficientFunds'), desc: t('admin.balanceError'), color: "red" },
                  { mode: "invalid_card" as const, label: t('admin.invalidCard'), desc: t('admin.cardError'), color: "yellow" },
                ]).map((opt) => (
                  <button
                    key={opt.mode}
                    onClick={async () => {
                      const newSettings = { ...settings, paymentMode: opt.mode };
                      setSettings(newSettings);
                      await set(ref(db, "settings"), newSettings);
                    }}
                    className={`px-4 py-3 rounded-xl border text-left transition-all ${settings.paymentMode === opt.mode
                      ? opt.color === "emerald" ? "border-emerald-500/40 bg-emerald-600/[0.08]"
                        : opt.color === "red" ? "border-red-500/40 bg-red-600/[0.08]"
                          : "border-yellow-500/40 bg-yellow-600/[0.08]"
                      : "border-white/[0.06] bg-white/[0.01] hover:border-white/[0.1]"
                      }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${opt.color === "emerald" ? "bg-emerald-500" : opt.color === "red" ? "bg-red-500" : "bg-yellow-500"
                        }`} />
                      <span className={`text-xs font-medium ${settings.paymentMode === opt.mode
                        ? opt.color === "emerald" ? "text-emerald-400" : opt.color === "red" ? "text-red-400" : "text-yellow-400"
                        : "text-zinc-300"
                        }`}>{opt.label}</span>
                    </div>
                    <p className="text-[10px] text-zinc-600">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <div><h3 className="text-sm font-medium mb-1">{t('admin.paymentHistory')}</h3><p className="text-xs text-zinc-600">{payments.length} {t('admin.found')}</p></div>
            <div className="border border-white/[0.04] rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="border-b border-white/[0.04]">{[t('admin.email'), t('admin.plan'), t('admin.method'), t('admin.amount'), t('admin.date')].map((h) => (<th key={h} className="text-left text-[10px] text-zinc-600 font-medium px-4 py-3 uppercase tracking-wider">{h}</th>))}</tr></thead>
                <tbody>
                  {payments.map((p: any) => (
                    <tr key={p.id} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                      <td className="px-4 py-3 text-xs text-zinc-400">{p.email}</td>
                      <td className="px-4 py-3"><span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${p.plan === "pro" ? "bg-violet-500/10 text-violet-400" : "bg-yellow-500/10 text-yellow-400"}`}>{p.plan === "pro" ? "Pro" : "Ultra"}</span></td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{p.method}</td>
                      <td className="px-4 py-3 text-xs text-zinc-300 font-medium">{p.amount}</td>
                      <td className="px-4 py-3 text-xs text-zinc-600">{p.timestamp ? new Date(p.timestamp).toLocaleString(i18n.language === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {payments.length === 0 && <div className="py-10 text-center text-xs text-zinc-700">{t('admin.noPayments')}</div>}
            </div>
          </div>
        )}

        {activeTab === "models" && (<div className="space-y-4"><div><h3 className="text-sm font-medium mb-1">{t('admin.manageModels')}</h3><p className="text-xs text-zinc-600">{t('admin.modelsBanner')}</p></div><div className="border border-white/[0.04] rounded-2xl overflow-hidden divide-y divide-white/[0.02]">{adminModels.map((m) => { const key = sanitizeKey(m.id); const dis = !!disabledModels[key]; return (<div key={m.id} className={`flex items-center justify-between px-5 py-4 transition-all ${dis ? "opacity-60" : "hover:bg-white/[0.01]"}`}><div className="flex items-center gap-3"><AdminModelLogo modelId={m.id} size={24} /><div><p className="text-sm font-medium">{m.name}</p><p className="text-[11px] text-zinc-600">{m.provider}</p></div></div><div className="flex items-center gap-3"><div className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${dis ? "bg-red-500" : "bg-emerald-500"}`} /><span className={`text-[11px] font-medium ${dis ? "text-red-400" : "text-emerald-400"}`}>{dis ? t('admin.modelStatusDisabled') : t('admin.modelStatusActive')}</span></div><button type="button" onClick={() => handleToggleModel(m.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border cursor-pointer select-none transition-all ${dis ? "border-emerald-500/20 text-emerald-400 hover:bg-emerald-600/10" : "border-red-500/20 text-red-400 hover:bg-red-600/10"}`}>{dis ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}{dis ? t('admin.turnOn') : t('admin.turnOff')}</button></div></div>); })}</div></div>)}
      </div>
    </div>
  );
}
