import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../App";
import { ArrowRight, Check, Zap, Shield, Globe, Layers } from "lucide-react";
import { ref, onValue } from "firebase/database";
import { db } from "../firebase";
import Dither from "../components/Dither";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

type UptimeStatus = "operational" | "degraded" | "down" | "maintenance";

const UPTIME_KEYS = ["api_gateway", "ai_router", "web_app", "database", "auth", "cdn"];

const models = [
  { name: "GPT-5.2 Codex", provider: "OpenAI", tag: "Code", logo: "https://img.icons8.com/fluency-systems-regular/48/chatgpt.png", logoFilter: "invert(1) brightness(2)" },
  { name: "Claude Opus 4.6", provider: "Anthropic", tag: "Analysis", logo: "https://img.icons8.com/fluency/48/claude-ai.png", logoFilter: "" },
  { name: "Gemini 3.1 Pro", provider: "Google", tag: "Multimodal", logo: "https://img.icons8.com/color/48/google-logo.png", logoFilter: "" },
  { name: "Mistral Large", provider: "Mistral", tag: "Efficient", logo: "https://mistral.ai/images/logo.svg", logoFilter: "invert(1)" },
  { name: "DeepSeek V3.2", provider: "DeepSeek", tag: "Reasoning", logo: "https://www.deepseek.com/favicon.ico", logoFilter: "" },
  { name: "Qwen-3-Max", provider: "Alibaba", tag: "Powerful", logo: "https://chat.qwenlm.ai/favicon.ico", logoFilter: "" },
];

const pricingPlans = (t: any) => [
  {
    id: "free",
    name: t('pricing.free.name'), price: t('pricing.free.price'), period: t('pricing.forever'),
    features: t('pricing.free.features', { returnObjects: true }),
    cta: t('pricing.free.cta'), highlighted: false,
  },
  {
    id: "pro",
    name: t('pricing.pro.name'), price: t('pricing.pro.price'), period: t('pricing.perMonth'),
    features: t('pricing.pro.features', { returnObjects: true }),
    cta: t('pricing.pro.cta'), highlighted: true,
  },
  {
    id: "ultra",
    name: t('pricing.ultra.name'), price: t('pricing.ultra.price'), period: t('pricing.perMonth'),
    features: t('pricing.ultra.features', { returnObjects: true }),
    cta: t('pricing.ultra.cta'), highlighted: false,
  },
];

const featureItems = [
  { icon: Layers, key: "Layers" },
  { icon: Zap, key: "Zap" },
  { icon: Globe, key: "Globe" },
  { icon: Shield, key: "Shield" },
];

export default function HomePage() {
  const { user } = useAuth();
  const { t } = useTranslation();
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

  const pricing = pricingPlans(t);

  return (
    <div className="min-h-screen bg-[#050507] text-zinc-100">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#050507]/60 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">R</span>
            </div>
            <span className="font-semibold text-sm tracking-tight text-white">Relay AI</span>
          </Link>
          <div className="hidden lg:flex items-center gap-8 text-[13px] text-zinc-500">
            <a href="#models" className="hover:text-zinc-100 transition-colors uppercase tracking-widest font-semibold">{t('nav.models', 'Модели')}</a>
            <a href="#pricing" className="hover:text-zinc-100 transition-colors uppercase tracking-widest font-semibold">{t('nav.pricing', 'Цены')}</a>
            <Link to="/uptime" className="hover:text-zinc-100 transition-colors uppercase tracking-widest font-semibold">{t('nav.uptime', 'Uptime')}</Link>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <LanguageSwitcher />
            <div className="flex items-center gap-2 md:gap-3">
              {user ? (
                <Link to="/chat" className="flex items-center gap-2 text-[12px] md:text-[13px] font-medium bg-violet-600 text-white px-3 md:px-4 py-1.5 md:py-2 rounded-lg hover:bg-violet-500 transition-all shadow-lg shadow-violet-600/20 active:scale-95">
                  <span className="hidden xs:inline">{t('nav.chat', 'Открыть чат')}</span>
                  <span className="xs:hidden">Chat</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <>
                  <Link to="/sign" className="text-[12px] md:text-[13px] text-zinc-400 hover:text-zinc-100 transition-colors">{t('nav.login', 'Войти')}</Link>
                  <Link to="/sign" className="text-[12px] md:text-[13px] font-medium bg-violet-600 text-white px-3 md:px-4 py-1.5 md:py-2 rounded-lg hover:bg-violet-500 transition-all shadow-lg shadow-violet-600/20 active:scale-95">
                    {t('nav.getStarted', 'Начать')}
                  </Link>
                </>
              )}
            </div>
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
          <div className="inline-flex items-center gap-2 text-[10px] md:text-xs text-zinc-400 border border-white/[0.06] bg-white/[0.02] rounded-full px-4 py-1.5 mb-8 backdrop-blur-md">
            <span className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse" />
            {t('home.badge', 'Лучшие AI модели доступны')}
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6 text-white">
            {t('home.titleLine1', 'Все AI модели')}
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">
              {t('home.titleLine2', 'в одном месте')}
            </span>
          </h1>
          <p className="text-zinc-400 text-base md:text-lg max-w-xl mx-auto mb-10 leading-relaxed font-light">
            {t('home.subtitle', 'Единая платформа для работы с GPT-5.2 Codex, Claude Opus 4.6 и Gemini 3 Pro.')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to={user ? "/chat" : "/sign"} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-violet-600 text-white px-8 py-3.5 rounded-xl font-medium text-sm hover:bg-violet-500 transition-all hover:shadow-lg hover:shadow-violet-600/20 active:scale-95">
              {t('home.getStarted', 'Начать бесплатно')} <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#models" className="w-full sm:w-auto flex items-center justify-center gap-2 text-zinc-400 border border-white/[0.06] px-8 py-3.5 rounded-xl text-sm hover:border-white/[0.12] hover:text-zinc-200 transition-all backdrop-blur-sm">
              {t('home.models', 'Модели')}
            </a>
          </div>
        </div>
      </section>

      {/* Stats — dynamic */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-6">
          {[
            { value: "3", label: t('stats.models', 'AI модели') },
            { value: userCount, label: t('stats.users', 'Пользователей') },
            { value: avgUptime, label: t('stats.uptime', 'Uptime') },
            { value: "<50ms", label: t('stats.latency', 'Задержка') },
          ].map((s) => (
            <div key={s.label} className="text-center group">
              <div className="text-3xl md:text-4xl font-bold mb-1 text-white group-hover:text-violet-400 transition-colors">{s.value}</div>
              <div className="text-[10px] md:text-xs text-zinc-500 uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="pb-24 px-6 text-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {featureItems.map((f) => (
              <div key={f.key} className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-6 md:p-8 hover:border-violet-500/20 transition-all group backdrop-blur-sm">
                <f.icon className="w-6 h-6 text-violet-400 mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="font-semibold text-lg mb-2">{t(`features.${f.key}.title`)}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed font-light">{t(`features.${f.key}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Models */}
      <section id="models" className="pb-24 px-6 text-white">
        <div className="max-w-5xl mx-auto">
          <div className="mb-12 text-center md:text-left">
            <h2 className="text-3xl font-bold mb-3">{t('models.title', 'Доступные модели')}</h2>
            <p className="text-zinc-500 text-sm font-light">{t('models.subtitle', 'Лучшие модели от ведущих провайдеров')}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {models.map((m) => (
              <div key={m.name} className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-6 hover:border-violet-500/20 transition-all group backdrop-blur-sm flex flex-col items-center sm:items-start text-center sm:text-left">
                <div className="flex items-center justify-between w-full mb-6">
                  <div className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.06] group-hover:border-violet-500/30 transition-colors">
                    <img src={m.logo} alt={m.name} width={28} height={28} style={{ filter: m.logoFilter || "none" }} />
                  </div>
                  <span className="text-[10px] text-violet-400 bg-violet-500/10 px-3 py-1 rounded-full font-medium border border-violet-500/20">{m.tag}</span>
                </div>
                <h3 className="font-semibold text-base group-hover:text-violet-300 transition-colors mb-1">{m.name}</h3>
                <p className="text-xs text-zinc-600 font-light">{m.provider}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="pb-24 px-6 text-white">
        <div className="max-w-5xl mx-auto">
          <div className="mb-12 text-center md:text-left">
            <h2 className="text-3xl font-bold mb-3">{t('pricing.title', 'Тарифы')}</h2>
            <p className="text-zinc-500 text-sm font-light">{t('pricing.subtitle', 'Простые и прозрачные цены')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pricing.map((p) => (
              <div key={p.id} className={`rounded-3xl p-8 flex flex-col transition-all relative overflow-hidden group ${p.highlighted
                ? "bg-violet-600 shadow-2xl shadow-violet-600/20 z-10 md:scale-105"
                : "border border-white/[0.04] bg-white/[0.01] hover:border-white/[0.1] backdrop-blur-sm"
                }`}>
                {p.highlighted && <div className="absolute top-0 right-0 p-4"><span className="text-[10px] font-bold bg-white text-violet-700 px-3 py-1 rounded-full uppercase tracking-tighter">{t('pricing.bestDeal')}</span></div>}
                <div className="mb-8">
                  <h3 className={`text-xl font-bold mb-4 ${p.highlighted ? "text-white" : "text-zinc-200"}`}>{p.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{p.price}</span>
                    <span className={`text-sm ${p.highlighted ? "text-violet-200" : "text-zinc-500"}`}>/{p.period}</span>
                  </div>
                </div>
                <ul className="space-y-4 mb-10 flex-1">
                  {Array.isArray(p.features) && p.features.map((f: string) => (
                    <li key={f} className={`flex items-start gap-3 text-sm ${p.highlighted ? "text-violet-50" : "text-zinc-400"} font-light`}>
                      <div className={`mt-0.5 p-0.5 rounded-full ${p.highlighted ? "bg-white text-violet-600" : "bg-violet-500/20 text-violet-400"}`}>
                        <Check className="w-3 h-3" />
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to={
                  p.id === "free"
                    ? (user ? "/chat" : "/sign")
                    : (user ? `/payment?plan=${p.id}&price=${p.price.replace(/[^\d]/g, "")}` : "/sign")
                }
                  className={`block text-center py-3.5 rounded-2xl text-sm font-semibold transition-all shadow-xl active:scale-95 ${p.highlighted
                    ? "bg-white text-violet-700 hover:bg-zinc-100 shadow-white/10"
                    : "bg-white/5 text-white hover:bg-white/10 border border-white/10 shadow-black/20"
                    }`}>
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] px-6 py-12 bg-[#050507]">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-12">
            <div className="flex flex-col items-center md:items-start gap-4">
              <Link to="/" className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center shadow-lg shadow-violet-600/20">
                  <span className="text-white font-bold text-sm">R</span>
                </div>
                <span className="font-bold text-lg text-white tracking-tight">Relay AI</span>
              </Link>
              <p className="text-xs text-zinc-600 font-light max-w-[200px] text-center md:text-left leading-relaxed">
                {t('footer.description', 'Ваш проводник в мир современного искусственного интеллекта.')}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-8 md:gap-12 text-[14px]">
              <div className="flex flex-col gap-3">
                <span className="text-[11px] font-bold text-zinc-700 uppercase tracking-widest mb-1">Продукт</span>
                <a href="#models" className="text-zinc-500 hover:text-white transition-colors">{t('nav.models', 'Модели')}</a>
                <a href="#pricing" className="text-zinc-500 hover:text-white transition-colors">{t('nav.pricing', 'Цены')}</a>
                <Link to="/uptime" className="text-zinc-500 hover:text-white transition-colors">{t('nav.uptime', 'Uptime')}</Link>
              </div>
              <div className="flex flex-col gap-3">
                <span className="text-[11px] font-bold text-zinc-700 uppercase tracking-widest mb-1">Компания</span>
                <Link to="/terms" className="text-zinc-500 hover:text-white transition-colors">{t('nav.terms', 'Условия')}</Link>
                <a href="mailto:support@relay-ai.com" className="text-zinc-500 hover:text-white transition-colors">{t('nav.support', 'Поддержка')}</a>
                <a href="#" className="text-zinc-500 hover:text-white transition-colors">Twitter</a>
              </div>
            </div>
          </div>
          <div className="pt-8 border-t border-white/[0.02] flex flex-col md:flex-row items-center justify-between gap-4">
            <span className="text-[11px] text-zinc-700 uppercase tracking-widest">© 2025 Relay AI. All rights reserved.</span>
            <div className="flex items-center gap-2 opacity-30 grayscale hover:grayscale-0 transition-all">
              <img src="https://img.icons8.com/color/48/visa.png" width={24} />
              <img src="https://img.icons8.com/color/48/mastercard.png" width={24} />
              <img src="https://img.icons8.com/color/48/google-pay.png" width={24} />
              <img src="https://img.icons8.com/color/48/apple-pay.png" width={24} />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
