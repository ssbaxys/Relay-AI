import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { ref, push, onValue, serverTimestamp, query, orderByChild, remove, update, set } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../firebase";
import { useAuth } from "../App";
import MarkdownRenderer from "../components/MarkdownRenderer";
import {
  Plus, Search, Send, ChevronDown, ChevronRight,
  LogOut, Trash2, MessageSquare, Check, Square,
  Folder, Pencil, X, ArrowDownAZ, Clock, MessageCircle,
  GripVertical, FolderOpen, Home, User, Lock, FileText, PanelLeftClose, PanelLeft,
  Shield, Wrench, AlertTriangle, ImagePlus
} from "lucide-react";

const MAX_CHARS = 2000;

interface Message {
  id: string;
  role: "user" | "assistant" | "admin";
  content: string;
  model: string;
  timestamp: number;
  imageUrl?: string;
}

interface ChatSession {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  lastMessage: number;
  messageCount: number;
  folderId?: string;
}

interface ChatFolder {
  id: string;
  name: string;
  createdAt: number;
  collapsed?: boolean;
}

type SortMode = "recent" | "alphabetical" | "messages";

const MODEL_LOGOS: Record<string, { src: string; filter?: string }> = {
  "gpt-5.2-codex": { src: "https://img.icons8.com/fluency-systems-regular/48/chatgpt.png", filter: "invert(1) brightness(2)" },
  "claude-opus-4.6": { src: "https://img.icons8.com/fluency/48/claude-ai.png" },
  "gemini-3-pro": { src: "https://img.icons8.com/color/48/google-logo.png" },
};

function ModelLogo({ modelId, size = 20, className = "" }: { modelId: string; size?: number; className?: string }) {
  const logo = MODEL_LOGOS[modelId];
  if (!logo) {
    return (
      <div className={`bg-violet-600/10 rounded-lg flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
        <span className="text-violet-400 font-bold" style={{ fontSize: size * 0.4 }}>R</span>
      </div>
    );
  }
  return <img src={logo.src} alt={modelId} width={size} height={size} className={className} style={{ filter: logo.filter || "none" }} />;
}

const allModels = [
  { id: "gpt-5.2-codex", name: "GPT-5.2 Codex", provider: "OpenAI", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { id: "claude-opus-4.6", name: "Claude Opus 4.6", provider: "Anthropic", color: "text-orange-400", bg: "bg-orange-500/10" },
  { id: "gemini-3-pro", name: "Gemini 3 Pro", provider: "Google", color: "text-blue-400", bg: "bg-blue-500/10" },
];

const modelSuggestions: Record<string, string[]> = {
  "gpt-5.2-codex": [
    "Напиши REST API на Node.js с авторизацией", "Создай React компонент для drag & drop",
    "Оптимизируй этот SQL запрос", "Напиши CLI утилиту на Python",
    "Сделай WebSocket сервер на Go", "Напиши парсер JSON на Rust",
    "Реализуй алгоритм A* на TypeScript", "Создай Docker Compose для микросервисов",
    "Напиши unit тесты для этой функции", "Рефакторинг legacy кода на Java",
  ],
  "claude-opus-4.6": [
    "Составь бизнес-план для SaaS стартапа", "Напиши эссе о будущем AI",
    "Проанализируй философию стоицизма", "Создай маркетинговую стратегию",
    "Сравни книги Достоевского и Толстого", "Объясни теорию игр простыми словами",
    "Напиши сценарий для подкаста", "Проведи SWOT анализ компании Tesla",
    "Составь резюме для продакт-менеджера", "Объясни квантовые вычисления",
  ],
  "gemini-3-pro": [
    "Переведи текст на 5 языков", "Проанализируй этот датасет",
    "Объясни квантовые вычисления", "Создай презентацию о нейросетях",
    "Составь план путешествия по Японии", "Сравни архитектуры Transformer и Mamba",
    "Объясни теорию относительности", "Создай инфографику про изменение климата",
    "Переведи и адаптируй рекламный текст", "Проанализируй тренды в AI за 2025",
  ],
};

const responses = [
  "Это отличный вопрос. Давайте разберёмся подробнее.\n\nС моей точки зрения, есть несколько **ключевых аспектов**, которые стоит рассмотреть:\n\n1. **Контекст** — важно понимать, о чём идёт речь\n2. **Детали** — каждая ситуация уникальна\n3. **Подход** — системный анализ всегда лучше\n\n> Помните: правильный вопрос — это уже половина ответа.\n\nЕсли у вас есть дополнительные вопросы — спрашивайте.",
  "Вот что я могу сказать:\n\n## Основные моменты\n\n- **Ключевой момент** — важно понимать контекст\n- **Детали** — каждая ситуация уникальна\n- **Рекомендация** — подходите к этому системно\n\n| Подход | Плюсы | Минусы |\n|--------|-------|--------|\n| Метод A | Быстрый | Менее точный |\n| Метод B | Точный | Медленнее |\n\nНадеюсь, это поможет!",
  "Рад помочь! Вот развёрнутый ответ:\n\n### Пример кода\n\n```python\ndef solve(data):\n    # Обработка данных\n    result = process(data)\n    return optimize(result)\n```\n\nЭтот подход позволяет эффективно решить задачу. Ключевые моменты:\n\n1. Функция `process()` выполняет первичную обработку\n2. Функция `optimize()` оптимизирует результат\n\n> **Совет:** Всегда тестируйте код на граничных случаях.",
  "Хороший вопрос. Существует несколько подходов:\n\n### Шаг 1: Определите цель\nЧто именно нужно достичь? Это самый *важный* шаг.\n\n### Шаг 2: Выберите метод\nПодберите оптимальный инструмент для задачи.\n\n### Шаг 3: Протестируйте\nУбедитесь в корректности результата.\n\n---\n\nПолезные ресурсы:\n- [Документация](https://docs.example.com)\n- [Примеры](https://examples.com)\n\nМогу помочь с любым из этих шагов. Используйте `inline code` для обозначения кода в тексте.",
];

function getRandomSuggestions(modelId: string): string[] {
  const pool = modelSuggestions[modelId] || modelSuggestions["gpt-5.2-codex"];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 4);
}

function getModelInfo(modelId: string) {
  return allModels.find(m => m.id === modelId) || allModels[0];
}

export default function ChatPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Disabled models from Firebase
  const [disabledModels, setDisabledModels] = useState<Record<string, boolean>>({});

  const [selectedModel, setSelectedModel] = useState(allModels[0]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
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
  const [profileData, setProfileData] = useState<{ displayName: string; systemNick: string; visibleNick: string; id: string }>({ displayName: "", systemNick: "", visibleNick: "", id: "" });
  const [editingVisibleNick, setEditingVisibleNick] = useState(false);
  const [visibleNickInput, setVisibleNickInput] = useState("");
  const [adminInput, setAdminInput] = useState("");
  const [adminError, setAdminError] = useState("");
  const [currentSuggestions, setCurrentSuggestions] = useState(() => getRandomSuggestions(allModels[0].id));
  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [maintenanceEstimate, setMaintenanceEstimate] = useState("");
  const [godModeActive, setGodModeActive] = useState<string | null>(null);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [maintenanceAdminPass, setMaintenanceAdminPass] = useState("");
  const [maintenanceAdminError, setMaintenanceAdminError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const generationAbortRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasAdminAccess = typeof window !== "undefined" && localStorage.getItem("relay_admin") === "true";

  const isModelDisabledCheck = useCallback((modelId: string) => {
    return !!disabledModels[modelId];
  }, [disabledModels]);

  const enabledModels = useMemo(() => allModels.filter(m => !isModelDisabledCheck(m.id)), [isModelDisabledCheck]);

  // ========================
  // FIREBASE LISTENERS
  // ========================

  // Listen for disabled models — key fix: use onValue directly
  useEffect(() => {
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
  }, []);

  // If selected model becomes disabled, auto-switch to first enabled
  useEffect(() => {
    if (isModelDisabledCheck(selectedModel.id) && enabledModels.length > 0) {
      setSelectedModel(enabledModels[0]);
    }
  }, [disabledModels, selectedModel.id, enabledModels, isModelDisabledCheck]);

  // Listen for maintenance
  useEffect(() => {
    const unsub = onValue(ref(db, "settings"), (snap) => {
      const data = snap.val();
      if (data) {
        setMaintenance(!!data.maintenance);
        setMaintenanceMessage(data.maintenanceMessage || "Мы проводим плановые технические работы.");
        setMaintenanceEstimate(data.maintenanceEstimate || "");
      } else {
        setMaintenance(false);
      }
    });
    return () => unsub();
  }, []);

  // Listen for god mode on current chat
  useEffect(() => {
    if (!user || !currentChatId) { setGodModeActive(null); return; }
    const unsub = onValue(ref(db, `godmode/${user.uid}/${currentChatId}`), (snap) => {
      const data = snap.val();
      if (data && data.mode && data.mode !== "auto") {
        setGodModeActive(data.mode);
      } else {
        setGodModeActive(null);
      }
    });
    return () => unsub();
  }, [user, currentChatId]);

  useEffect(() => {
    setCurrentSuggestions(getRandomSuggestions(selectedModel.id));
  }, [selectedModel.id]);

  // Load user profile
  useEffect(() => {
    if (!user) return;
    const unsub = onValue(ref(db, `users/${user.uid}`), (snap) => {
      const data = snap.val();
      if (data) {
        setProfileData({
          displayName: data.displayName || user.displayName || "User",
          systemNick: user.email || "",
          visibleNick: data.visibleNick || data.displayName || user.displayName || "User",
          id: data.uniqueId || "",
        });
        if (!data.uniqueId) {
          const uid = String(Math.floor(10000000 + Math.random() * 90000000));
          set(ref(db, `users/${user.uid}/uniqueId`), uid);
        }
      }
    });
    return () => unsub();
  }, [user]);

  // Load chats
  useEffect(() => {
    if (!user) return;
    const q = query(ref(db, `chats/${user.uid}`), orderByChild("createdAt"));
    const unsub = onValue(q, (snap) => {
      const data = snap.val();
      if (data) {
        const sessions: ChatSession[] = Object.entries(data).map(([id, v]: [string, any]) => ({
          id, title: v.title || "Новый чат", model: v.model || "gpt-5.2-codex",
          createdAt: v.createdAt || 0, lastMessage: v.lastMessage || v.createdAt || 0,
          messageCount: v.messageCount || 0, folderId: v.folderId || undefined,
        }));
        setChatSessions(sessions);
      } else setChatSessions([]);
    });
    return () => unsub();
  }, [user]);

  // Load folders
  useEffect(() => {
    if (!user) return;
    const unsub = onValue(ref(db, `folders/${user.uid}`), (snap) => {
      const data = snap.val();
      if (data) {
        const list: ChatFolder[] = Object.entries(data).map(([id, v]: [string, any]) => ({
          id, name: v.name || "Папка", createdAt: v.createdAt || 0, collapsed: v.collapsed || false,
        }));
        setFolders(list);
      } else setFolders([]);
    });
    return () => unsub();
  }, [user]);

  // Load messages
  useEffect(() => {
    if (!user || !currentChatId) { setMessages([]); return; }
    const q = query(ref(db, `messages/${user.uid}/${currentChatId}`), orderByChild("timestamp"));
    const unsub = onValue(q, (snap) => {
      const data = snap.val();
      if (data) {
        const msgs: Message[] = Object.entries(data).map(([id, v]: [string, any]) => ({
          id, role: v.role, content: v.content || "", model: v.model, timestamp: v.timestamp, imageUrl: v.imageUrl || undefined,
        })).sort((a, b) => a.timestamp - b.timestamp);
        setMessages(msgs);
      } else setMessages([]);
    });
    return () => unsub();
  }, [user, currentChatId]);

  // Load saved model for chat
  useEffect(() => {
    if (!currentChatId) return;
    const chatSession = chatSessions.find(c => c.id === currentChatId);
    if (chatSession && chatSession.model) {
      const modelInfo = allModels.find(m => m.id === chatSession.model);
      if (modelInfo && !isModelDisabledCheck(modelInfo.id)) {
        setSelectedModel(modelInfo);
      }
    }
  }, [currentChatId, chatSessions, isModelDisabledCheck]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingText, isGenerating]);

  // ========================
  // HANDLERS
  // ========================

  const handleModelChange = async (model: typeof allModels[0]) => {
    setSelectedModel(model);
    setShowModelPicker(false);
    if (currentChatId && user) {
      await update(ref(db, `chats/${user.uid}/${currentChatId}`), { model: model.id });
    }
  };

  const sortChats = useCallback((chats: ChatSession[]): ChatSession[] => {
    const s = [...chats];
    switch (sortMode) {
      case "recent": return s.sort((a, b) => b.lastMessage - a.lastMessage);
      case "alphabetical": return s.sort((a, b) => a.title.localeCompare(b.title, "ru"));
      case "messages": return s.sort((a, b) => b.messageCount - a.messageCount);
      default: return s;
    }
  }, [sortMode]);

  const filteredChats = useMemo(() => {
    return sortChats(chatSessions.filter(c => {
      if (!searchQuery.trim()) return true;
      return c.title.toLowerCase().includes(searchQuery.toLowerCase());
    }));
  }, [chatSessions, searchQuery, sortChats]);

  const folderedChats = filteredChats.filter(c => c.folderId);
  const unfolderedChats = filteredChats.filter(c => !c.folderId);
  const sortedFolders = [...folders].sort((a, b) => b.createdAt - a.createdAt);

  const createNewChat = async () => {
    if (!user) return;
    const nc = await push(ref(db, `chats/${user.uid}`), {
      title: "Новый чат", model: selectedModel.id,
      createdAt: serverTimestamp(), lastMessage: Date.now(), messageCount: 0,
    });
    setCurrentChatId(nc.key);
    setMessages([]);
    clearImagePreview();
  };

  const deleteChat = async (chatId: string) => {
    if (!user) return;
    await remove(ref(db, `chats/${user.uid}/${chatId}`));
    await remove(ref(db, `messages/${user.uid}/${chatId}`));
    if (currentChatId === chatId) { setCurrentChatId(null); setMessages([]); }
  };

  const renameChat = async (chatId: string, newTitle: string) => {
    if (!user || !newTitle.trim()) return;
    await update(ref(db, `chats/${user.uid}/${chatId}`), { title: newTitle.trim() });
    setRenamingChatId(null);
  };

  const renameFolder = async (folderId: string, newName: string) => {
    if (!user || !newName.trim()) return;
    await update(ref(db, `folders/${user.uid}/${folderId}`), { name: newName.trim() });
    setRenamingFolderId(null);
  };

  const toggleFolderCollapse = async (folderId: string) => {
    if (!user) return;
    const folder = folders.find(f => f.id === folderId);
    if (folder) await update(ref(db, `folders/${user.uid}/${folderId}`), { collapsed: !folder.collapsed });
  };

  const deleteFolder = async (folderId: string, scatter: boolean) => {
    if (!user) return;
    const chatsInFolder = chatSessions.filter(c => c.folderId === folderId);
    if (scatter) {
      for (const chat of chatsInFolder) await update(ref(db, `chats/${user.uid}/${chat.id}`), { folderId: null });
    } else {
      for (const chat of chatsInFolder) {
        await remove(ref(db, `chats/${user.uid}/${chat.id}`));
        await remove(ref(db, `messages/${user.uid}/${chat.id}`));
      }
    }
    await remove(ref(db, `folders/${user.uid}/${folderId}`));
  };

  const moveChatToFolder = async (chatId: string, folderId: string | null) => {
    if (!user) return;
    await update(ref(db, `chats/${user.uid}/${chatId}`), { folderId: folderId || null });
  };

  const handleDragStart = (chatId: string) => setDraggedChatId(chatId);
  const handleDragOverChat = (e: React.DragEvent, chatId: string) => {
    e.preventDefault();
    if (draggedChatId && draggedChatId !== chatId) setDragOverTarget(chatId);
  };
  const handleDragOverFolder = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    setDragOverTarget(`folder-${folderId}`);
  };

  const handleDropOnChat = async (targetChatId: string) => {
    if (!user || !draggedChatId || draggedChatId === targetChatId) {
      setDraggedChatId(null); setDragOverTarget(null); return;
    }
    const folderRef = await push(ref(db, `folders/${user.uid}`), { name: "Новая папка", createdAt: Date.now(), collapsed: false });
    if (folderRef.key) {
      await update(ref(db, `chats/${user.uid}/${draggedChatId}`), { folderId: folderRef.key });
      await update(ref(db, `chats/${user.uid}/${targetChatId}`), { folderId: folderRef.key });
    }
    setDraggedChatId(null); setDragOverTarget(null);
  };

  const handleDropOnFolder = async (folderId: string) => {
    if (!user || !draggedChatId) { setDraggedChatId(null); setDragOverTarget(null); return; }
    await moveChatToFolder(draggedChatId, folderId);
    setDraggedChatId(null); setDragOverTarget(null);
  };

  const handleDragEnd = () => { setDraggedChatId(null); setDragOverTarget(null); };

  // Image upload
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return;
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => setPreviewImage(reader.result as string);
    reader.readAsDataURL(file);
    if (e.target) e.target.value = "";
  };

  const clearImagePreview = () => {
    setPreviewImage(null);
    setSelectedFile(null);
  };

  const uploadImage = async (file: File): Promise<string> => {
    const timestamp = Date.now();
    const fileName = `chat-images/${user?.uid}/${timestamp}_${file.name}`;
    const sRef = storageRef(storage, fileName);
    await uploadBytes(sRef, file);
    return getDownloadURL(sRef);
  };

  const animateTyping = useCallback((fullText: string, messageId: string) => {
    setTypingMessageId(messageId);
    setTypingText("");
    let i = 0;
    const interval = setInterval(() => {
      if (generationAbortRef.current) {
        clearInterval(interval);
        setTypingMessageId(null); setTypingText(""); setIsGenerating(false);
        generationAbortRef.current = false;
        return;
      }
      if (i < fullText.length) {
        setTypingText(fullText.substring(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
        setTypingMessageId(null); setTypingText(""); setIsGenerating(false);
      }
    }, 10);
  }, []);

  const sendMessage = async () => {
    if ((!input.trim() && !selectedFile) || !user || isGenerating) return;
    if (isModelDisabledCheck(selectedModel.id)) return;
    const text = input.trim().substring(0, MAX_CHARS);
    setInput("");

    let chatId = currentChatId;
    const isFirstMessage = !chatId;
    if (!chatId) {
      const autoTitle = text ? (text.length > 50 ? text.substring(0, 47) + "..." : text) : "Изображение";
      const nc = await push(ref(db, `chats/${user.uid}`), {
        title: autoTitle, model: selectedModel.id,
        createdAt: serverTimestamp(), lastMessage: Date.now(), messageCount: 0,
      });
      chatId = nc.key;
      setCurrentChatId(chatId);
    }

    if (!isFirstMessage && chatId) {
      const currentChat = chatSessions.find(c => c.id === chatId);
      if (currentChat && currentChat.title === "Новый чат" && currentChat.messageCount === 0 && text) {
        const autoTitle = text.length > 50 ? text.substring(0, 47) + "..." : text;
        await update(ref(db, `chats/${user.uid}/${chatId}`), { title: autoTitle });
      }
    }

    let imageUrl: string | undefined;
    if (selectedFile) {
      setUploadingImage(true);
      try {
        imageUrl = await uploadImage(selectedFile);
      } catch (err) {
        console.error("Image upload failed:", err);
      }
      setUploadingImage(false);
      clearImagePreview();
    }

    const msgsRef = ref(db, `messages/${user.uid}/${chatId}`);
    const msgData: Record<string, any> = {
      role: "user", content: text, model: selectedModel.id, timestamp: Date.now(),
    };
    if (imageUrl) msgData.imageUrl = imageUrl;
    await push(msgsRef, msgData);

    const chatRef = ref(db, `chats/${user.uid}/${chatId}`);
    const currentChat = chatSessions.find(c => c.id === chatId);
    await update(chatRef, { lastMessage: Date.now(), messageCount: (currentChat?.messageCount || 0) + 1 });

    // If god mode is manual or admin, skip auto-response
    if (godModeActive === "manual" || godModeActive === "admin") return;

    setIsGenerating(true);
    generationAbortRef.current = false;

    setTimeout(async () => {
      if (generationAbortRef.current) { setIsGenerating(false); generationAbortRef.current = false; return; }
      const responseText = responses[Math.floor(Math.random() * responses.length)];
      const msgRef = await push(msgsRef, {
        role: "assistant", content: responseText, model: selectedModel.id, timestamp: Date.now(),
      });
      await update(chatRef, { lastMessage: Date.now(), messageCount: (currentChat?.messageCount || 0) + 2 });
      if (msgRef.key) animateTyping(responseText, msgRef.key);
    }, 600 + Math.random() * 800);
  };

  const stopGeneration = () => { generationAbortRef.current = true; };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const charCount = input.length;
  const charOverLimit = charCount > MAX_CHARS;

  useEffect(() => {
    const handler = () => { setChatContextMenu(null); setFolderContextMenu(null); };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false);
    };
    if (showProfile) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showProfile]);

  const saveVisibleNick = async () => {
    if (!user || !visibleNickInput.trim()) return;
    await update(ref(db, `users/${user.uid}`), { visibleNick: visibleNickInput.trim() });
    setEditingVisibleNick(false);
  };

  const handleAdminAccess = () => {
    if (adminInput === "4321") {
      localStorage.setItem("relay_admin", "true");
      navigate("/admin");
    } else {
      setAdminError("Неверный пароль");
      setTimeout(() => setAdminError(""), 2000);
    }
  };

  const handleMaintenanceAdmin = () => {
    if (maintenanceAdminPass === "4321") {
      localStorage.setItem("relay_admin", "true");
      navigate("/admin");
    } else {
      setMaintenanceAdminError("Неверный пароль");
      setTimeout(() => setMaintenanceAdminError(""), 2000);
    }
  };

  const renderChatItem = (s: ChatSession) => (
    <div
      key={s.id} draggable
      onDragStart={() => handleDragStart(s.id)}
      onDragOver={(e) => handleDragOverChat(e, s.id)}
      onDrop={() => handleDropOnChat(s.id)}
      onDragEnd={handleDragEnd}
      onContextMenu={(e) => { e.preventDefault(); setChatContextMenu({ chatId: s.id, x: e.clientX, y: e.clientY }); }}
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-all duration-200 ${
        currentChatId === s.id ? "bg-violet-600/10 text-violet-300" : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
      } ${dragOverTarget === s.id ? "ring-1 ring-violet-500/40 bg-violet-600/5" : ""} ${
        draggedChatId === s.id ? "opacity-40" : ""
      }`}
      onClick={() => { if (renamingChatId === s.id) return; setCurrentChatId(s.id); setTypingMessageId(null); setTypingText(""); }}
    >
      <GripVertical className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-30 cursor-grab transition-opacity duration-200" />
      <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-50" />
      {renamingChatId === s.id ? (
        <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => renameChat(s.id, renameValue)}
          onKeyDown={(e) => { if (e.key === "Enter") renameChat(s.id, renameValue); if (e.key === "Escape") setRenamingChatId(null); }}
          className="flex-1 bg-transparent text-xs text-zinc-200 focus:outline-none border-b border-violet-500/40 py-0.5" autoFocus
          onClick={(e) => e.stopPropagation()} />
      ) : (
        <span className="truncate flex-1 text-xs">{s.title}</span>
      )}
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-all duration-200 shrink-0">
        <button onClick={(e) => { e.stopPropagation(); setRenamingChatId(s.id); setRenameValue(s.title); }}
          className="p-1 hover:text-violet-400 transition-colors duration-200"><Pencil className="w-2.5 h-2.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); deleteChat(s.id); }}
          className="p-1 hover:text-red-400 transition-colors duration-200"><Trash2 className="w-2.5 h-2.5" /></button>
      </div>
    </div>
  );

  // ========================
  // MAINTENANCE OVERLAY
  // ========================
  if (maintenance) {
    return (
      <div className="h-screen bg-[#050507] text-zinc-100 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 bg-yellow-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Wrench className="w-6 h-6 text-yellow-500" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Технические работы</h1>
          <p className="text-sm text-zinc-500 mb-4 leading-relaxed">{maintenanceMessage}</p>
          {maintenanceEstimate && (
            <p className="text-xs text-zinc-600 mb-6">Ожидаемое время: <span className="text-zinc-400">{maintenanceEstimate}</span></p>
          )}
          <div className="flex items-center justify-center gap-3 mb-8">
            <Link to="/" className="px-4 py-2 rounded-xl border border-white/[0.06] text-xs text-zinc-400 hover:text-zinc-200 hover:border-violet-500/20 transition-all">На главную</Link>
            <Link to="/uptime" className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 transition-all">Статус систем</Link>
          </div>

          {hasAdminAccess ? (
            <Link to="/admin" className="inline-flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 transition-colors">
              <Lock className="w-3 h-3" /> Админ панель
            </Link>
          ) : (
            <div className="mt-4">
              {!showAdminLogin ? (
                <button onClick={() => setShowAdminLogin(true)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                  Вы администратор?
                </button>
              ) : (
                <div className="max-w-xs mx-auto border border-white/[0.06] bg-white/[0.01] rounded-xl p-4 space-y-3 animate-fade-in-up">
                  <p className="text-xs text-zinc-500">Введите пароль администратора</p>
                  <div className="flex gap-2">
                    <input type="password" value={maintenanceAdminPass} onChange={(e) => setMaintenanceAdminPass(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleMaintenanceAdmin(); }}
                      placeholder="Пароль" autoFocus
                      className="flex-1 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-violet-500/30" />
                    <button onClick={handleMaintenanceAdmin}
                      className="px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 transition-colors">
                      Войти
                    </button>
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

  // ========================
  // MAIN CHAT UI
  // ========================
  return (
    <div className="h-screen bg-[#050507] text-zinc-100 flex overflow-hidden">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

      {/* Sidebar */}
      <div className="shrink-0 border-r border-white/[0.04] bg-[#0a0a0d] flex transition-all duration-300 ease-in-out overflow-hidden"
        style={{ width: sidebarOpen ? 260 : 0 }}>
        <div className="w-[260px] min-w-[260px] flex flex-col h-full">
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <button onClick={createNewChat} className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-white/[0.06] text-sm font-medium hover:bg-white/[0.03] transition-all duration-200">
                <Plus className="w-4 h-4" /> Новый чат
              </button>
              <button onClick={() => setSidebarOpen(false)} className="p-2.5 rounded-xl border border-white/[0.06] hover:bg-white/[0.03] text-zinc-500 transition-all duration-200" title="Свернуть">
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-700" />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Поиск чатов..."
                  className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[11px] text-white placeholder-zinc-700 focus:outline-none focus:border-violet-500/30 transition-all duration-200" />
              </div>
              <div className="relative">
                <button onClick={() => setShowSortMenu(!showSortMenu)} className="p-1.5 rounded-lg hover:bg-white/[0.03] text-zinc-600 transition-all duration-200" title="Сортировка">
                  {sortMode === "recent" ? <Clock className="w-3.5 h-3.5" /> : sortMode === "alphabetical" ? <ArrowDownAZ className="w-3.5 h-3.5" /> : <MessageCircle className="w-3.5 h-3.5" />}
                </button>
                {showSortMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 w-44 bg-[#111114] border border-white/[0.06] rounded-xl shadow-2xl z-50 overflow-hidden p-1 animate-fade-in-up">
                      {([
                        { mode: "recent" as SortMode, label: "По дате", icon: Clock },
                        { mode: "alphabetical" as SortMode, label: "По алфавиту", icon: ArrowDownAZ },
                        { mode: "messages" as SortMode, label: "По сообщениям", icon: MessageCircle },
                      ]).map((s) => (
                        <button key={s.mode} onClick={() => { setSortMode(s.mode); setShowSortMenu(false); }}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all duration-200 ${
                            sortMode === s.mode ? "bg-violet-600/10 text-violet-300" : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
                          }`}>
                          <s.icon className="w-3 h-3" /> {s.label}
                          {sortMode === s.mode && <Check className="w-3 h-3 ml-auto text-violet-400" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">
            {sortedFolders.map((folder) => {
              const folderChats = folderedChats.filter(c => c.folderId === folder.id);
              return (
                <div key={folder.id} onDragOver={(e) => handleDragOverFolder(e, folder.id)} onDrop={() => handleDropOnFolder(folder.id)}
                  className={`mb-1 transition-all duration-200 ${dragOverTarget === `folder-${folder.id}` ? "ring-1 ring-violet-500/30 rounded-lg" : ""}`}>
                  <div className="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer transition-all duration-200"
                    onClick={() => toggleFolderCollapse(folder.id)}
                    onContextMenu={(e) => { e.preventDefault(); setFolderContextMenu({ folderId: folder.id, x: e.clientX, y: e.clientY }); }}>
                    <ChevronRight className={`w-3 h-3 transition-transform duration-200 ${!folder.collapsed ? "rotate-90" : ""}`} />
                    {folder.collapsed ? <Folder className="w-3 h-3 text-violet-400/60" /> : <FolderOpen className="w-3 h-3 text-violet-400" />}
                    {renamingFolderId === folder.id ? (
                      <input value={renameFolderValue} onChange={(e) => setRenameFolderValue(e.target.value)}
                        onBlur={() => renameFolder(folder.id, renameFolderValue)}
                        onKeyDown={(e) => { if (e.key === "Enter") renameFolder(folder.id, renameFolderValue); if (e.key === "Escape") setRenamingFolderId(null); }}
                        className="flex-1 bg-transparent text-xs text-zinc-200 focus:outline-none border-b border-violet-500/40 py-0" autoFocus
                        onClick={(e) => e.stopPropagation()} />
                    ) : (
                      <span className="flex-1 truncate font-medium">{folder.name}</span>
                    )}
                    <span className="text-[10px] text-zinc-700">{folderChats.length}</span>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-all duration-200">
                      <button onClick={(e) => { e.stopPropagation(); setRenamingFolderId(folder.id); setRenameFolderValue(folder.name); }}
                        className="p-0.5 hover:text-violet-400 transition-colors duration-200"><Pencil className="w-2.5 h-2.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id, true); }}
                        className="p-0.5 hover:text-red-400 transition-colors duration-200" title="Расформировать"><X className="w-2.5 h-2.5" /></button>
                    </div>
                  </div>
                  <div className={`overflow-hidden transition-all duration-300 ease-in-out ${folder.collapsed ? "max-h-0 opacity-0" : "max-h-[2000px] opacity-100"}`}>
                    <div className="pl-3 space-y-0.5">
                      {folderChats.map(renderChatItem)}
                      {folderChats.length === 0 && <div className="text-[10px] text-zinc-800 px-3 py-2">Пусто</div>}
                    </div>
                  </div>
                </div>
              );
            })}
            {unfolderedChats.map(renderChatItem)}
            {chatSessions.length === 0 && <div className="text-center py-10 text-zinc-700 text-xs">Нет чатов</div>}
          </div>

          <div className="p-3 border-t border-white/[0.04] relative">
            <button onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-all duration-200 text-left">
              <div className="w-7 h-7 rounded-lg bg-violet-600/20 flex items-center justify-center text-xs font-medium text-violet-400">
                {profileData.visibleNick?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{profileData.visibleNick || user?.displayName || "User"}</p>
                <p className="text-[11px] text-zinc-600 truncate">{user?.email}</p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
            </button>
            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div className="absolute bottom-full left-3 right-3 mb-1 bg-[#111114] border border-white/[0.06] rounded-xl overflow-hidden z-50 shadow-2xl animate-fade-in-up">
                  <Link to="/" onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-xs text-zinc-400 hover:bg-white/[0.03] transition-all duration-200">
                    <Home className="w-3.5 h-3.5" /> На главную
                  </Link>
                  <button onClick={() => { setShowProfile(true); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-zinc-400 hover:bg-white/[0.03] transition-all duration-200">
                    <User className="w-3.5 h-3.5" /> Профиль
                  </button>
                  <div className="border-t border-white/[0.04]" />
                  <button onClick={async () => { await signOut(auth); navigate("/"); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-red-400 hover:bg-white/[0.03] transition-all duration-200">
                    <LogOut className="w-3.5 h-3.5" /> Выйти
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Context menus */}
      {chatContextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setChatContextMenu(null)} />
          <div className="fixed z-50 bg-[#111114] border border-white/[0.06] rounded-xl shadow-2xl overflow-hidden w-48 p-1 animate-fade-in-up"
            style={{ left: chatContextMenu.x, top: chatContextMenu.y }}>
            <button onClick={() => { setRenamingChatId(chatContextMenu.chatId); setRenameValue(chatSessions.find(c => c.id === chatContextMenu.chatId)?.title || ""); setChatContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200 transition-all duration-200">
              <Pencil className="w-3 h-3" /> Переименовать
            </button>
            {chatSessions.find(c => c.id === chatContextMenu.chatId)?.folderId && (
              <button onClick={() => { moveChatToFolder(chatContextMenu.chatId, null); setChatContextMenu(null); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200 transition-all duration-200">
                <FolderOpen className="w-3 h-3" /> Убрать из папки
              </button>
            )}
            <button onClick={() => { deleteChat(chatContextMenu.chatId); setChatContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-white/[0.03] hover:text-red-300 transition-all duration-200">
              <Trash2 className="w-3 h-3" /> Удалить
            </button>
          </div>
        </>
      )}

      {folderContextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setFolderContextMenu(null)} />
          <div className="fixed z-50 bg-[#111114] border border-white/[0.06] rounded-xl shadow-2xl overflow-hidden w-52 p-1 animate-fade-in-up"
            style={{ left: folderContextMenu.x, top: folderContextMenu.y }}>
            <button onClick={() => { setRenamingFolderId(folderContextMenu.folderId); setRenameFolderValue(folders.find(f => f.id === folderContextMenu.folderId)?.name || ""); setFolderContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200 transition-all duration-200">
              <Pencil className="w-3 h-3" /> Переименовать
            </button>
            <button onClick={() => { deleteFolder(folderContextMenu.folderId, true); setFolderContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200 transition-all duration-200">
              <FolderOpen className="w-3 h-3" /> Расформировать
            </button>
            <button onClick={() => { deleteFolder(folderContextMenu.folderId, false); setFolderContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-white/[0.03] hover:text-red-300 transition-all duration-200">
              <Trash2 className="w-3 h-3" /> Удалить с чатами
            </button>
          </div>
        </>
      )}

      {/* Profile panel */}
      {showProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowProfile(false)}>
          <div ref={profileRef} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#111114] border border-white/[0.06] rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="p-6 pb-4 border-b border-white/[0.04]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold">Профиль</h2>
                <button onClick={() => setShowProfile(false)} className="p-1 rounded-lg hover:bg-white/[0.05] text-zinc-500 transition-all duration-200"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-violet-600/20 flex items-center justify-center text-lg font-semibold text-violet-400">
                  {profileData.visibleNick?.[0]?.toUpperCase() || "U"}
                </div>
                <div>
                  {editingVisibleNick ? (
                    <div className="flex items-center gap-1.5">
                      <input value={visibleNickInput} onChange={(e) => setVisibleNickInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveVisibleNick(); if (e.key === "Escape") setEditingVisibleNick(false); }}
                        className="text-sm font-medium bg-transparent border-b border-violet-500/40 focus:outline-none text-zinc-100 w-32" autoFocus />
                      <button onClick={saveVisibleNick} className="p-0.5 text-violet-400 hover:text-violet-300 transition-colors"><Check className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium">{profileData.visibleNick}</p>
                      <button onClick={() => { setEditingVisibleNick(true); setVisibleNickInput(profileData.visibleNick); }}
                        className="p-0.5 text-zinc-600 hover:text-violet-400 transition-colors duration-200"><Pencil className="w-3 h-3" /></button>
                    </div>
                  )}
                  <p className="text-[11px] text-zinc-600">ID: {profileData.id}</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Визуальный ник</label>
                <p className="text-sm text-zinc-300">{profileData.visibleNick}</p>
              </div>
              <div>
                <label className="block text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Системный ник (Email)</label>
                <p className="text-sm text-zinc-300 font-mono">{profileData.systemNick}</p>
              </div>
              <div>
                <label className="block text-[10px] text-zinc-600 uppercase tracking-wider mb-1">ID</label>
                <p className="text-sm text-zinc-300 font-mono">{profileData.id}</p>
              </div>
              <div className="pt-2 border-t border-white/[0.04] space-y-2">
                <Link to="/terms" onClick={() => setShowProfile(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200 transition-all duration-200">
                  <FileText className="w-3.5 h-3.5" /> Условия использования
                </Link>
                {hasAdminAccess ? (
                  <Link to="/admin" onClick={() => setShowProfile(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-violet-400 hover:bg-violet-600/10 transition-all duration-200">
                    <Lock className="w-3.5 h-3.5" /> Админ панель
                  </Link>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-700" />
                        <input type="password" value={adminInput} onChange={(e) => setAdminInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleAdminAccess(); }} placeholder="Пароль админа"
                          className="w-full pl-8 pr-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-violet-500/30 transition-all duration-200" />
                      </div>
                      <button onClick={handleAdminAccess} className="px-3 py-2 rounded-lg bg-violet-600/10 text-violet-400 text-xs font-medium hover:bg-violet-600/20 transition-all duration-200">Войти</button>
                    </div>
                    {adminError && <p className="text-[10px] text-red-400">{adminError}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-12 border-b border-white/[0.04] flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-white/[0.03] text-zinc-500 transition-all duration-200">
                <PanelLeft className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setShowModelPicker(!showModelPicker)}
              className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-white/[0.03] transition-all duration-200 text-sm ${
                isModelDisabled ? "opacity-50" : ""
              }`}>
              <ModelLogo modelId={selectedModel.id} size={18} />
              <span className="font-medium">{selectedModel.name}</span>
              {isModelDisabled && <AlertTriangle className="w-3 h-3 text-yellow-500" />}
              <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
            </button>
            {showModelPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowModelPicker(false)} />
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-72 bg-[#111114] border border-white/[0.06] rounded-xl shadow-2xl z-50 overflow-hidden p-1 animate-fade-in-up">
                  {allModels.map((m) => {
                    const disabled = isModelDisabledCheck(m.id);
                    return (
                      <button key={m.id}
                        onClick={() => { if (!disabled) handleModelChange(m); }}
                        disabled={disabled}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-3 transition-all duration-200 ${
                          disabled ? "opacity-30 cursor-not-allowed" :
                          selectedModel.id === m.id ? "bg-violet-600/10 text-violet-300" : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
                        }`}>
                        <ModelLogo modelId={m.id} size={22} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium flex items-center gap-2">
                            {m.name}
                            {disabled && <span className="text-[9px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">Отключена</span>}
                          </div>
                          <div className="text-[11px] text-zinc-600">{m.provider}</div>
                        </div>
                        {!disabled && selectedModel.id === m.id && <Check className="w-3.5 h-3.5 text-violet-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <div className="w-8" />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {noModelsAvailable ? (
            <div className="h-full flex items-center justify-center px-6">
              <div className="text-center max-w-md">
                <div className="w-14 h-14 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <h2 className="text-lg font-semibold mb-2">Все модели отключены</h2>
                <p className="text-sm text-zinc-500">Администратор временно отключил все AI модели. Попробуйте позже.</p>
              </div>
            </div>
          ) : isModelDisabled ? (
            <div className="h-full flex items-center justify-center px-6">
              <div className="text-center max-w-md">
                <div className="w-14 h-14 bg-yellow-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-6 h-6 text-yellow-400" />
                </div>
                <h2 className="text-lg font-semibold mb-2">{selectedModel.name} отключена</h2>
                <p className="text-sm text-zinc-500 mb-4">Эта модель временно недоступна. Выберите другую.</p>
                <button onClick={() => { if (enabledModels.length > 0) handleModelChange(enabledModels[0]); }}
                  className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 transition-all">
                  Переключить на {enabledModels[0]?.name || "доступную"}
                </button>
              </div>
            </div>
          ) : messages.length === 0 && !isGenerating ? (
            <div className="h-full flex items-center justify-center px-6">
              <div className="text-center max-w-md">
                <ModelLogo modelId={selectedModel.id} size={36} className="mx-auto mb-4" />
                <h2 className="text-lg font-semibold mb-1">Чат с {selectedModel.name}</h2>
                <p className="text-sm text-zinc-600 mb-8">{selectedModel.provider}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {currentSuggestions.map((s) => (
                    <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      className="px-4 py-3 rounded-xl border border-white/[0.04] text-xs text-zinc-500 hover:text-zinc-300 hover:border-violet-500/20 transition-all duration-200 text-left">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
              {messages.map((msg) => {
                const msgModel = getModelInfo(msg.model);
                return (
                  <div key={msg.id} className={`animate-fade-in-up ${msg.role === "user" ? "flex justify-end" : ""}`}>
                    {msg.role === "user" ? (
                      <div className="max-w-[80%]">
                        {msg.imageUrl && (
                          <div className="mb-2 flex justify-end">
                            <img src={msg.imageUrl} alt="Uploaded" className="max-w-[300px] max-h-[300px] rounded-xl object-cover border border-white/[0.06]" />
                          </div>
                        )}
                        {msg.content && (
                          <div className="bg-violet-600/15 text-zinc-100 px-4 py-3 rounded-2xl rounded-br-md text-sm leading-relaxed">
                            <span className="whitespace-pre-wrap">{msg.content}</span>
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
                            <img src={msg.imageUrl} alt="Admin image" className="max-w-[300px] max-h-[300px] rounded-xl object-cover border border-red-500/10" />
                          </div>
                        )}
                        <div className="bg-red-600/5 border border-red-500/10 text-zinc-300 px-4 py-3 rounded-2xl rounded-tl-md text-sm leading-relaxed">
                          <MarkdownRenderer content={msg.content} />
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-[80%]">
                        <div className="flex items-center gap-2 mb-1.5">
                          <ModelLogo modelId={msg.model} size={18} />
                          <span className="text-[11px] font-medium text-zinc-400">{msgModel.name}</span>
                        </div>
                        {msg.imageUrl && (
                          <div className="mb-2">
                            <img src={msg.imageUrl} alt="AI image" className="max-w-[300px] max-h-[300px] rounded-xl object-cover border border-white/[0.06]" />
                          </div>
                        )}
                        <div className="text-zinc-300 text-sm leading-relaxed">
                          {typingMessageId === msg.id ? (
                            <div>
                              <MarkdownRenderer content={typingText} />
                              <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 animate-pulse align-middle" />
                            </div>
                          ) : (
                            <MarkdownRenderer content={msg.content} />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {isGenerating && !typingMessageId && (
                <div className="animate-fade-in-up">
                  <div className="flex items-center gap-2 mb-1.5">
                    <ModelLogo modelId={selectedModel.id} size={18} />
                    <span className="text-[11px] font-medium text-zinc-400">{selectedModel.name}</span>
                  </div>
                  <div className="flex gap-1 py-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-1.5 h-1.5 bg-violet-500/40 rounded-full animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4">
          <div className="max-w-2xl mx-auto">
            {previewImage && (
              <div className="mb-2 flex items-start gap-2">
                <div className="relative group">
                  <img src={previewImage} alt="Preview" className="w-20 h-20 rounded-xl object-cover border border-white/[0.06]" />
                  <button onClick={clearImagePreview}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 border border-white/[0.1] rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-red-600 transition-all">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                {uploadingImage && (
                  <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                    <div className="w-3 h-3 border-2 border-violet-900 border-t-violet-400 rounded-full animate-spin" />
                    Загрузка...
                  </div>
                )}
              </div>
            )}

            <div className={`flex items-end gap-2 border bg-white/[0.01] rounded-2xl px-4 py-3 transition-all duration-200 ${
              charOverLimit ? "border-red-500/30" : isModelDisabled || noModelsAvailable ? "border-yellow-500/20 opacity-50" : "border-white/[0.06] focus-within:border-violet-500/30"
            }`}>
              <button onClick={() => fileInputRef.current?.click()}
                disabled={isModelDisabled || noModelsAvailable}
                className="p-1.5 rounded-lg text-zinc-600 hover:text-violet-400 hover:bg-violet-600/10 disabled:text-zinc-800 disabled:hover:bg-transparent transition-all duration-200 shrink-0"
                title="Прикрепить изображение">
                <ImagePlus className="w-4 h-4" />
              </button>

              <textarea ref={inputRef} value={input}
                onChange={(e) => { if (e.target.value.length <= MAX_CHARS + 100) setInput(e.target.value); }}
                onKeyDown={handleKeyDown}
                placeholder={isModelDisabled || noModelsAvailable ? "Модель недоступна..." : `Сообщение для ${selectedModel.name}...`}
                rows={1} disabled={isModelDisabled || noModelsAvailable}
                className="flex-1 bg-transparent text-sm placeholder-zinc-700 focus:outline-none resize-none max-h-32 min-h-[20px] disabled:cursor-not-allowed"
                style={{ height: "20px" }}
                onInput={(e) => { const el = e.target as HTMLTextAreaElement; el.style.height = "20px"; el.style.height = Math.min(el.scrollHeight, 128) + "px"; }}
              />
              <div className="flex items-center gap-2 shrink-0">
                {charCount > 0 && (
                  <span className={`text-[10px] tabular-nums ${charOverLimit ? "text-red-400" : "text-zinc-700"}`}>{charCount}/{MAX_CHARS}</span>
                )}
                {isGenerating ? (
                  <button onClick={stopGeneration}
                    className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-zinc-200 transition-all duration-200">
                    <Square className="w-3 h-3 text-zinc-900 fill-zinc-900" />
                  </button>
                ) : (
                  <button onClick={sendMessage} disabled={(!input.trim() && !selectedFile) || charOverLimit || isModelDisabled || noModelsAvailable || uploadingImage}
                    className="p-2 rounded-xl text-zinc-600 hover:text-violet-400 hover:bg-violet-600/10 disabled:text-zinc-800 disabled:hover:bg-transparent transition-all duration-200">
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-center text-[10px] text-zinc-700 mt-2">AI может ошибаться. Проверяйте важную информацию.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
