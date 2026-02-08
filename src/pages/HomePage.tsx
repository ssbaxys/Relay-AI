import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../App";
import { ArrowRight, Check, Zap, Shield, Globe, Layers } from "lucide-react";
import { ref, onValue } from "firebase/database";
import { db } from "../firebase";
import Dither from "../components/Dither";

type UptimeStatus = "operational" | "degraded" | "down" | "maintenance";

const UPTIME_KEYS = ["api_gateway", "ai_router", "web_app", "database", "auth", "cdn"];

const models = [
  { name: "GPT-5.2 Codex", provider: "OpenAI", tag: "Code", logo: "https://img.icons8.com/fluency-systems-regular/48/chatgpt.png", logoFilter: "invert(1) brightness(2)" },
  { name: "Claude Opus 4.6", provider: "Anthropic", tag: "Analysis", logo: "https://img.icons8.com/fluency/48/claude-ai.png", logoFilter: "" },
  { name: "Gemini 3 Pro", provider: "Google", tag: "Multimodal", logo: "https://img.icons8.com/color/48/google-logo.png", logoFilter: "" },
];

const pricing = [
  {
    name: "Free", price: "0₽", period: "навсегда",
    features: ["5 запросов в день", "GPT-4o Mini, Gemini Flash", "Веб-интерфейс", "Базовая поддержка"],
    cta: "Начать бесплатно", highlighted: false,
  },
  {
    name: "Pro", price: "499₽", period: "в месяц",
    features: ["Безлимитные запросы", "Все 100+ моделей", "API доступ", "Приоритетная скорость", "Поддержка 24/7", "История без ограничений"],
    cta: "Выбрать Pro", highlighted: true,
  },
  {
    name: "Ultra", price: "1 299₽", period: "в месяц",
    features: ["Всё из Pro", "Выделенные серверы", "SLA 99.9%", "Персональный менеджер", "Кастомные модели", "Приоритетный роутинг"],
    cta: "Выбрать Ultra", highlighted: false,
  },
];

const features = [
  { icon: Layers, title: "Лучшие модели", desc: "OpenAI GPT-5.2, Anthropic Claude Opus 4.6 и Google Gemini 3 Pro через единый интерфейс." },
  { icon: Zap, title: "Мгновенная скорость", desc: "Оптимизированная маршрутизация с задержкой менее 50мс. Серверы по всему миру." },
  { icon: Globe, title: "Единый API", desc: "Один ключ для всех моделей. Без отдельной регистрации у каждого провайдера." },
  { icon: Shield, title: "Безопасность", desc: "End-to-end шифрование и полное соответствие стандартам защиты данных." },
];

export default function HomePage() {
  const { user } = useAuth();
  const [userCount, setUserCount] = useState<string>("0");
  const [avgUptime, setAvgUptime] = useState<string>("99.9%");

  // Dynamic user count from Firebase
  useEffect(() => {
    const unsub = onValue(ref(db, "users"), (snap) => {
      const d = snap.val();
      if (d && typeof d === "object") {
        const count = Object.keys(d).length;
        if (count >= 1000) {
          setUserCount((count / 1000).toFixed(1).replace(/\.0$/, "") + "K+");
        } else {
          setUserCount(String(count));
        }
      } else {
        setUserCount("0");
      }
    });
    return () => unsub();
  }, []);

  // Average uptime from Firebase
  useEffect(() => {
    const unsub = onValue(ref(db, "uptime"), (snap) => {
      const d = snap.val();
      if (d && typeof d === "object") {
        let totalPercent = 0;
        let componentCount = 0;
        for (const key of UPTIME_KEYS) {
          const hours = d[key];
          if (hours && typeof hours === "object") {
            const arr: UptimeStatus[] = [];
            // Firebase may store as object with numeric keys
            for (let i = 0; i < 90; i++) {
              arr.push((hours[i] as UptimeStatus) || "operational");
            }
            const operational = arr.filter(h => h === "operational").length;
            totalPercent += (operational / 90) * 100;
            componentCount++;
          }
        }
        if (componentCount > 0) {
          setAvgUptime((totalPercent / componentCount).toFixed(1) + "%");
        } else {
          setAvgUptime("99.9%");
        }
      } else {
        setAvgUptime("99.9%");
      }
    });
    return () => unsub();
  }, []);

  return (
    <div className="min-h-screen bg-[#050507] text-zinc-100">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#050507]/60 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">R</span>
            </div>
            <span className="font-semibold text-sm tracking-tight">Relay AI</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-[13px] text-zinc-500">
            <a href="#models" className="hover:text-zinc-100 transition-colors">Модели</a>
            <a href="#pricing" className="hover:text-zinc-100 transition-colors">Цены</a>
            <Link to="/uptime" className="hover:text-zinc-100 transition-colors">Uptime</Link>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <Link to="/chat" className="flex items-center gap-2 text-[13px] font-medium bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-500 transition-colors">
                Открыть чат <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <>
                <Link to="/sign" className="text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors">Войти</Link>
                <Link to="/sign" className="text-[13px] font-medium bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-500 transition-colors">
                  Начать
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero with Dither */}
      <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Dither
            waveSpeed={0.03}
            waveFrequency={3}
            waveAmplitude={0.3}
            waveColor={[0.27, 0.15, 0.55]}
            colorNum={4}
            pixelSize={2}
            disableAnimation={false}
            enableMouseInteraction={true}
            mouseRadius={1}
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-[#050507]/40 via-[#050507]/20 to-[#050507] z-[1]" />
        
        <div className="relative z-[2] text-center px-6 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 text-xs text-zinc-400 border border-white/[0.06] bg-white/[0.02] rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse" />
            Лучшие AI модели доступны
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
            Все AI модели
            <br />
            <span className="text-violet-400">в одном месте</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto mb-10 leading-relaxed font-light">
            Единая платформа для работы с GPT-5.2 Codex, Claude Opus 4.6 и Gemini 3 Pro.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to={user ? "/chat" : "/sign"} className="flex items-center gap-2 bg-violet-600 text-white px-7 py-3.5 rounded-xl font-medium text-sm hover:bg-violet-500 transition-all hover:shadow-lg hover:shadow-violet-600/20">
              Начать бесплатно <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#models" className="flex items-center gap-2 text-zinc-400 border border-white/[0.06] px-7 py-3.5 rounded-xl text-sm hover:border-white/[0.12] hover:text-zinc-200 transition-all">
              Модели
            </a>
          </div>
        </div>
      </section>

      {/* Stats — dynamic */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { value: "3", label: "AI модели" },
            { value: userCount, label: "Пользователей" },
            { value: avgUptime, label: "Uptime" },
            { value: "<50ms", label: "Задержка" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-bold mb-1 text-white">{s.value}</div>
              <div className="text-xs text-zinc-500">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="pb-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((f) => (
              <div key={f.title} className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-6 hover:border-violet-500/20 transition-all group">
                <f.icon className="w-5 h-5 text-violet-400 mb-4 group-hover:text-violet-300 transition-colors" />
                <h3 className="font-semibold text-[15px] mb-2">{f.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Models */}
      <section id="models" className="pb-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-10">
            <h2 className="text-2xl font-bold mb-2">Доступные модели</h2>
            <p className="text-zinc-500 text-sm">Лучшие модели от ведущих провайдеров</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {models.map((m) => (
              <div key={m.name} className="border border-white/[0.04] bg-white/[0.01] rounded-xl p-5 hover:border-violet-500/20 transition-all group">
                <div className="flex items-center justify-between mb-4">
                  <img src={m.logo} alt={m.name} width={24} height={24} style={{ filter: m.logoFilter || "none" }} />
                  <span className="text-[10px] text-violet-400/60 bg-violet-500/[0.06] px-2 py-0.5 rounded-full font-medium">{m.tag}</span>
                </div>
                <h3 className="font-medium text-sm group-hover:text-violet-300 transition-colors mb-0.5">{m.name}</h3>
                <p className="text-[11px] text-zinc-600">{m.provider}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="pb-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-10">
            <h2 className="text-2xl font-bold mb-2">Тарифы</h2>
            <p className="text-zinc-500 text-sm">Простые и прозрачные цены</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {pricing.map((p) => (
              <div key={p.name} className={`rounded-2xl p-6 flex flex-col transition-all ${
                p.highlighted 
                  ? "bg-violet-600 text-white ring-1 ring-violet-500" 
                  : "border border-white/[0.04] bg-white/[0.01]"
              }`}>
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">{p.name}</h3>
                    {p.highlighted && <span className="text-[10px] font-medium bg-white/20 px-2.5 py-0.5 rounded-full">Популярный</span>}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{p.price}</span>
                    <span className={`text-sm ${p.highlighted ? "text-violet-200" : "text-zinc-600"}`}>/{p.period}</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className={`flex items-center gap-2.5 text-sm ${p.highlighted ? "text-violet-100" : "text-zinc-500"}`}>
                      <Check className={`w-3.5 h-3.5 shrink-0 ${p.highlighted ? "text-white" : "text-violet-500"}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to={user ? "/chat" : "/sign"}
                  className={`block text-center py-2.5 rounded-xl text-sm font-medium transition-all ${
                    p.highlighted
                      ? "bg-white text-violet-700 hover:bg-violet-50"
                      : "border border-white/[0.06] text-zinc-300 hover:border-violet-500/30 hover:text-white"
                  }`}>
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] px-6 py-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-violet-600 rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-[10px]">R</span>
            </div>
            <span className="text-sm text-zinc-600">© 2025 Relay AI</span>
          </div>
          <div className="flex items-center gap-6 text-[13px] text-zinc-600">
            <Link to="/terms" className="hover:text-zinc-300 transition-colors">Условия</Link>
            <Link to="/uptime" className="hover:text-zinc-300 transition-colors">Uptime</Link>
            <a href="mailto:support@relay-ai.com" className="hover:text-zinc-300 transition-colors">Поддержка</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
