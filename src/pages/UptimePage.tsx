import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ref, onValue } from "firebase/database";
import { db } from "../firebase";
import { ArrowLeft, CheckCircle2, Clock, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

type UptimeStatus = "operational" | "degraded" | "down" | "maintenance";

const UPTIME_COMPONENTS = (t: any) => [
  { name: t('uptime.components.api_gateway'), key: "api_gateway" },
  { name: t('uptime.components.ai_router'), key: "ai_router" },
  { name: t('uptime.components.web_app'), key: "web_app" },
  { name: t('uptime.components.database'), key: "database" },
  { name: t('uptime.components.auth'), key: "auth" },
  { name: t('uptime.components.cdn'), key: "cdn" },
];

const STATUS_COLORS: Record<UptimeStatus, string> = {
  operational: "bg-emerald-500",
  degraded: "bg-yellow-500",
  down: "bg-red-500",
  maintenance: "bg-zinc-500",
};

const STATUS_LABELS = (t: any): Record<UptimeStatus, string> => ({
  operational: t('uptime.status.operational'),
  degraded: t('uptime.status.degraded'),
  down: t('uptime.status.down'),
  maintenance: t('uptime.status.maintenance'),
});

const STATUS_TEXT_COLORS: Record<UptimeStatus, string> = {
  operational: "text-emerald-400",
  degraded: "text-yellow-400",
  down: "text-red-400",
  maintenance: "text-zinc-400",
};

function getDefaultHours(): UptimeStatus[] {
  return Array.from({ length: 90 }, () => "operational" as UptimeStatus);
}

export default function UptimePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [adminError, setAdminError] = useState("");
  const hasAdminAccess = typeof window !== "undefined" && localStorage.getItem("relay_admin") === "true";
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("Мы проводим плановые технические работы для улучшения сервиса.");
  const [maintenanceEstimate, setMaintenanceEstimate] = useState("2 часа");
  const [currentTime, setCurrentTime] = useState(new Date());

  const components = UPTIME_COMPONENTS(t);
  const statusLabels = STATUS_LABELS(t);

  const [componentUptimes, setComponentUptimes] = useState<{ name: string; key: string; hours: UptimeStatus[] }[]>(
    components.map(c => ({ ...c, hours: getDefaultHours() }))
  );
  const [loaded, setLoaded] = useState(false);

  // Listen for settings (maintenance mode)
  useEffect(() => {
    const unsub = onValue(ref(db, "settings"), (snap) => {
      const data = snap.val();
      if (data) {
        setMaintenanceEnabled(!!data.maintenance);
        if (data.maintenanceMessage) setMaintenanceMessage(data.maintenanceMessage);
        if (data.maintenanceEstimate) setMaintenanceEstimate(data.maintenanceEstimate);
      } else {
        setMaintenanceEnabled(false);
      }
      setLoaded(true);
    }, () => {
      // Error handler — still mark as loaded
      setLoaded(true);
    });
    return unsub;
  }, []);

  // Listen for uptime data
  useEffect(() => {
    const unsub = onValue(ref(db, "uptime"), (snap) => {
      const data = snap.val();
      if (data) {
        const loaded = components.map(c => {
          const rawHours = data[c.key];
          let hours: UptimeStatus[];
          if (rawHours && Array.isArray(rawHours)) {
            hours = Array.from({ length: 90 }, (_, i) => (rawHours[i] as UptimeStatus) || "operational");
          } else if (rawHours && typeof rawHours === "object") {
            // Firebase may convert sparse arrays to objects
            hours = Array.from({ length: 90 }, (_, i) => (rawHours[String(i)] as UptimeStatus) || "operational");
          } else {
            hours = getDefaultHours();
          }
          return { ...c, hours };
        });
        setComponentUptimes(loaded);
      }
    });
    return unsub;
  }, []);

  // Live clock
  useEffect(() => {
    const i = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  const getUptimePercent = (hours: UptimeStatus[]) => {
    const good = hours.filter(h => h === "operational").length;
    return ((good / hours.length) * 100).toFixed(1);
  };

  const getCurrentStatus = (hours: UptimeStatus[]): UptimeStatus => {
    return hours[hours.length - 1];
  };

  const overallOperational = componentUptimes.every(c => getCurrentStatus(c.hours) === "operational");
  const hasAnyIssue = componentUptimes.some(c => {
    const s = getCurrentStatus(c.hours);
    return s === "down" || s === "degraded";
  });

  if (!loaded) {
    return (
      <div className="min-h-screen bg-[#050507] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-violet-900 border-t-violet-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050507] text-zinc-100">
      <nav className="sticky top-0 z-50 bg-[#050507]/80 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="max-w-2xl mx-auto px-6 h-12 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-6 h-6 bg-violet-600 rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-[10px]">R</span>
            </div>
            <span className="font-semibold text-sm">Relay AI</span>
          </Link>
          <Link to="/" className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> {t('common.back')}
          </Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-16">
        {/* Status header */}
        <div className="mb-10">
          {maintenanceEnabled ? (
            <>
              <div className="flex items-center gap-2 text-yellow-500 mb-4">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wider">{t('uptime.maintenance')}</span>
              </div>
              <h1 className="text-2xl font-bold mb-3">Сервис на обслуживании</h1>
              <p className="text-sm text-zinc-500 leading-relaxed mb-4">{maintenanceMessage}</p>
              <p className="text-xs text-zinc-600">Ожидаемое время: <span className="text-zinc-400">{maintenanceEstimate}</span></p>
            </>
          ) : hasAnyIssue ? (
            <>
              <div className="flex items-center gap-2 text-yellow-500 mb-4">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wider">{t('uptime.partialIssues')}</span>
              </div>
              <h1 className="text-2xl font-bold mb-3">{t('uptime.partialIssues')}</h1>
              <p className="text-sm text-zinc-500">{t('uptime.subtitleIssues')}</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-emerald-400 mb-4">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wider">{t('uptime.allSystems')}</span>
              </div>
              <h1 className="text-2xl font-bold mb-2">{t('uptime.title')}</h1>
              <p className="text-sm text-zinc-500">{t('uptime.subtitle')}</p>
            </>
          )}
        </div>

        <p className="text-[11px] text-zinc-700 font-mono mb-8">
          {currentTime.toLocaleString(i18n.language === 'ru' ? 'ru-RU' : 'en-US', { dateStyle: "long", timeStyle: "medium" })}
        </p>

        {/* Overall status banner */}
        <div className={`rounded-2xl p-4 mb-8 flex items-center gap-3 ${overallOperational && !maintenanceEnabled
            ? "bg-emerald-500/[0.05] border border-emerald-500/10"
            : "bg-yellow-500/[0.05] border border-yellow-500/10"
          }`}>
          <span className={`w-2 h-2 rounded-full ${overallOperational && !maintenanceEnabled ? "bg-emerald-500" : "bg-yellow-500 animate-pulse"
            }`} />
          <span className={`text-sm font-medium ${overallOperational && !maintenanceEnabled ? "text-emerald-400" : "text-yellow-400"
            }`}>
            {maintenanceEnabled
              ? t('uptime.maintenanceDesc')
              : overallOperational
                ? t('uptime.allSystems')
                : t('uptime.subtitleIssues')
            }
          </span>
        </div>

        {/* Components */}
        <div className="space-y-4 mb-10">
          {componentUptimes.map((comp) => {
            const status = getCurrentStatus(comp.hours);
            const uptimePercent = getUptimePercent(comp.hours);
            return (
              <div key={comp.key} className="border border-white/[0.04] bg-white/[0.01] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{comp.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[status]} ${status !== "operational" ? "animate-pulse" : ""}`} />
                      <span className={`text-[11px] font-medium ${STATUS_TEXT_COLORS[status]}`}>{statusLabels[status]}</span>
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500 font-medium">{uptimePercent}%</span>
                </div>

                <div className="flex gap-[2px] mb-2">
                  {comp.hours.map((hourStatus, i) => (
                    <div
                      key={i}
                      className={`flex-1 h-6 rounded-[2px] ${STATUS_COLORS[hourStatus]} opacity-40 hover:opacity-70 transition-opacity`}
                      title={t('uptime.history.ago', { count: 90 - i }) + `: ${statusLabels[hourStatus]}`}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-zinc-700">
                  <span>{t('uptime.history.hoursAgo')}</span>
                  <span>{t('uptime.history.now')}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mb-10">
          {(["operational", "degraded", "down", "maintenance"] as UptimeStatus[]).map(s => (
            <div key={s} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-sm ${STATUS_COLORS[s]} opacity-50`} />
              <span className="text-[10px] text-zinc-600">{statusLabels[s]}</span>
            </div>
          ))}
        </div>

        {/* Incidents */}
        <div className="border border-white/[0.04] bg-white/[0.01] rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.04]">
            <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{t('uptime.incidents')}</h2>
          </div>
          <div className="divide-y divide-white/[0.02]">
            {maintenanceEnabled && (
              <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse" />
                  <span className="text-sm font-medium text-yellow-400">{t('uptime.maintenance')}</span>
                </div>
                <p className="text-xs text-zinc-600 ml-3.5">{maintenanceMessage}</p>
                <p className="text-[10px] text-zinc-700 ml-3.5 mt-1">{t('uptime.history.now')} · ~{maintenanceEstimate}</p>
              </div>
            )}
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                <span className="text-sm font-medium text-zinc-300">Обновление инфраструктуры</span>
                <span className="text-[9px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{t('uptime.resolved')}</span>
              </div>
              <p className="text-xs text-zinc-600 ml-3.5">Плановое обновление серверов. Все системы стабильны.</p>
              <p className="text-[10px] text-zinc-700 ml-3.5 mt-1">15 янв 2025 · 45 мин</p>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                <span className="text-sm font-medium text-zinc-300">Задержка ответов API</span>
                <span className="text-[9px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{t('uptime.resolved')}</span>
              </div>
              <p className="text-xs text-zinc-600 ml-3.5">Повышенная задержка у некоторых моделей. Устранено.</p>
              <p className="text-[10px] text-zinc-700 ml-3.5 mt-1">10 янв 2025 · 20 мин</p>
            </div>
          </div>
        </div>

        <div className="mt-12 text-center space-y-4">
          <p className="text-xs text-zinc-700 mb-3">{t('uptime.noticeIssue')}</p>
          <a href="mailto:support@relay-ai.com" className="text-xs text-zinc-500 border border-white/[0.06] px-4 py-2 rounded-xl hover:border-violet-500/20 hover:text-violet-300 transition-all inline-block">
            support@relay-ai.com
          </a>

          {/* Admin access */}
          <div className="pt-6 border-t border-white/[0.04] mt-8">
            {hasAdminAccess ? (
              <Link to="/admin" className="inline-flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 transition-colors">
                <Lock className="w-3 h-3" /> {t('uptime.adminPanel')}
              </Link>
            ) : (
              <>
                {!showAdminLogin ? (
                  <button onClick={() => setShowAdminLogin(true)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                    {t('uptime.isAdmin')}
                  </button>
                ) : (
                  <div className="max-w-xs mx-auto border border-white/[0.06] bg-white/[0.01] rounded-xl p-4 space-y-3">
                    <p className="text-xs text-zinc-500">{t('uptime.enterAdminPass')}</p>
                    <div className="flex gap-2">
                      <input type="password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (adminPass === "4321") { localStorage.setItem("relay_admin", "true"); navigate("/admin"); }
                            else { setAdminError(t('admin.wrongPassword', "Неверный пароль")); }
                          }
                        }}
                        placeholder={t('uptime.password')} autoFocus
                        className="flex-1 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-violet-500/30" />
                      <button onClick={() => {
                        if (adminPass === "4321") { localStorage.setItem("relay_admin", "true"); navigate("/admin"); }
                        else { setAdminError(t('admin.wrongPassword', "Неверный пароль")); }
                      }}
                        className="px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 transition-colors">
                        {t('uptime.login')}
                      </button>
                    </div>
                    {adminError && <p className="text-[10px] text-red-400">{adminError}</p>}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
