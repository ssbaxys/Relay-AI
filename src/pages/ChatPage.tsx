import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { ref, push, onValue, serverTimestamp, query, orderByChild, remove, update, set } from "firebase/database";
import { auth, db } from "../firebase";
import { useAuth } from "../App";
import MarkdownRenderer from "../components/MarkdownRenderer";
import ElectricBorder from "../components/ElectricBorder";
import {
  Plus, Search, Send, ChevronDown, ChevronRight,
  LogOut, Trash2, MessageSquare, Check, Square,
  Folder, Pencil, X, ArrowDownAZ, Clock, MessageCircle,
  GripVertical, FolderOpen, Home, User, Lock, FileText, PanelLeftClose, PanelLeft,
  Shield, Wrench, AlertTriangle, Ban, TicketCheck, ChevronLeft, Send as SendIcon,
  Play, Pause, Download, Code, Image as ImageIcon, Music, ExternalLink, Eye,
  Crown, Gem, Sparkles, Settings, Globe
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

const MAX_CHARS = 2000;
const sanitizeKey = (k: string) => k.replace(/\./g, "_");

type SortMode = "recent" | "alphabetical" | "messages";
type ToolType = "search" | "code" | "photo" | "music" | null;

interface ChatSession { id: string; title: string; model: string; createdAt: number; lastMessage: number; messageCount: number; folderId?: string; }
interface ChatFolder { id: string; name: string; createdAt: number; collapsed?: boolean; }
interface BanInfo { reason: string; duration: number; bannedAt: number; }
interface Ticket { id: string; serialNumber: string; subject: string; status: "open" | "closed"; createdAt: number; userId: string; }

const MODEL_LOGOS: Record<string, { src: string; filter?: string }> = {
  "gpt-5.2-codex": { src: "https://img.icons8.com/fluency-systems-regular/48/chatgpt.png", filter: "invert(1) brightness(2)" },
  "claude-opus-4.6": { src: "https://img.icons8.com/fluency/48/claude-ai.png" },
  "claude-sonnet-4.6": { src: "https://img.icons8.com/fluency/48/claude-ai.png" },
  "gemini-3-pro": { src: "https://img.icons8.com/color/48/google-logo.png" },
  "gemini-3.1-pro": { src: "https://img.icons8.com/color/48/google-logo.png" },
  "mistral-large-latest": { src: "https://img.icons8.com/external-flat-juicy-fish/48/external-ai-artificial-intelligence-flat-juicy-fish.png" },
  "deepseek-v3.2-exp": { src: "https://img.icons8.com/fluency/48/robot-2.png" },
  "qwen-3-max": { src: "https://img.icons8.com/fluency/48/brainstorming.png" },
};

function ModelLogo({ modelId, size = 20, className = "" }: { modelId: string; size?: number; className?: string }) {
  const logo = MODEL_LOGOS[modelId];
  if (!logo) return <div className={`bg-violet-600/10 rounded-lg flex items-center justify-center ${className}`} style={{ width: size, height: size }}><span className="text-violet-400 font-bold" style={{ fontSize: size * 0.4 }}>R</span></div>;
  return <img src={logo.src} alt="" width={size} height={size} className={className} style={{ filter: logo.filter || "none" }} />;
}

const allModels = [
  { id: "gpt-5.2-codex", name: "GPT-5.2 Codex", provider: "OpenAI", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { id: "claude-opus-4.6", name: "Claude Opus 4.6", provider: "Anthropic", color: "text-orange-400", bg: "bg-orange-500/10" },
  { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6", provider: "Anthropic", color: "text-orange-300", bg: "bg-orange-500/5" },
  { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", provider: "Google", color: "text-blue-400", bg: "bg-blue-500/10" },
  { id: "mistral-large-latest", name: "Mistral Large", provider: "Mistral", color: "text-zinc-300", bg: "bg-white/5" },
  { id: "deepseek-v3.2-exp", name: "DeepSeek V3.2", provider: "DeepSeek", color: "text-blue-300", bg: "bg-blue-400/10" },
  { id: "qwen-3-max", name: "Qwen 3 Max", provider: "Alibaba", color: "text-violet-300", bg: "bg-violet-400/10" },
];

const modelSuggestions: Record<string, string[]> = {
  "gpt-5.2-codex": ["suggestions.gpt-5.2-codex.0", "suggestions.gpt-5.2-codex.1", "suggestions.gpt-5.2-codex.2", "suggestions.gpt-5.2-codex.3"],
  "claude-opus-4.6": ["suggestions.claude-opus-4.6.0", "suggestions.claude-opus-4.6.1", "suggestions.claude-opus-4.6.2", "suggestions.claude-opus-4.6.3"],
  "claude-sonnet-4.6": ["suggestions.claude-sonnet-4.6.0", "suggestions.claude-sonnet-4.6.1", "suggestions.claude-sonnet-4.6.2", "suggestions.claude-sonnet-4.6.3"],
  "gemini-3.1-pro": ["suggestions.gemini-3.1-pro.0", "suggestions.gemini-3.1-pro.1", "suggestions.gemini-3.1-pro.2", "suggestions.gemini-3.1-pro.3"],
  "mistral-large-latest": ["suggestions.mistral-large-latest.0", "suggestions.mistral-large-latest.1", "suggestions.mistral-large-latest.2", "suggestions.mistral-large-latest.3"],
  "deepseek-v3.2-exp": ["suggestions.deepseek-v3.2-exp.0", "suggestions.deepseek-v3.2-exp.1", "suggestions.deepseek-v3.2-exp.2", "suggestions.deepseek-v3.2-exp.3"],
  "qwen-3-max": ["suggestions.qwen-3-max.0", "suggestions.qwen-3-max.1", "suggestions.qwen-3-max.2", "suggestions.qwen-3-max.3"],
};

const responses = ["chat.responses.0", "chat.responses.1"];

const TOOL_LABELS: Record<string, string> = { search: "chat.tools.search", code: "chat.tools.code", photo: "chat.tools.photo", music: "chat.tools.music" };

function getRandomSuggestions(modelId: string): string[] {
  const pool = modelSuggestions[modelId] || modelSuggestions["gpt-5.2-codex"];
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 4);
}
function getModelInfo(modelId: string) { return allModels.find(m => m.id === modelId) || allModels[0]; }
function generateSerial(): string { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; let r = ""; for (let i = 0; i < 8; i++) r += c[Math.floor(Math.random() * c.length)]; return r; }
function formatTimeLeft(ms: number, t: any): string { if (ms <= 0) return t('ban.expired'); const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); const s = Math.floor((ms % 60000) / 1000); if (h > 0) return `${h}${t('ban.hours')} ${m}${t('ban.minutes')} ${s}${t('ban.seconds')}`; if (m > 0) return `${m}${t('ban.minutes')} ${s}${t('ban.seconds')}`; return `${s}${t('ban.seconds')}`; }
function formatDur(sec: number): string { const m = Math.floor(sec / 60); const s = Math.floor(sec % 60); return `${m}:${s.toString().padStart(2, "0")}`; }

function AudioPlayer({ url }: { url: string }) {
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
    <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-2xl px-4 py-3 max-w-[320px]">
      <audio ref={aRef} src={url} preload="metadata" />
      <button onClick={() => { if (!aRef.current) return; if (playing) aRef.current.pause(); else aRef.current.play(); setPlaying(!playing); }} className="w-9 h-9 rounded-full bg-violet-600 flex items-center justify-center shrink-0 hover:bg-violet-500 transition-colors">
        {playing ? <Pause className="w-4 h-4 text-white fill-white" /> : <Play className="w-4 h-4 text-white fill-white ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="cursor-pointer rounded-full h-1.5 bg-white/[0.06] mb-1.5" onClick={(e: any) => { if (!aRef.current || !dur) return; const r = e.currentTarget.getBoundingClientRect(); aRef.current.currentTime = ((e.clientX - r.left) / r.width) * dur; }}>
          <div className="h-full bg-violet-500 rounded-full transition-all duration-100" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-zinc-600 font-mono"><span>{formatDur(cur)}</span><span>{formatDur(dur)}</span></div>
      </div>
      <a href={url} download className="p-1.5 rounded-lg text-zinc-600 hover:text-violet-400 transition-colors shrink-0"><Download className="w-3.5 h-3.5" /></a>
    </div>
  );
}

function SourcesModal({ sources, onClose }: { sources: any[]; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-[#111114] border border-white/[0.06] rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
          <h3 className="text-sm font-semibold">{t('chat.sources')}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/[0.05] text-zinc-500 transition-all"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {sources.map((s: any, i: number) => {
            const url = String(s.url || "");
            const title = String(s.title || s.url || "");
            const desc = String(s.description || "");
            let hostname = "example.com";
            try { hostname = new URL(url).hostname; } catch { }
            return (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.04] hover:border-violet-500/20 hover:bg-white/[0.02] transition-all group">
                <img src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`} alt="" className="w-8 h-8 rounded-lg shrink-0 bg-white/[0.05]" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate group-hover:text-violet-400 transition-colors">{title}</p>
                  {desc && <p className="text-[10px] text-zinc-600 truncate mt-0.5">{desc}</p>}
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-zinc-700 group-hover:text-violet-400 transition-colors shrink-0" />
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CodeActionDisplay({ msg }: { msg: any }) {
  const { t } = useTranslation();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const rawAct = msg.actions;
  const actions: any[] = Array.isArray(rawAct) ? rawAct : (rawAct && typeof rawAct === "object" ? Object.values(rawAct) : []);
  const pastLabels: { [key: string]: string } = { read: t('chat.code.readed'), create: t('chat.code.created'), edit: t('chat.code.edited'), delete: t('chat.code.deleted') };
  const presentLabels: { [key: string]: string } = { read: t('chat.code.read'), create: t('chat.code.create'), edit: t('chat.code.edit'), delete: t('chat.code.delete') };
  return (
    <div className="space-y-1.5 max-w-[420px]">
      {actions.map((a: any, i: number) => {
        const act = String(a.action || "read");
        const isPending = a.success === undefined || a.success === null;
        const ok = a.success === true;
        const path = String(a.path || "");
        const content = a.content ? String(a.content) : null;
        const canExpand = (act === "create" || act === "edit") && !!content && !isPending;
        const isExpanded = expandedIdx === i;
        const label = isPending ? presentLabels[act] || act : (pastLabels[act] || act);
        return (
          <div key={i}>
            <div onClick={() => canExpand && setExpandedIdx(isExpanded ? null : i)}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all ${isPending ? "border-yellow-500/10 bg-yellow-600/5" : ok ? "border-emerald-500/10 bg-emerald-600/5" : "border-red-500/10 bg-red-600/5"} ${canExpand ? "cursor-pointer hover:brightness-110" : ""}`}>
              <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${isPending ? "bg-yellow-500/10" : ok ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                <Code className={`w-3.5 h-3.5 ${isPending ? "text-yellow-400" : ok ? "text-emerald-400" : "text-red-400"}`} />
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className={`text-[11px] font-semibold font-mono ${isPending ? "text-yellow-400" : ok ? "text-emerald-400" : "text-red-400"}`}>{label}</span>
                <span className="text-[11px] text-zinc-600 font-mono truncate">({path})</span>
              </div>
              {isPending ? (
                <div className="flex items-center gap-0.5 shrink-0">{[0, 1, 2].map(d => (<div key={d} className="w-1 h-1 bg-yellow-400/60 rounded-full animate-pulse" style={{ animationDelay: `${d * 200}ms` }} />))}</div>
              ) : (
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${ok ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                  {ok ? <Check className="w-3 h-3 text-emerald-400" /> : <X className="w-3 h-3 text-red-400" />}
                </div>
              )}
              {canExpand && <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />}
            </div>
            {isExpanded && content && (
              <div className="mt-1 rounded-xl border border-white/[0.04] bg-[#0a0a0d] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.04]">
                  <span className="text-[10px] text-zinc-600 font-mono">{path}</span>
                  <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(content); }} className="text-[10px] text-zinc-600 hover:text-violet-400 transition-colors px-1.5 py-0.5">{t('common.copy')}</button>
                </div>
                <pre className="p-3 text-[11px] text-zinc-300 font-mono overflow-x-auto max-h-64 overflow-y-auto leading-relaxed"><code>{content}</code></pre>
              </div>
            )}
          </div>
        );
      })}
      {msg.content && <div className="mt-2 text-zinc-300 text-sm"><MarkdownRenderer content={String(msg.content)} /></div>}
    </div>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-[#111114] border border-white/[0.06] rounded-3xl shadow-2xl overflow-hidden animate-fade-in-up">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.04]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Settings className="w-4 h-4 text-emerald-400" />
            </div>
            <h3 className="text-sm font-semibold">{t('settings.title')}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/[0.05] text-zinc-500 transition-all"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-1">{t('settings.language')}</label>
            <LanguageSwitcher />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-1">{t('settings.theme')}</label>
            <div className="grid grid-cols-3 gap-2">
              <button className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-violet-500/50 transition-all group">
                <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center"><Sparkles className="w-4 h-4 text-zinc-600 group-hover:text-violet-400" /></div>
                <span className="text-[10px] font-medium text-zinc-400">{t('settings.dark')}</span>
              </button>
              <button className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-violet-500/50 transition-all group opacity-50 cursor-not-allowed">
                <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center"><CloudSun className="w-4 h-4 text-zinc-400" /></div>
                <span className="text-[10px] font-medium text-zinc-400">{t('settings.light')}</span>
              </button>
              <button className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-violet-500/50 transition-all group">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center"><Settings className="w-4 h-4 text-zinc-600 group-hover:text-violet-400" /></div>
                <span className="text-[10px] font-medium text-zinc-400">{t('settings.system')}</span>
              </button>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.04] flex justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold hover:bg-violet-500 transition-colors shadow-lg shadow-violet-600/20">{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}

function CloudSun({ className }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="M20 12h2" /><path d="m19.07 4.93-1.41 1.41" /><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128" /><path d="M13 22H7a5 5 0 1 1 4.9-6" /><path d="M16 18a2 2 0 0 1 2 2" /><path d="M6.22 19.81Z" /><path d="M17.657 16.657 13.414 20.9" /><path d="m5.176 11.176 3.414 3.414" /><path d="m11.176 5.176 3.414 3.414" /></svg>; }

function SpecialMessage({ msg }: { msg: any }) {
  const { t: translate } = useTranslation();
  const [showSources, setShowSources] = useState(false);
  const type = String(msg.type || "");
  const rawSrc = msg.sources;
  const sources: any[] = Array.isArray(rawSrc) ? rawSrc : (rawSrc && typeof rawSrc === "object" ? Object.values(rawSrc) : []);

  if (type === "search_pending") {
    return (
      <div className="flex items-center gap-3 bg-blue-600/5 border border-blue-500/10 rounded-2xl px-5 py-4 max-w-[320px]">
        <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center shrink-0">
          <Search className="w-5 h-5 text-blue-400 animate-search-spin" />
        </div>
        <div>
          <p className="text-sm font-medium text-blue-400 animate-pulse">{translate('chat.searching')}</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">{translate('chat.wait')}</p>
        </div>
      </div>
    );
  }

  if (type === "search_done") {
    return (
      <div>
        <div className="flex items-center gap-3 bg-blue-600/5 border border-blue-500/10 rounded-2xl px-5 py-4 max-w-[320px] mb-2">
          <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center shrink-0">
            <Search className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-blue-400">{translate('chat.searchDone')}</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">{sources.length} {translate('chat.sources')}</p>
          </div>
        </div>
        {sources.length > 0 && (
          <button onClick={() => setShowSources(true)} className="flex items-center group mt-1">
            <div className="flex items-center -space-x-2">
              {sources.slice(0, 6).map((s: any, i: number) => {
                const sUrl = String(s.url || "");
                let sHost = "example.com";
                try { sHost = new URL(sUrl).hostname; } catch { }
                return (
                  <div key={i} className="w-7 h-7 rounded-full bg-[#111114] border-2 border-[#0a0a0d] overflow-hidden flex items-center justify-center shadow-sm hover:z-10 hover:scale-110 transition-transform" style={{ zIndex: sources.length - i }}>
                    <img src={`https://www.google.com/s2/favicons?domain=${sHost}&sz=32`} alt="" className="w-4 h-4" />
                  </div>
                );
              })}
              {sources.length > 6 && (
                <div className="w-7 h-7 rounded-full bg-[#111114] border-2 border-[#0a0a0d] flex items-center justify-center text-[9px] font-medium text-zinc-400" style={{ zIndex: 0 }}>+{sources.length - 6}</div>
              )}
            </div>
            <span className="text-[10px] text-zinc-600 group-hover:text-violet-400 transition-colors ml-2">{sources.length} {translate('chat.sources')}</span>
          </button>
        )}
        {msg.content && <div className="mt-2 text-zinc-300 text-sm"><MarkdownRenderer content={String(msg.content)} /></div>}
        {showSources && <SourcesModal sources={sources} onClose={() => setShowSources(false)} />}
      </div>
    );
  }

  if (type === "code_action") { return <CodeActionDisplay msg={msg} />; }

  if (type === "photo_pending") {
    return (
      <div className="w-[200px] h-[200px] rounded-2xl bg-zinc-800/50 border border-white/[0.06] flex flex-col items-center justify-center gap-3">
        <ImageIcon className="w-8 h-8 text-zinc-500" />
        <p className="text-xs text-zinc-500 animate-pulse">{translate('chat.generatingPhoto')}</p>
      </div>
    );
  }

  if (type === "photo" && msg.imageUrl) {
    return <img src={String(msg.imageUrl)} alt="" className="max-w-[300px] max-h-[300px] rounded-2xl object-cover border border-white/[0.06]" />;
  }

  if (type === "music_generating") {
    return (
      <div className="flex items-center gap-3 bg-violet-600/5 border border-violet-500/10 rounded-2xl px-5 py-4 max-w-[300px]">
        <div className="w-10 h-10 rounded-full bg-violet-600/20 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-violet-400 animate-spin" style={{ animationDuration: "3s" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
        </div>
        <div>
          <p className="text-sm font-medium bg-gradient-to-r from-violet-400 via-purple-300 to-violet-400 bg-clip-text text-transparent animate-pulse">{translate('chat.generatingMusic')}</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">{translate('chat.wait')}</p>
        </div>
      </div>
    );
  }

  if (type === "music" && msg.audioUrl) {
    return <AudioPlayer url={String(msg.audioUrl)} />;
  }

  return null;
}

export default function ChatPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [disabledModels, setDisabledModels] = useState<{ [key: string]: boolean }>({});
  const [selectedModel, setSelectedModel] = useState(allModels[0]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [typingText, setTypingText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState("");
  const [draggedChatId, setDraggedChatId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [chatContextMenu, setChatContextMenu] = useState<{ chatId: string; x: number; y: number } | null>(null);
  const [folderContextMenu, setFolderContextMenu] = useState<{ folderId: string; x: number; y: number } | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [profileData, setProfileData] = useState({ displayName: "", systemNick: "", visibleNick: "", id: "", plan: "free", language: "ru" });
  const [editingVisibleNick, setEditingVisibleNick] = useState(false);
  const [visibleNickInput, setVisibleNickInput] = useState("");
  const [adminInput, setAdminInput] = useState("");
  const [adminError, setAdminError] = useState("");
  const [currentSuggestions, setCurrentSuggestions] = useState(() => getRandomSuggestions(allModels[0].id));
  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [maintenanceEstimate, setMaintenanceEstimate] = useState("");
  const [godModeActive, setGodModeActive] = useState<string | null>(null);
  const [viewAsUser, setViewAsUser] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [maintenanceAdminPass, setMaintenanceAdminPass] = useState("");
  const [maintenanceAdminError, setMaintenanceAdminError] = useState("");
  const [activeTool, setActiveTool] = useState<ToolType>(null);
  const [banInfo, setBanInfo] = useState<BanInfo | null>(null);
  const [banTimeLeft, setBanTimeLeft] = useState(0);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketMessages, setTicketMessages] = useState<any[]>([]);
  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [newTicketSubject, setNewTicketSubject] = useState("");
  const [newTicketMessage, setNewTicketMessage] = useState("");
  const [ticketReply, setTicketReply] = useState("");

  const generationAbortRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const ticketEndRef = useRef<HTMLDivElement>(null);

  const hasAdminAccess = typeof window !== "undefined" && localStorage.getItem("relay_admin") === "true";
  const isModelDisabledCheck = useCallback((id: string) => !!disabledModels[sanitizeKey(id)], [disabledModels]);
  const enabledModels = useMemo(() => allModels.filter(m => !isModelDisabledCheck(m.id)), [isModelDisabledCheck]);

  // Ban
  useEffect(() => {
    if (!user) return;
    const unsub = onValue(ref(db, `bans/${user.uid}`), (snap) => {
      const d = snap.val();
      if (d && d.bannedAt) {
        if (d.duration > 0) { const exp = d.bannedAt + d.duration * 60000; if (Date.now() >= exp) { remove(ref(db, `bans/${user.uid}`)); setBanInfo(null); return; } }
        setBanInfo({ reason: d.reason || t('ban.noReason'), duration: d.duration || 0, bannedAt: d.bannedAt });
      } else setBanInfo(null);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!banInfo || banInfo.duration === 0) return;
    const iv = setInterval(() => {
      const left = banInfo.bannedAt + banInfo.duration * 60000 - Date.now();
      if (left <= 0) { if (user) remove(ref(db, `bans/${user.uid}`)); setBanInfo(null); setBanTimeLeft(0); }
      else setBanTimeLeft(left);
    }, 1000);
    return () => clearInterval(iv);
  }, [banInfo, user]);

  // Language Sync
  useEffect(() => {
    if (profileData.language && i18n.language !== profileData.language) {
      i18n.changeLanguage(profileData.language);
    }
  }, [profileData.language, i18n]);

  // Tickets
  useEffect(() => { if (!user) return; const unsub = onValue(ref(db, "tickets"), (snap) => { const d = snap.val(); if (d) { setTickets(Object.entries(d).map(([id, v]: [string, any]) => ({ id, ...v })).filter((t: any) => t.userId === user.uid).sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))); } else setTickets([]); }); return () => unsub(); }, [user]);
  useEffect(() => { if (!selectedTicket) { setTicketMessages([]); return; } const unsub = onValue(ref(db, `tickets/${selectedTicket.id}/messages`), (snap) => { const d = snap.val(); if (d) { setTicketMessages(Object.entries(d).map(([id, v]: [string, any]) => ({ id, ...v })).sort((a: any, b: any) => a.timestamp - b.timestamp)); } else setTicketMessages([]); }); return () => unsub(); }, [selectedTicket]);
  useEffect(() => { ticketEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [ticketMessages]);

  const createTicket = async () => { if (!user || !newTicketSubject.trim() || !newTicketMessage.trim()) return; const serial = generateSerial(); const tRef = await push(ref(db, "tickets"), { userId: user.uid, userEmail: user.email || "", userName: profileData.visibleNick || user.displayName || "User", serialNumber: serial, subject: newTicketSubject.trim(), status: "open", createdAt: Date.now() }); if (tRef.key) await push(ref(db, `tickets/${tRef.key}/messages`), { role: "user", content: newTicketMessage.trim(), timestamp: Date.now() }); setShowCreateTicket(false); setNewTicketSubject(""); setNewTicketMessage(""); };
  const sendTicketReply = async () => { if (!selectedTicket || !ticketReply.trim() || selectedTicket.status === "closed") return; await push(ref(db, `tickets/${selectedTicket.id}/messages`), { role: "user", content: ticketReply.trim(), timestamp: Date.now() }); setTicketReply(""); };

  // Firebase listeners
  useEffect(() => { const unsub = onValue(ref(db, "disabledModels"), (snap) => { const v = snap.val(); setDisabledModels(v && typeof v === "object" ? v : {}); }); return () => unsub(); }, []);
  useEffect(() => { if (isModelDisabledCheck(selectedModel.id) && enabledModels.length > 0) setSelectedModel(enabledModels[0]); }, [disabledModels, selectedModel.id, enabledModels, isModelDisabledCheck]);
  useEffect(() => { const unsub = onValue(ref(db, "settings"), (snap) => { const d = snap.val(); if (d) { setMaintenance(!!d.maintenance); setMaintenanceMessage(d.maintenanceMessage || t('maintenance.defaultMsg')); setMaintenanceEstimate(d.maintenanceEstimate || ""); } else setMaintenance(false); }); return () => unsub(); }, [t]);
  useEffect(() => { if (!user || !currentChatId) { setGodModeActive(null); return; } const unsub = onValue(ref(db, `godmode/${user.uid}/${currentChatId}`), (snap) => { const d = snap.val(); if (d && d.mode && d.mode !== "auto") setGodModeActive(d.mode); else setGodModeActive(null); }); return () => unsub(); }, [user, currentChatId]);
  // Listen for admin viewing as this user
  useEffect(() => { if (!user) return; const unsub = onValue(ref(db, `viewAsUser/${user.uid}`), (snap) => { setViewAsUser(!!snap.val()); }); return () => unsub(); }, [user]);
  useEffect(() => { setCurrentSuggestions(getRandomSuggestions(selectedModel.id)); }, [selectedModel.id]);
  useEffect(() => { if (!user) return; const unsub = onValue(ref(db, `users/${user.uid}`), (snap) => { const d = snap.val(); if (d) { setProfileData({ displayName: d.displayName || user.displayName || "User", systemNick: user.email || "", visibleNick: d.visibleNick || d.displayName || user.displayName || "User", id: d.uniqueId || "", plan: d.plan || "free", language: d.language || "ru" }); if (!d.uniqueId) set(ref(db, `users/${user.uid}/uniqueId`), String(Math.floor(10000000 + Math.random() * 90000000))); } }); return () => unsub(); }, [user]);
  useEffect(() => { if (!user) return; const q = query(ref(db, `chats/${user.uid}`), orderByChild("createdAt")); const unsub = onValue(q, (snap) => { const d = snap.val(); if (d) { setChatSessions(Object.entries(d).map(([id, v]: [string, any]) => ({ id, title: v.title || t('chat.newChat'), model: v.model || "gpt-5.2-codex", createdAt: v.createdAt || 0, lastMessage: v.lastMessage || v.createdAt || 0, messageCount: v.messageCount || 0, folderId: v.folderId || undefined }))); } else setChatSessions([]); }); return () => unsub(); }, [user, t]);
  useEffect(() => { if (!user) return; const unsub = onValue(ref(db, `folders/${user.uid}`), (snap) => { const d = snap.val(); if (d) { setFolders(Object.entries(d).map(([id, v]: [string, any]) => ({ id, name: v.name || t('chat.folder'), createdAt: v.createdAt || 0, collapsed: v.collapsed || false }))); } else setFolders([]); }); return () => unsub(); }, [user, t]);

  useEffect(() => {
    if (!user || !currentChatId) { setMessages([]); return; }
    const q = query(ref(db, `messages/${user.uid}/${currentChatId}`), orderByChild("timestamp"));
    const unsub = onValue(q, (snap) => {
      const d = snap.val();
      if (d) { setMessages(Object.entries(d).map(([id, v]: [string, any]) => ({ id, ...v })).sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0))); }
      else setMessages([]);
    });
    return () => unsub();
  }, [user, currentChatId]);

  useEffect(() => { if (!currentChatId) return; const cs = chatSessions.find(c => c.id === currentChatId); if (cs?.model) { const mi = allModels.find(m => m.id === cs.model); if (mi && !isModelDisabledCheck(mi.id)) setSelectedModel(mi); } }, [currentChatId, chatSessions, isModelDisabledCheck]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typingText, isGenerating]);

  const handleModelChange = async (model: typeof allModels[0]) => { setSelectedModel(model); setShowModelPicker(false); if (currentChatId && user) await update(ref(db, `chats/${user.uid}/${currentChatId}`), { model: model.id }); };
  const sortChats = useCallback((chats: ChatSession[]): ChatSession[] => { const s = [...chats]; switch (sortMode) { case "recent": return s.sort((a, b) => b.lastMessage - a.lastMessage); case "alphabetical": return s.sort((a, b) => a.title.localeCompare(b.title, "ru")); case "messages": return s.sort((a, b) => b.messageCount - a.messageCount); default: return s; } }, [sortMode]);
  const filteredChats = useMemo(() => sortChats(chatSessions.filter(c => !searchQuery.trim() || c.title.toLowerCase().includes(searchQuery.toLowerCase()))), [chatSessions, searchQuery, sortChats]);
  const folderedChats = filteredChats.filter(c => c.folderId);
  const unfolderedChats = filteredChats.filter(c => !c.folderId);
  const sortedFolders = [...folders].sort((a, b) => b.createdAt - a.createdAt);

  const createNewChat = async () => { if (!user) return; const nc = await push(ref(db, `chats/${user.uid}`), { title: t('chat.newChat'), model: selectedModel.id, createdAt: serverTimestamp(), lastMessage: Date.now(), messageCount: 0 }); setCurrentChatId(nc.key); setMessages([]); };
  const deleteChat = async (chatId: string) => { if (!user) return; await remove(ref(db, `chats/${user.uid}/${chatId}`)); await remove(ref(db, `messages/${user.uid}/${chatId}`)); if (currentChatId === chatId) { setCurrentChatId(null); setMessages([]); } };
  const renameChat = async (chatId: string, t: string) => { if (!user || !t.trim()) return; await update(ref(db, `chats/${user.uid}/${chatId}`), { title: t.trim() }); setRenamingChatId(null); };
  const renameFolder = async (fId: string, n: string) => { if (!user || !n.trim()) return; await update(ref(db, `folders/${user.uid}/${fId}`), { name: n.trim() }); setRenamingFolderId(null); };
  const toggleFolderCollapse = async (fId: string) => { if (!user) return; const f = folders.find(fl => fl.id === fId); if (f) await update(ref(db, `folders/${user.uid}/${fId}`), { collapsed: !f.collapsed }); };
  const deleteFolder = async (fId: string, scatter: boolean) => { if (!user) return; const cif = chatSessions.filter(c => c.folderId === fId); if (scatter) { for (const c of cif) await update(ref(db, `chats/${user.uid}/${c.id}`), { folderId: null }); } else { for (const c of cif) { await remove(ref(db, `chats/${user.uid}/${c.id}`)); await remove(ref(db, `messages/${user.uid}/${c.id}`)); } } await remove(ref(db, `folders/${user.uid}/${fId}`)); };
  const moveChatToFolder = async (chatId: string, fId: string | null) => { if (!user) return; await update(ref(db, `chats/${user.uid}/${chatId}`), { folderId: fId || null }); };

  const handleDragStart = (chatId: string) => setDraggedChatId(chatId);
  const handleDragOverChat = (e: React.DragEvent, chatId: string) => { e.preventDefault(); if (draggedChatId && draggedChatId !== chatId) setDragOverTarget(chatId); };
  const handleDragOverFolder = (e: React.DragEvent, fId: string) => { e.preventDefault(); setDragOverTarget(`folder-${fId}`); };
  const handleDropOnChat = async (targetId: string) => { if (!user || !draggedChatId || draggedChatId === targetId) { setDraggedChatId(null); setDragOverTarget(null); return; } const fr = await push(ref(db, `folders/${user.uid}`), { name: t('chat.newFolder'), createdAt: Date.now(), collapsed: false }); if (fr.key) { await update(ref(db, `chats/${user.uid}/${draggedChatId}`), { folderId: fr.key }); await update(ref(db, `chats/${user.uid}/${targetId}`), { folderId: fr.key }); } setDraggedChatId(null); setDragOverTarget(null); };
  const handleDropOnFolder = async (fId: string) => { if (!user || !draggedChatId) { setDraggedChatId(null); setDragOverTarget(null); return; } await moveChatToFolder(draggedChatId, fId); setDraggedChatId(null); setDragOverTarget(null); };
  const handleDragEnd = () => { setDraggedChatId(null); setDragOverTarget(null); };

  const handleToolSelect = (tool: ToolType) => {
    setActiveTool(activeTool === tool ? null : tool);
  };

  const animateTyping = useCallback((fullText: string, messageId: string) => {
    setTypingMessageId(messageId); setTypingText("");
    let i = 0;
    const iv = setInterval(() => {
      if (generationAbortRef.current) { clearInterval(iv); setTypingMessageId(null); setTypingText(""); setIsGenerating(false); generationAbortRef.current = false; return; }
      if (i < fullText.length) { setTypingText(fullText.substring(0, i + 1)); i++; }
      else { clearInterval(iv); setTypingMessageId(null); setTypingText(""); setIsGenerating(false); }
    }, 10);
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || !user || isGenerating) return;
    if (isModelDisabledCheck(selectedModel.id)) return;
    const text = input.trim().substring(0, MAX_CHARS);
    setInput("");

    let chatId = currentChatId;
    const isFirst = !chatId;
    if (!chatId) {
      const autoTitle = text.length > 50 ? text.substring(0, 47) + "..." : text;
      const nc = await push(ref(db, `chats/${user.uid}`), { title: autoTitle, model: selectedModel.id, createdAt: serverTimestamp(), lastMessage: Date.now(), messageCount: 0 });
      chatId = nc.key; setCurrentChatId(chatId);
    }
    if (!isFirst && chatId) {
      const cc = chatSessions.find(c => c.id === chatId);
      if (cc && (cc.title === "New Chat" || cc.title === t('chat.newChat')) && cc.messageCount === 0) {
        await update(ref(db, `chats/${user?.uid}/${chatId}`), { title: text.length > 50 ? text.substring(0, 47) + "..." : text });
      }
    }

    const msgsRef = ref(db, `messages/${user.uid}/${chatId}`);
    const msgData: any = { role: "user", content: text, model: selectedModel.id, timestamp: Date.now() };
    if (activeTool) msgData.tool = activeTool;
    await push(msgsRef, msgData);

    const chatRef = ref(db, `chats/${user.uid}/${chatId}`);
    const cc2 = chatSessions.find(c => c.id === chatId);
    await update(chatRef, { lastMessage: Date.now(), messageCount: (cc2?.messageCount || 0) + 1 });

    // Don't auto-respond if god mode manual/admin is active
    if (godModeActive === "manual" || godModeActive === "admin") return;

    setIsGenerating(true); generationAbortRef.current = false;
    const doRespond = async () => {
      if (generationAbortRef.current) { setIsGenerating(false); generationAbortRef.current = false; return; }
      const responseText = responses[Math.floor(Math.random() * responses.length)];
      const msgRef = await push(msgsRef, { role: "assistant", content: responseText, model: selectedModel.id, timestamp: Date.now() });
      await update(chatRef, { lastMessage: Date.now(), messageCount: (cc2?.messageCount || 0) + 2 });
      if (msgRef.key) animateTyping(responseText, msgRef.key);
    };
    doRespond();
  };

  const stopGeneration = () => { generationAbortRef.current = true; };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const charCount = input.length;
  const charOverLimit = charCount > MAX_CHARS;

  useEffect(() => { const h = () => { setChatContextMenu(null); setFolderContextMenu(null); }; window.addEventListener("click", h); return () => window.removeEventListener("click", h); }, []);
  useEffect(() => { const h = (e: MouseEvent) => { if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false); }; if (showProfile) document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [showProfile]);

  const saveVisibleNick = async () => { if (!user || !visibleNickInput.trim()) return; await update(ref(db, `users/${user.uid}`), { visibleNick: visibleNickInput.trim() }); setEditingVisibleNick(false); };
  const handleAdminAccess = () => { if (adminInput === "4321") { localStorage.setItem("relay_admin", "true"); navigate("/admin"); } else { setAdminError(t('admin.invalidPassword')); } };
  const handleMaintenanceAdmin = () => { if (maintenanceAdminPass === "4321") { localStorage.setItem("relay_admin", "true"); navigate("/admin"); } else { setMaintenanceAdminError(t('maintenance.invalidPassword')); } };

  const renderChatItem = (s: ChatSession) => (
    <div key={s.id} draggable onDragStart={() => handleDragStart(s.id)} onDragOver={(e) => handleDragOverChat(e, s.id)}
      onDrop={() => handleDropOnChat(s.id)} onDragEnd={handleDragEnd}
      onContextMenu={(e: any) => { e.preventDefault(); setChatContextMenu({ chatId: s.id, x: e.clientX, y: e.clientY }); }}
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-all duration-200 ${currentChatId === s.id ? "bg-violet-600/10 text-violet-300" : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"} ${dragOverTarget === s.id ? "ring-1 ring-violet-500/40 bg-violet-600/5" : ""} ${draggedChatId === s.id ? "opacity-40" : ""}`}
      onClick={() => { if (renamingChatId === s.id) return; setCurrentChatId(s.id); setTypingMessageId(null); setTypingText(""); }}>
      <GripVertical className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-30 cursor-grab transition-opacity duration-200" />
      <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-50" />
      {renamingChatId === s.id ? (
        <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => renameChat(s.id, renameValue)} onKeyDown={(e) => { if (e.key === "Enter") renameChat(s.id, renameValue); if (e.key === "Escape") setRenamingChatId(null); }}
          className="flex-1 bg-transparent text-xs text-zinc-200 focus:outline-none border-b border-violet-500/40 py-0.5" autoFocus onClick={(e) => e.stopPropagation()} />
      ) : (<span className="truncate flex-1 text-xs">{s.title}</span>)}
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-all duration-200 shrink-0">
        <button onClick={(e: any) => { e.stopPropagation(); setRenamingChatId(s.id); setRenameValue(s.title); }} className="p-1 hover:text-violet-400 transition-colors"><Pencil className="w-2.5 h-2.5" /></button>
        <button onClick={(e: any) => { e.stopPropagation(); deleteChat(s.id); }} className="p-1 hover:text-red-400 transition-colors"><Trash2 className="w-2.5 h-2.5" /></button>
      </div>
    </div>
  );

  const renderMessage = (msg: any) => {
    const role = String(msg.role || "user");
    const msgModel = getModelInfo(msg.model || selectedModel.id);
    const specialTypes = ["search_pending", "search_done", "code_action", "photo_pending", "photo", "music_generating", "music"];
    const hasSpecialType = msg.type && specialTypes.includes(String(msg.type));

    if (role === "user") {
      return (
        <div className="flex justify-end animate-fade-in-up">
          <div className="max-w-[80%]">
            {msg.imageUrl && <div className="mb-2 flex justify-end"><img src={String(msg.imageUrl)} alt="" className="max-w-[300px] max-h-[300px] rounded-xl object-cover border border-white/[0.06]" /></div>}
            {msg.content && <div className="bg-violet-600/15 text-zinc-100 px-4 py-3 rounded-2xl rounded-br-md text-sm leading-relaxed"><MarkdownRenderer content={String(msg.content)} /></div>}
            {msg.tool && <div className="flex justify-end mt-1"><span className="text-[9px] text-zinc-600 bg-white/[0.02] px-2 py-0.5 rounded-full flex items-center gap-1">{msg.tool === "search" && <Search className="w-2.5 h-2.5" />}{msg.tool === "code" && <Code className="w-2.5 h-2.5" />}{msg.tool === "photo" && <ImageIcon className="w-2.5 h-2.5" />}{msg.tool === "music" && <Music className="w-2.5 h-2.5" />}{TOOL_LABELS[msg.tool] || msg.tool}</span></div>}
          </div>
        </div>
      );
    }

    if (role === "admin") {
      return (
        <div className="animate-fade-in-up">
          <div className="max-w-[80%]">
            <div className="flex items-center gap-2 mb-1.5"><div className="w-5 h-5 rounded-md bg-red-600/10 flex items-center justify-center"><Shield className="w-3 h-3 text-red-400" /></div><span className="text-[11px] font-medium text-red-400">{t('chat.role.admin')}</span></div>
            {msg.imageUrl && <div className="mb-2"><img src={String(msg.imageUrl)} alt="" className="max-w-[300px] max-h-[300px] rounded-xl object-cover border border-red-500/10" /></div>}
            <div className="bg-red-600/5 border border-red-500/10 text-zinc-300 px-4 py-3 rounded-2xl rounded-tl-md text-sm"><MarkdownRenderer content={String(msg.content || "")} /></div>
          </div>
        </div>
      );
    }

    return (
      <div className="animate-fade-in-up">
        <div className="max-w-[80%]">
          <div className="flex items-center gap-2 mb-1.5"><ModelLogo modelId={msg.model || ""} size={18} /><span className="text-[11px] font-medium text-zinc-400">{msgModel.name}</span></div>
          {hasSpecialType ? <SpecialMessage msg={msg} /> : (
            <>
              {msg.imageUrl && <div className="mb-2"><img src={String(msg.imageUrl)} alt="" className="max-w-[300px] max-h-[300px] rounded-xl object-cover border border-white/[0.06]" /></div>}
              {msg.audioUrl && <div className="mb-2"><AudioPlayer url={String(msg.audioUrl)} /></div>}
              <div className="text-zinc-300 text-sm leading-relaxed">
                {typingMessageId === msg.id ? (<div><MarkdownRenderer content={typingText} /><span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 animate-pulse align-middle" /></div>) : (<MarkdownRenderer content={String(msg.content || "")} />)}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // BAN SCREEN
  if (banInfo) {
    return (
      <div className="h-screen bg-[#050507] text-zinc-100 flex items-center justify-center px-6">
        <div className="w-full max-w-lg">
          {!selectedTicket && !showCreateTicket && (
            <div className="text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6"><Ban className="w-7 h-7 text-red-400" /></div>
              <h1 className="text-xl font-semibold mb-2">{t('ban.title')}</h1>
              <div className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-5 mb-4 text-left space-y-3">
                <div><label className="block text-[10px] text-zinc-600 uppercase tracking-wider mb-1">{t('ban.reason')}</label><p className="text-sm text-zinc-300">{banInfo.reason}</p></div>
                <div><label className="block text-[10px] text-zinc-600 uppercase tracking-wider mb-1">{t('ban.timeLeft')}</label>
                  {banInfo.duration === 0 ? <p className="text-sm text-red-400 font-medium">{t('ban.forever')}</p> : <div className="flex items-center gap-3"><p className="text-sm text-zinc-300">{banInfo.duration} {t('ban.min')}</p><div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-500/10"><Clock className="w-3 h-3 text-yellow-400" /><span className="text-xs font-mono text-yellow-400">{formatTimeLeft(banTimeLeft, t)}</span></div></div>}
                </div>
              </div>
              <div className="space-y-2 mb-6">
                <button onClick={() => setShowCreateTicket(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-all"><TicketCheck className="w-4 h-4" /> {t('ban.createTicket')}</button>
                {tickets.length > 0 && <p className="text-xs text-zinc-600">{t('ban.myTickets')} ({tickets.length}):</p>}
                {tickets.map((t_item: any) => (<button key={t_item.id} onClick={() => setSelectedTicket(t_item)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.04] bg-white/[0.01] hover:border-violet-500/20 transition-all text-left"><TicketCheck className={`w-4 h-4 shrink-0 ${t_item.status === "open" ? "text-emerald-400" : "text-zinc-600"}`} /><div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{t_item.subject}</p><p className="text-[10px] text-zinc-600">#{t_item.serialNumber} · {t_item.status === "open" ? t('ban.statusOpen') : t('ban.statusClosed')}</p></div></button>))}
              </div>
              <button onClick={async () => { await signOut(auth); navigate("/"); }} className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors flex items-center gap-1.5 mx-auto"><LogOut className="w-3 h-3" /> {t('chat.userMenu.logout')}</button>
            </div>
          )}
          {showCreateTicket && (
            <div>
              <button onClick={() => setShowCreateTicket(false)} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-4"><ChevronLeft className="w-3 h-3" /> {t('ban.back')}</button>
              <div className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-semibold">{t('ban.createTicket')}</h2>
                <div><label className="block text-xs text-zinc-500 mb-1.5">{t('ban.subject')}</label><input value={newTicketSubject} onChange={(e) => setNewTicketSubject(e.target.value)} placeholder={t('ban.subjectPlaceholder')} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40" /></div>
                <div><label className="block text-xs text-zinc-500 mb-1.5">{t('ban.message')}</label><textarea value={newTicketMessage} onChange={(e) => setNewTicketMessage(e.target.value)} rows={4} placeholder={t('ban.messagePlaceholder')} className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40 resize-none" /></div>
                <button onClick={createTicket} disabled={!newTicketSubject.trim() || !newTicketMessage.trim()} className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all">{t('ban.send')}</button>
              </div>
            </div>
          )}
          {selectedTicket && (
            <div className="flex flex-col" style={{ height: "80vh" }}>
              <div className="flex items-center gap-3 mb-4">
                <button onClick={() => { setSelectedTicket(null); setTicketMessages([]); }} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"><ChevronLeft className="w-3 h-3" /> {t('ban.back')}</button>
                <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{selectedTicket.subject}</p><p className="text-[10px] text-zinc-600">#{selectedTicket.serialNumber}</p></div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${selectedTicket.status === "open" ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"}`}>{selectedTicket.status === "open" ? t('ban.statusOpen') : t('ban.statusClosed')}</span>
              </div>
              <div className="flex-1 overflow-y-auto border border-white/[0.04] bg-white/[0.01] rounded-2xl p-4 space-y-3 mb-3">
                {ticketMessages.map((msg: any) => (<div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${msg.role === "user" ? "bg-violet-600/15 text-zinc-100 rounded-br-md" : "bg-white/[0.03] border border-white/[0.04] text-zinc-300 rounded-bl-md"}`}><p className="whitespace-pre-wrap">{msg.content}</p><p className="text-[9px] text-zinc-600 mt-1">{msg.role === "admin" && <span className="text-red-400 mr-1">{t('chat.role.admin')} · </span>}{new Date(msg.timestamp).toLocaleString(i18n.language, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p></div></div>))}
                <div ref={ticketEndRef} />
              </div>
              {selectedTicket.status === "open" ? (
                <div className="flex items-center gap-2">
                  <input value={ticketReply} onChange={(e) => setTicketReply(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendTicketReply(); }} placeholder={t('ban.writeMessage')} className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40" />
                  <button onClick={sendTicketReply} disabled={!ticketReply.trim()} className="p-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 transition-all"><SendIcon className="w-4 h-4" /></button>
                </div>
              ) : <p className="text-center text-xs text-zinc-600">{t('ban.ticketClosed')}</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // MAINTENANCE
  if (maintenance) {
    return (
      <div className="h-screen bg-[#050507] text-zinc-100 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 bg-yellow-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6"><Wrench className="w-6 h-6 text-yellow-500" /></div>
          <h1 className="text-xl font-semibold mb-2">{t('maintenance.title')}</h1>
          <p className="text-sm text-zinc-500 mb-4 leading-relaxed">{maintenanceMessage}</p>
          {maintenanceEstimate && <p className="text-xs text-zinc-600 mb-6">{t('maintenance.estimate', { time: maintenanceEstimate })}</p>}
          <div className="flex items-center justify-center gap-3 mb-8">
            <Link to="/" className="px-4 py-2 rounded-xl border border-white/[0.06] text-xs text-zinc-400 hover:text-zinc-200 transition-all">{t('maintenance.toHome')}</Link>
            <Link to="/uptime" className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 transition-all">{t('maintenance.systemStatus')}</Link>
          </div>
          {hasAdminAccess ? <Link to="/admin" className="inline-flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 transition-colors"><Lock className="w-3 h-3" /> {t('chat.profile.adminPanel')}</Link> : (
            <div className="mt-4">
              {!showAdminLogin ? <button onClick={() => setShowAdminLogin(true)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">{t('maintenance.areYouAdmin')}</button> : (
                <div className="max-w-xs mx-auto border border-white/[0.06] bg-white/[0.01] rounded-xl p-4 space-y-3">
                  <p className="text-xs text-zinc-500">{t('maintenance.enterPassword')}</p>
                  <div className="flex gap-2">
                    <input type="password" value={maintenanceAdminPass} onChange={(e) => setMaintenanceAdminPass(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleMaintenanceAdmin(); }} placeholder={t('admin.passwordPlaceholder')} autoFocus className="flex-1 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-violet-500/30" />
                    <button onClick={handleMaintenanceAdmin} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 transition-colors">{t('admin.loginBtn')}</button>
                  </div>
                  {maintenanceAdminError && <p className="text-[10px] text-red-400">{maintenanceAdminError}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const isModelDisabled = isModelDisabledCheck(selectedModel.id);
  const noModelsAvailable = enabledModels.length === 0;

  return (
    <div className="h-screen bg-[#050507] text-zinc-100 flex flex-col overflow-hidden">
      {/* Admin viewing banner */}
      {viewAsUser && (
        <div className="shrink-0 bg-violet-600/10 border-b border-violet-500/20 px-4 py-1.5 flex items-center justify-center gap-2">
          <Eye className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-[11px] text-violet-300 font-medium">{t('admin.viewingBanner')}</span>
        </div>
      )}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} />}
        {/* Sidebar */}
        <div className={`shrink-0 border-r border-white/[0.04] bg-[#0a0a0d] flex transition-all duration-300 ease-in-out overflow-hidden absolute md:relative z-40 h-full`} style={{ width: sidebarOpen ? 260 : 0 }}>
          <div className="w-[260px] min-w-[260px] flex flex-col h-full">
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <button onClick={createNewChat} className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-white/[0.06] text-sm font-medium hover:bg-white/[0.03] transition-all duration-200"><Plus className="w-4 h-4" /> {t('chat.newChat')}</button>
                <button onClick={() => setSidebarOpen(false)} className="p-2.5 rounded-xl border border-white/[0.06] hover:bg-white/[0.03] text-zinc-500 transition-all duration-200" title={t('chat.closeSidebar')}><PanelLeftClose className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-700" /><input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t('chat.searchChats')} className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[11px] text-white placeholder-zinc-700 focus:outline-none focus:border-violet-500/30 transition-all duration-200" /></div>
                <div className="relative">
                  <button onClick={() => setShowSortMenu(!showSortMenu)} className="p-1.5 rounded-lg hover:bg-white/[0.03] text-zinc-600 transition-all">{sortMode === "recent" ? <Clock className="w-3.5 h-3.5" /> : sortMode === "alphabetical" ? <ArrowDownAZ className="w-3.5 h-3.5" /> : <MessageCircle className="w-3.5 h-3.5" />}</button>
                  {showSortMenu && (<><div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} /><div className="absolute right-0 top-full mt-1 w-44 bg-[#111114] border border-white/[0.06] rounded-xl shadow-2xl z-50 overflow-hidden p-1 animate-fade-in-up">{([{ mode: "recent" as SortMode, label: t('chat.sortByDate'), icon: Clock }, { mode: "alphabetical" as SortMode, label: t('chat.sortByAlpha'), icon: ArrowDownAZ }, { mode: "messages" as SortMode, label: t('chat.sortByMsgs'), icon: MessageCircle }]).map((s) => (<button key={s.mode} onClick={() => { setSortMode(s.mode); setShowSortMenu(false); }} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${sortMode === s.mode ? "bg-violet-600/10 text-violet-300" : "text-zinc-500 hover:bg-white/[0.03]"}`}><s.icon className="w-3 h-3" /> {s.label} {sortMode === s.mode && <Check className="w-3 h-3 ml-auto text-violet-400" />}</button>))}</div></>)}
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">
              {sortedFolders.map((folder) => {
                const folderChats = folderedChats.filter(c => c.folderId === folder.id);
                return (
                  <div key={folder.id} onDragOver={(e) => handleDragOverFolder(e, folder.id)} onDrop={() => handleDropOnFolder(folder.id)} className={`mb-1 transition-all duration-200 ${dragOverTarget === `folder-${folder.id}` ? "ring-1 ring-violet-500/30 rounded-lg" : ""}`}>
                    <div className="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer transition-all" onClick={() => toggleFolderCollapse(folder.id)} onContextMenu={(e) => { e.preventDefault(); setFolderContextMenu({ folderId: folder.id, x: e.clientX, y: e.clientY }); }}>
                      <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${!folder.collapsed ? "rotate-90" : ""}`} />
                      {folder.collapsed ? <Folder className="w-3 h-3 text-violet-400/60" /> : <FolderOpen className="w-3 h-3 text-violet-400" />}
                      {renamingFolderId === folder.id ? (<input value={renameFolderValue} onChange={(e) => setRenameFolderValue(e.target.value)} onBlur={() => renameFolder(folder.id, renameFolderValue)} onKeyDown={(e) => { if (e.key === "Enter") renameFolder(folder.id, renameFolderValue); if (e.key === "Escape") setRenamingFolderId(null); }} className="flex-1 bg-transparent text-xs text-zinc-200 focus:outline-none border-b border-violet-500/40 py-0" autoFocus onClick={(e) => e.stopPropagation()} />) : (<span className="flex-1 truncate font-medium">{folder.name}</span>)}
                      <span className="text-[10px] text-zinc-700">{folderChats.length}</span>
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-all">
                        <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); setRenamingFolderId(folder.id); setRenameFolderValue(folder.name); }} className="p-0.5 hover:text-violet-400 transition-colors"><Pencil className="w-2.5 h-2.5" /></button>
                        <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); deleteFolder(folder.id, true); }} className="p-0.5 hover:text-red-400 transition-colors" title={t('chat.ungroupFolder')}><X className="w-2.5 h-2.5" /></button>
                      </div>
                    </div>
                    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${folder.collapsed ? "max-h-0 opacity-0" : "max-h-[2000px] opacity-100"}`}><div className="pl-3 space-y-0.5">{folderChats.map(renderChatItem)}{folderChats.length === 0 && <div className="text-[10px] text-zinc-800 px-3 py-2">{t('chat.emptyFolder')}</div>}</div></div>
                  </div>
                );
              })}
              {unfolderedChats.map(renderChatItem)}
              {chatSessions.length === 0 && <div className="text-center py-10 text-zinc-700 text-xs">{t('chat.noChats')}</div>}
            </div>
            <div className="p-3 border-t border-white/[0.04] relative">
              <button onClick={() => setShowUserMenu(!showUserMenu)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-all text-left">
                <div className="w-7 h-7 rounded-lg bg-violet-600/20 flex items-center justify-center text-xs font-medium text-violet-400">{profileData.visibleNick?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}</div>
                <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{profileData.visibleNick || user?.displayName || "User"}</p><p className="text-[11px] text-zinc-600 truncate">{user?.email}</p></div>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
              </button>
              {showUserMenu && (<><div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} /><div className="absolute bottom-full left-3 right-3 mb-1 bg-[#111114] border border-white/[0.06] rounded-xl overflow-hidden z-50 shadow-2xl animate-fade-in-up">
                <Link to="/" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-3 py-2.5 text-xs text-zinc-400 hover:bg-white/[0.03] transition-all"><Home className="w-3.5 h-3.5" /> {t('chat.userMenu.home')}</Link>
                <button onClick={() => { setShowProfile(true); setShowUserMenu(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-zinc-400 hover:bg-white/[0.03] transition-all"><User className="w-3.5 h-3.5" /> {t('chat.userMenu.profile')}</button>
                <button onClick={() => { setShowSettings(true); setShowUserMenu(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-zinc-400 hover:bg-white/[0.03] transition-all"><Settings className="w-3.5 h-3.5" /> {t('chat.userMenu.settings')}</button>
                <div className="border-t border-white/[0.04]" />
                <button onClick={async () => { await signOut(auth); navigate("/"); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-red-400 hover:bg-white/[0.03] transition-all"><LogOut className="w-3.5 h-3.5" /> {t('chat.userMenu.logout')}</button>
              </div></>)}
            </div>
          </div>
        </div>

        {/* Context menus */}
        {chatContextMenu && (<><div className="fixed inset-0 z-50" onClick={() => setChatContextMenu(null)} /><div className="fixed z-50 bg-[#111114] border border-white/[0.06] rounded-xl shadow-2xl overflow-hidden w-48 p-1 animate-fade-in-up" style={{ left: chatContextMenu.x, top: chatContextMenu.y }}>
          <button onClick={() => { setRenamingChatId(chatContextMenu.chatId); setRenameValue(chatSessions.find(c => c.id === chatContextMenu.chatId)?.title || ""); setChatContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-400 hover:bg-white/[0.03] transition-all"><Pencil className="w-3 h-3" /> {t('chat.rename')}</button>
          {chatSessions.find(c => c.id === chatContextMenu.chatId)?.folderId && <button onClick={() => { moveChatToFolder(chatContextMenu.chatId, null); setChatContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-400 hover:bg-white/[0.03] transition-all"><FolderOpen className="w-3 h-3" /> {t('chat.removeFromFolder')}</button>}
          <button onClick={() => { deleteChat(chatContextMenu.chatId); setChatContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-white/[0.03] transition-all"><Trash2 className="w-3 h-3" /> {t('chat.delete')}</button>
        </div></>)}
        {folderContextMenu && (<><div className="fixed inset-0 z-50" onClick={() => setFolderContextMenu(null)} /><div className="fixed z-50 bg-[#111114] border border-white/[0.06] rounded-xl shadow-2xl overflow-hidden w-52 p-1 animate-fade-in-up" style={{ left: folderContextMenu.x, top: folderContextMenu.y }}>
          <button onClick={() => { setRenamingFolderId(folderContextMenu.folderId); setRenameFolderValue(folders.find(f => f.id === folderContextMenu.folderId)?.name || ""); setFolderContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-400 hover:bg-white/[0.03] transition-all"><Pencil className="w-3 h-3" /> {t('chat.renameFolder')}</button>
          <button onClick={() => { deleteFolder(folderContextMenu.folderId, true); setFolderContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-400 hover:bg-white/[0.03] transition-all"><FolderOpen className="w-3 h-3" /> {t('chat.ungroupFolder')}</button>
          <button onClick={() => { deleteFolder(folderContextMenu.folderId, false); setFolderContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-white/[0.03] transition-all"><Trash2 className="w-3 h-3" /> {t('chat.deleteFolderWithChats')}</button>
        </div></>)}

        {/* Profile Modal */}
        {showProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowProfile(false)}>
            <div ref={profileRef} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-[#111114] border border-white/[0.06] rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">
              <div className="p-6 pb-4 border-b border-white/[0.04]">
                <div className="flex items-center justify-between mb-4"><h2 className="text-sm font-semibold">{t('chat.profile.title')}</h2><button onClick={() => setShowProfile(false)} className="p-1 rounded-lg hover:bg-white/[0.05] text-zinc-500 transition-all"><X className="w-4 h-4" /></button></div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-violet-600/20 flex items-center justify-center text-lg font-semibold text-violet-400">{profileData.visibleNick?.[0]?.toUpperCase() || "U"}</div>
                  <div>
                    {editingVisibleNick ? (<div className="flex items-center gap-1.5"><input value={visibleNickInput} onChange={(e) => setVisibleNickInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveVisibleNick(); if (e.key === "Escape") setEditingVisibleNick(false); }} className="text-sm font-medium bg-transparent border-b border-violet-500/40 focus:outline-none text-zinc-100 w-32" autoFocus /><button onClick={saveVisibleNick} className="p-0.5 text-violet-400 hover:text-violet-300 transition-colors"><Check className="w-3.5 h-3.5" /></button></div>) : (<div className="flex items-center gap-1.5"><p className="text-sm font-medium">{profileData.visibleNick}</p><button onClick={() => { setEditingVisibleNick(true); setVisibleNickInput(profileData.visibleNick); }} className="p-0.5 text-zinc-600 hover:text-violet-400 transition-colors"><Pencil className="w-3 h-3" /></button></div>)}
                    <p className="text-[11px] text-zinc-600">{t('chat.profile.id')}: {profileData.id}</p>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div><label className="block text-[10px] text-zinc-600 uppercase tracking-wider mb-1">{t('chat.profile.systemNick')}</label><p className="text-sm text-zinc-300 font-mono">{profileData.systemNick}</p></div>

                {/* Subscription Card */}
                <div><label className="block text-[10px] text-zinc-600 uppercase tracking-wider mb-2">{t('chat.profile.plan')}</label>
                  {profileData.plan === "ultra" ? (
                    <ElectricBorder color="#f59e0b" speed={1} chaos={0.12} borderRadius={16} className="w-full">
                      <div className="bg-[#0d0d10] p-4 rounded-2xl">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-500/30 to-amber-600/30 flex items-center justify-center">
                              <Gem className="w-4 h-4 text-yellow-400" />
                            </div>
                            <span className="text-sm font-bold bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500 bg-clip-text text-transparent">ULTRA</span>
                          </div>
                          <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">{t('chat.profile.active')}</span>
                        </div>
                        <p className="text-[11px] text-zinc-500">{t('chat.profile.ultraDesc')}</p>
                      </div>
                    </ElectricBorder>
                  ) : profileData.plan === "pro" ? (
                    <div className="bg-violet-600/10 border border-violet-500/30 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center">
                            <Crown className="w-4 h-4 text-violet-400" />
                          </div>
                          <span className="text-sm font-bold text-violet-400">PRO</span>
                        </div>
                        <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">{t('chat.profile.active')}</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mb-3">{t('chat.profile.proDesc')}</p>
                      <Link to="/payment?plan=ultra&price=1299" onClick={() => setShowProfile(false)} className="block w-full py-2 rounded-xl text-center text-xs font-medium bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border border-yellow-500/20 text-yellow-400 hover:from-yellow-500/20 hover:to-amber-500/20 transition-all">
                        {t('chat.profile.upgradeToUltra')}
                      </Link>
                    </div>
                  ) : (
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                            <Sparkles className="w-4 h-4 text-zinc-500" />
                          </div>
                          <span className="text-sm font-medium text-zinc-400">{t('chat.profile.free')}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-zinc-600 mb-3">{t('chat.profile.freeDesc')}</p>
                      <Link to="/payment?plan=pro&price=499" onClick={() => setShowProfile(false)} className="block w-full py-2 rounded-xl text-center text-xs font-medium bg-violet-600 text-white hover:bg-violet-500 transition-all">
                        {t('chat.profile.upgradeToPro')}
                      </Link>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-white/[0.04] space-y-2">
                  <Link to="/terms" onClick={() => setShowProfile(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-400 hover:bg-white/[0.03] transition-all"><FileText className="w-3.5 h-3.5" /> {t('chat.profile.terms')}</Link>
                  {hasAdminAccess ? <Link to="/admin" onClick={() => setShowProfile(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-violet-400 hover:bg-violet-600/10 transition-all"><Lock className="w-3.5 h-3.5" /> {t('chat.profile.adminPanel')}</Link> : (
                    <div className="space-y-1.5"><div className="flex items-center gap-1.5"><div className="relative flex-1"><Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-700" /><input type="password" value={adminInput} onChange={(e) => setAdminInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleAdminAccess(); }} placeholder={t('chat.profile.adminPassword')} className="w-full pl-8 pr-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-violet-500/30 transition-all" /></div><button onClick={handleAdminAccess} className="px-3 py-2 rounded-lg bg-violet-600/10 text-violet-400 text-xs font-medium hover:bg-violet-600/20 transition-all">{t('chat.profile.login')}</button></div>{adminError && <p className="text-[10px] text-red-400">{adminError}</p>}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={() => setShowSettings(false)}>
            <div onClick={(e: React.MouseEvent) => e.stopPropagation()} className="w-full max-w-sm bg-[#111114] border border-white/[0.06] rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">
              <div className="p-6 pb-4 border-b border-white/[0.04]">
                <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{t('chat.userMenu.settings')}</h2><button onClick={() => setShowSettings(false)} className="p-1 rounded-lg hover:bg-white/[0.05] text-zinc-500 transition-all"><X className="w-4 h-4" /></button></div>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="w-3.5 h-3.5 text-violet-400" />
                    <label className="text-[10px] text-zinc-600 uppercase tracking-wider">{t('settings.language')}</label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {['en', 'ru', 'es', 'fr', 'de', 'zh'].map((lng: string) => (
                      <button
                        key={lng}
                        onClick={() => {
                          i18n.changeLanguage(lng);
                          if (user) update(ref(db, `users/${user.uid}`), { language: lng });
                        }}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${i18n.language === lng ? "bg-violet-600/10 border-violet-500/30 text-violet-300" : "bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:border-white/[0.1]"}`}
                      >
                        <span className="text-xs font-medium">{t(`common.languages.${lng}`)}</span>
                        {i18n.language === lng && <Check className="w-3 h-3 text-violet-400" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                    <label className="text-[10px] text-zinc-600 uppercase tracking-wider">{t('settings.theme')}</label>
                  </div>
                  <div className="flex gap-2 p-1 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                    <button className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-violet-600/10 text-violet-300 text-xs font-medium">
                      <Square className="w-3 h-3 fill-current" /> {t('settings.dark')}
                    </button>
                    <button className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-zinc-600 text-xs font-medium cursor-not-allowed">
                      <Square className="w-3 h-3" /> {t('settings.light')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-12 border-b border-white/[0.04] flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-2">{!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-white/[0.03] text-zinc-500 transition-all"><PanelLeft className="w-4 h-4" /></button>}</div>
            <div className="relative">
              <button onClick={() => setShowModelPicker(!showModelPicker)} className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-white/[0.03] transition-all text-sm ${isModelDisabled ? "opacity-50" : ""}`}>
                <ModelLogo modelId={selectedModel.id} size={18} /><span className="font-medium">{selectedModel.name}</span>{isModelDisabled && <AlertTriangle className="w-3 h-3 text-zinc-500" />}<ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
              </button>
              {showModelPicker && (<><div className="fixed inset-0 z-40" onClick={() => setShowModelPicker(false)} /><div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-72 bg-[#111114] border border-white/[0.06] rounded-xl shadow-2xl z-50 overflow-hidden p-1 animate-fade-in-up">
                {allModels.map((m) => { const dis = isModelDisabledCheck(m.id); return (<button key={m.id} onClick={() => { if (!dis) handleModelChange(m); }} disabled={dis} className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-3 transition-all ${dis ? "opacity-30 cursor-not-allowed" : selectedModel.id === m.id ? "bg-violet-600/10 text-violet-300" : "text-zinc-400 hover:bg-white/[0.03]"}`}><ModelLogo modelId={m.id} size={22} /><div className="flex-1 min-w-0"><div className="text-xs font-medium flex items-center gap-2">{m.name}{dis && <span className="text-[9px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{t('chat.unavailable')}</span>}</div><div className="text-[11px] text-zinc-600">{m.provider}</div></div>{!dis && selectedModel.id === m.id && <Check className="w-3.5 h-3.5 text-violet-400 shrink-0" />}</button>); })}
              </div></>)}
            </div>
            <div className="w-8" />
          </div>

          <div className="flex-1 overflow-y-auto">
            {noModelsAvailable ? (
              <div className="h-full flex items-center justify-center px-6"><div className="text-center"><div className="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4"><AlertTriangle className="w-6 h-6 text-zinc-500" /></div><h2 className="text-lg font-semibold mb-2">{t('chat.noModelsTitle')}</h2><p className="text-sm text-zinc-500">{t('chat.noModelsDesc')}</p></div></div>
            ) : isModelDisabled ? (
              <div className="h-full flex items-center justify-center px-6"><div className="text-center"><div className="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4"><AlertTriangle className="w-6 h-6 text-zinc-500" /></div><h2 className="text-lg font-semibold mb-2">{selectedModel.name} {t('chat.modelUnavailable')}</h2><p className="text-sm text-zinc-500 mb-4">{t('chat.chooseAnother')}</p><button onClick={() => { if (enabledModels.length > 0) handleModelChange(enabledModels[0]); }} className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 transition-all">{t('chat.switchModel')} {enabledModels[0]?.name || t('chat.availableModel')}</button></div></div>
            ) : messages.length === 0 && !isGenerating ? (
              <div className="h-full flex items-center justify-center px-6"><div className="text-center max-w-md"><ModelLogo modelId={selectedModel.id} size={36} className="mx-auto mb-4" /><h2 className="text-lg font-semibold mb-1">{t('chat.chatWith')} {selectedModel.name}</h2><p className="text-sm text-zinc-600 mb-8">{selectedModel.provider}</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{currentSuggestions.map((s: string) => (<button key={s} onClick={() => { setInput(t(s)); inputRef.current?.focus(); }} className="px-4 py-3 rounded-xl border border-white/[0.04] text-xs text-zinc-500 hover:text-zinc-300 hover:border-violet-500/20 transition-all text-left">{t(s)}</button>))}</div></div></div>
            ) : (
              <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
                {messages.map((msg: any) => <div key={msg.id}>{renderMessage(msg)}</div>)}
                {isGenerating && !typingMessageId && (
                  <div className="animate-fade-in-up"><div className="flex items-center gap-2 mb-1.5"><ModelLogo modelId={selectedModel.id} size={18} /><span className="text-[11px] font-medium text-zinc-400">{selectedModel.name}</span></div><div className="flex gap-1 py-2">{[0, 1, 2].map((i) => (<div key={i} className="w-1.5 h-1.5 bg-violet-500/40 rounded-full animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />))}</div></div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input area - tools are just indicator buttons, NO file upload for users */}
          <div className="p-4">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center gap-1.5 mb-2">
                {([
                  { key: "search" as ToolType, icon: Search, label: t('chat.tools.search') },
                  { key: "code" as ToolType, icon: Code, label: t('chat.tools.code') },
                  { key: "photo" as ToolType, icon: ImageIcon, label: t('chat.tools.photo') },
                  { key: "music" as ToolType, icon: Music, label: t('chat.tools.music') },
                ]).map((t) => (
                  <button key={t.key} onClick={() => handleToolSelect(t.key)} title={t.label}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 ${activeTool === t.key ? "bg-violet-600/15 text-violet-400 border border-violet-500/20" : "text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.03] border border-transparent"}`}>
                    <t.icon className="w-3.5 h-3.5" /><span className="hidden sm:inline">{t.label}</span>
                  </button>
                ))}
              </div>
              <div className={`flex items-end gap-2 border bg-white/[0.01] rounded-2xl px-4 py-3 transition-all duration-200 ${charOverLimit ? "border-red-500/30" : isModelDisabled || noModelsAvailable ? "border-zinc-800 opacity-50" : "border-white/[0.06] focus-within:border-violet-500/30"}`}>
                <textarea ref={inputRef} value={input} onChange={(e) => { if (e.target.value.length <= MAX_CHARS + 100) setInput(e.target.value); }}
                  onKeyDown={handleKeyDown} placeholder={isModelDisabled || noModelsAvailable ? t('chat.modelUnavailable') : `${t('chat.inputPlaceholder')} ${selectedModel.name}...`}
                  rows={1} disabled={isModelDisabled || noModelsAvailable}
                  className="flex-1 bg-transparent text-sm placeholder-zinc-700 focus:outline-none resize-none max-h-32 min-h-[20px] disabled:cursor-not-allowed" style={{ height: "20px" }}
                  onInput={(e) => { const el = e.target as HTMLTextAreaElement; el.style.height = "20px"; el.style.height = Math.min(el.scrollHeight, 128) + "px"; }} />
                <div className="flex items-center gap-2 shrink-0">
                  {charCount > 0 && <span className={`text-[10px] tabular-nums ${charOverLimit ? "text-red-400" : "text-zinc-700"}`}>{charCount}/{MAX_CHARS}</span>}
                  {isGenerating || godModeActive === "manual" ? (
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center cursor-default" title={godModeActive === "manual" ? t('chat.waitingOperator') : t('chat.generating')}>
                      <Square className="w-3 h-3 text-zinc-900 fill-zinc-900" />
                    </div>
                  ) : (
                    <button onClick={sendMessage} disabled={!input.trim() || charOverLimit || isModelDisabled || noModelsAvailable}
                      className="p-2 rounded-xl text-zinc-600 hover:text-violet-400 hover:bg-violet-600/10 disabled:text-zinc-800 transition-all"><Send className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
              <p className="text-center text-[10px] text-zinc-700 mt-2">{t('chat.disclaimer')}</p>
            </div>
          </div>
        </div>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
