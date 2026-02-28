import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { ref, set, get, serverTimestamp } from "firebase/database";
import { auth, googleProvider, db } from "../firebase";
import { ArrowLeft, Eye, EyeOff, Check, ChevronRight, ChevronLeft, Sparkles, Zap, Crown } from "lucide-react";
import { useTranslation } from "react-i18next";

type AuthMethod = "google" | "email" | null;

const plansData = (t: any) => [
  {
    id: "free",
    name: t('sign.register.plans.free.name', 'Free'),
    price: "0₽",
    period: t('sign.register.plans.free.period', 'forever'),
    icon: Sparkles,
    features: t('sign.register.plans.free.features', { returnObjects: true }) || ["5 queries per day", "Base models", "Web interface"],
    color: "violet",
  },
  {
    id: "pro",
    name: t('sign.register.plans.pro.name', 'Pro'),
    price: "499₽",
    period: t('sign.register.plans.pro.period', 'per month'),
    icon: Zap,
    features: t('sign.register.plans.pro.features', { returnObjects: true }) || ["500 queries per day", "All models", "Priority speed", "API access"],
    color: "violet",
    popular: true,
  },
  {
    id: "ultra",
    name: t('sign.register.plans.ultra.name', 'Ultra'),
    price: "1 299₽",
    period: t('sign.register.plans.ultra.period', 'per month'),
    icon: Crown,
    features: t('sign.register.plans.ultra.features', { returnObjects: true }) || ["Unlimited queries", "All models", "Dedicated servers", "API + SLA 99.9%"],
    color: "violet",
  },
];

export default function SignPage() {
  const { t } = useTranslation();
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState(1);
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("free");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [googleUser, setGoogleUser] = useState<{ uid: string; email: string | null; displayName: string | null } | null>(null);
  const navigate = useNavigate();

  // Create or update user record - ALWAYS ensures user has name and email
  const ensureUserRecord = async (uid: string, name: string | null, userEmail: string | null, plan?: string) => {
    const userRef = ref(db, `users/${uid}`);
    const snapshot = await get(userRef);

    if (snapshot.exists()) {
      // User exists - just update lastLogin, but also fix missing fields
      const existingData = snapshot.val();
      const updates: Record<string, unknown> = {
        lastLogin: serverTimestamp(),
      };

      // Fix missing displayName
      if (!existingData.displayName || existingData.displayName === "User") {
        updates.displayName = name || userEmail?.split("@")[0] || "User";
      }

      // Fix missing visibleNick
      if (!existingData.visibleNick || existingData.visibleNick === "User") {
        updates.visibleNick = name || existingData.displayName || userEmail?.split("@")[0] || "User";
      }

      // Fix missing email
      if (!existingData.email && userEmail) {
        updates.email = userEmail;
      }

      // Fix missing uniqueId
      if (!existingData.uniqueId) {
        updates.uniqueId = String(Math.floor(10000000 + Math.random() * 90000000));
      }

      await set(userRef, { ...existingData, ...updates });
    } else {
      // New user - create full record
      const uniqueId = String(Math.floor(10000000 + Math.random() * 90000000));
      const finalName = name || userEmail?.split("@")[0] || "User";

      await set(userRef, {
        displayName: finalName,
        visibleNick: finalName,
        email: userEmail || "",
        lastLogin: serverTimestamp(),
        createdAt: serverTimestamp(),
        plan: plan || "free",
        role: "user",
        uniqueId,
      });
    }
  };

  // Create new user record (for registration only)
  const createUserRecord = async (uid: string, name: string | null, userEmail: string | null, plan: string) => {
    const uniqueId = String(Math.floor(10000000 + Math.random() * 90000000));
    const finalName = name || userEmail?.split("@")[0] || "User";

    await set(ref(db, `users/${uid}`), {
      displayName: finalName,
      visibleNick: finalName,
      email: userEmail || "",
      lastLogin: serverTimestamp(),
      createdAt: serverTimestamp(),
      plan,
      role: "user",
      uniqueId,
    });
  };

  const handleGoogleAuth = async () => {
    setError("");
    setLoading(true);
    try {
      const r = await signInWithPopup(auth, googleProvider);
      if (isLogin) {
        // Login - ensure user record exists with proper data
        await ensureUserRecord(r.user.uid, r.user.displayName, r.user.email);
        navigate("/chat");
      } else {
        // Registration - go to step 2
        setGoogleUser({ uid: r.user.uid, email: r.user.email, displayName: r.user.displayName });
        setDisplayName(r.user.displayName || "");
        setAuthMethod("google");
        setStep(2);
      }
    } catch (e: unknown) {
      console.error("Google auth error:", e);
      setError(t('sign.login.googleError', 'Ошибка входа через Google'));
    }
    setLoading(false);
  };

  const handleEmailLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const r = await signInWithEmailAndPassword(auth, email, password);
      // Ensure user record exists with proper data
      await ensureUserRecord(r.user.uid, r.user.displayName, email);
      navigate("/chat");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || "";
      const m: Record<string, string> = {
        "auth/user-not-found": t('sign.errors.userNotFound', 'Пользователь не найден'),
        "auth/wrong-password": t('sign.errors.wrongPassword', 'Неверный пароль'),
        "auth/invalid-email": t('sign.errors.invalidEmail', 'Некорректный email'),
        "auth/invalid-credential": t('sign.errors.invalidCredential', 'Неверный email или пароль'),
      };
      setError(m[code] || t('sign.errors.loginError', 'Ошибка входа'));
    }
    setLoading(false);
  };

  const handleEmailRegisterStep1 = () => {
    if (!email.trim() || !password.trim()) {
      setError(t('sign.errors.fillFields', "Заполните все поля"));
      return;
    }
    if (password.length < 6) {
      setError(t('sign.errors.weakPassword', "Пароль минимум 6 символов"));
      return;
    }
    setError("");
    setAuthMethod("email");
    setStep(2);
  };

  const handleCompleteRegistration = async () => {
    setError("");
    setLoading(true);
    try {
      if (authMethod === "google" && googleUser) {
        const finalName = displayName.trim() || googleUser.displayName || googleUser.email?.split("@")[0] || "User";
        await createUserRecord(googleUser.uid, finalName, googleUser.email, selectedPlan);

        if (selectedPlan !== "free") {
          const price = selectedPlan === "pro" ? "499" : "1299";
          navigate(`/payment?plan=${selectedPlan}&price=${price}`);
        } else {
          navigate("/chat");
        }
      } else if (authMethod === "email") {
        const r = await createUserWithEmailAndPassword(auth, email, password);
        const finalName = displayName.trim() || email.split("@")[0] || "User";

        if (finalName) {
          await updateProfile(r.user, { displayName: finalName });
        }

        await createUserRecord(r.user.uid, finalName, email, selectedPlan);

        if (selectedPlan !== "free") {
          const price = selectedPlan === "pro" ? "499" : "1299";
          navigate(`/payment?plan=${selectedPlan}&price=${price}`);
        } else {
          navigate("/chat");
        }
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || "";
      const m: Record<string, string> = {
        "auth/email-already-in-use": t('sign.errors.emailInUse', "Email уже используется"),
        "auth/weak-password": t('sign.errors.weakPassword', "Пароль минимум 6 символов"),
        "auth/invalid-email": t('sign.errors.invalidEmail', "Некорректный email"),
      };
      setError(m[code] || t('sign.errors.registerError', "Ошибка регистрации"));
    }
    setLoading(false);
  };

  const goBack = () => {
    if (step > 1) {
      setStep(step - 1);
      setError("");
    }
  };

  const goNext = () => {
    if (step === 1 && !isLogin && authMethod === "email") {
      handleEmailRegisterStep1();
    } else if (step === 2) {
      if (!displayName.trim()) {
        setError(t('sign.errors.enterName', "Введите имя"));
        return;
      }
      setError("");
      setStep(3);
    } else if (step === 3) {
      handleCompleteRegistration();
    }
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setStep(1);
    setAuthMethod(null);
    setError("");
    setGoogleUser(null);
    setEmail("");
    setPassword("");
    setDisplayName("");
    setSelectedPlan("free");
  };

  const plans = plansData(t);

  return (
    <div className="min-h-screen bg-[#050507] text-zinc-100 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors mb-10">
          <ArrowLeft className="w-3.5 h-3.5" /> {t('sign.backToHome')}
        </Link>

        <div className="border border-white/[0.06] bg-white/[0.01] rounded-2xl overflow-hidden">
          {/* Stepper indicator (registration only) */}
          {!isLogin && (
            <div className="px-8 pt-8 pb-2">
              <div className="flex items-center w-full">
                {[1, 2, 3].map((s, i) => (
                  <div key={s} className="flex items-center flex-1 last:flex-none">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-all duration-300 ${step > s ? "bg-violet-600 text-white" :
                        step === s ? "bg-violet-600 text-white ring-4 ring-violet-600/20" :
                          "bg-zinc-800 text-zinc-600"
                      }`}>
                      {step > s ? <Check className="w-3.5 h-3.5" /> : s}
                    </div>
                    {i < 2 && (
                      <div className="flex-1 h-0.5 mx-2 rounded-full bg-zinc-800 overflow-hidden">
                        <div className={`h-full bg-violet-600 transition-all duration-500 ease-out ${step > s ? "w-full" : "w-0"
                          }`} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2">
                <span className={`text-[10px] ${step >= 1 ? "text-zinc-400" : "text-zinc-700"}`}>{t('sign.steps.method')}</span>
                <span className={`text-[10px] ${step >= 2 ? "text-zinc-400" : "text-zinc-700"}`}>{t('sign.steps.profile')}</span>
                <span className={`text-[10px] ${step >= 3 ? "text-zinc-400" : "text-zinc-700"}`}>{t('sign.steps.plan')}</span>
              </div>
            </div>
          )}

          <div className="p-8">
            {/* Header */}
            <div className="mb-6">
              <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center mb-5">
                <span className="text-white font-bold text-xs">R</span>
              </div>
              {isLogin ? (
                <>
                  <h1 className="text-lg font-bold mb-1">{t('sign.login.title')}</h1>
                  <p className="text-sm text-zinc-500">{t('sign.login.subtitle')}</p>
                </>
              ) : step === 1 ? (
                <>
                  <h1 className="text-lg font-bold mb-1">{t('sign.register.title')}</h1>
                  <p className="text-sm text-zinc-500">{t('sign.register.subtitle')}</p>
                </>
              ) : step === 2 ? (
                <>
                  <h1 className="text-lg font-bold mb-1">{t('sign.register.profileTitle')}</h1>
                  <p className="text-sm text-zinc-500">{t('sign.register.profileSubtitle')}</p>
                </>
              ) : (
                <>
                  <h1 className="text-lg font-bold mb-1">{t('sign.register.planTitle')}</h1>
                  <p className="text-sm text-zinc-500">{t('sign.register.planSubtitle')}</p>
                </>
              )}
            </div>

            {/* Step 1: Auth method */}
            {step === 1 && (
              <div className="space-y-4">
                {/* Google button */}
                <button onClick={handleGoogleAuth} disabled={loading}
                  className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl border border-white/[0.06] text-sm font-medium hover:bg-white/[0.03] transition-all duration-200 disabled:opacity-50">
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  {isLogin ? t('sign.login.google') : t('sign.register.google')}
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/[0.04]" />
                  <span className="text-[11px] text-zinc-700 uppercase tracking-wider">{t('sign.common.or')}</span>
                  <div className="flex-1 h-px bg-white/[0.04]" />
                </div>

                {/* Email/password form */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1.5">{t('sign.common.email')}</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1.5">{t('sign.common.password')}</label>
                    <div className="relative">
                      <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('sign.common.passwordPlaceholder')}
                        className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40 transition-colors"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (isLogin) handleEmailLogin();
                            else handleEmailRegisterStep1();
                          }
                        }}
                      />
                      <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors">
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="text-sm text-red-400 bg-red-500/[0.06] border border-red-500/10 rounded-xl px-3.5 py-2.5">{error}</div>
                )}

                {isLogin ? (
                  <button onClick={handleEmailLogin} disabled={loading || !email.trim() || !password.trim()}
                    className="w-full py-2.5 rounded-xl bg-violet-600 text-white font-medium text-sm hover:bg-violet-500 transition-colors disabled:opacity-50">
                    {loading ? t('sign.login.loading') : t('sign.login.submit')}
                  </button>
                ) : (
                  <button onClick={handleEmailRegisterStep1} disabled={loading || !email.trim() || !password.trim()}
                    className="w-full py-2.5 rounded-xl bg-violet-600 text-white font-medium text-sm hover:bg-violet-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {t('sign.register.next')} <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Step 2: Display name */}
            {step === 2 && !isLogin && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">{t('sign.register.nickPlaceholder')}</label>
                  <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t('sign.register.profileSubtitle')}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40 transition-colors"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") goNext(); }}
                  />
                  <p className="text-[11px] text-zinc-700 mt-2">{t('sign.register.nickHelp')}</p>
                </div>

                {error && (
                  <div className="text-sm text-red-400 bg-red-500/[0.06] border border-red-500/10 rounded-xl px-3.5 py-2.5">{error}</div>
                )}

                <div className="flex gap-2 pt-2">
                  <button onClick={goBack}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/[0.06] text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] transition-all">
                    <ChevronLeft className="w-3.5 h-3.5" /> {t('sign.register.back')}
                  </button>
                  <button onClick={goNext} disabled={!displayName.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white font-medium text-sm hover:bg-violet-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {t('sign.register.next')} <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Choose plan */}
            {step === 3 && !isLogin && (
              <div className="space-y-3">
                {plans.map((p) => (
                  <button key={p.id} onClick={() => setSelectedPlan(p.id)}
                    className={`w-full text-left px-4 py-4 rounded-xl border transition-all duration-200 ${selectedPlan === p.id
                        ? "border-violet-500/40 bg-violet-600/[0.08] ring-1 ring-violet-500/20"
                        : "border-white/[0.06] bg-white/[0.01] hover:border-white/[0.1]"
                      }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedPlan === p.id ? "bg-violet-600/20" : "bg-white/[0.03]"
                          }`}>
                          <p.icon className={`w-4 h-4 ${selectedPlan === p.id ? "text-violet-400" : "text-zinc-600"}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{p.name}</span>
                            {p.popular && (
                              <span className="text-[9px] font-medium text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded-full">{t('pricing.popular')}</span>
                            )}
                          </div>
                          <span className="text-[11px] text-zinc-600">{p.price} / {p.period}</span>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${selectedPlan === p.id ? "border-violet-500 bg-violet-600" : "border-zinc-700"
                        }`}>
                        {selectedPlan === p.id && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 ml-[42px]">
                      {p.features.map((f) => (
                        <span key={f} className="text-[11px] text-zinc-500">• {f}</span>
                      ))}
                    </div>
                  </button>
                ))}

                {error && (
                  <div className="text-sm text-red-400 bg-red-500/[0.06] border border-red-500/10 rounded-xl px-3.5 py-2.5">{error}</div>
                )}

                <div className="flex gap-2 pt-2">
                  <button onClick={goBack}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/[0.06] text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] transition-all">
                    <ChevronLeft className="w-3.5 h-3.5" /> {t('sign.register.back')}
                  </button>
                  <button onClick={handleCompleteRegistration} disabled={loading}
                    className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white font-medium text-sm hover:bg-violet-500 transition-colors disabled:opacity-50">
                    {loading ? t('sign.register.loading') : t('sign.register.submit')}
                  </button>
                </div>
              </div>
            )}

            {/* Switch login/register */}
            <p className="text-center text-sm text-zinc-600 mt-6">
              {isLogin ? t('sign.common.noAccount') : t('sign.common.haveAccount')}
              <button onClick={switchMode} className="text-violet-400 hover:text-violet-300 transition-colors ml-1">
                {isLogin ? t('sign.common.switchRegister') : t('sign.common.switchLogin')}
              </button>
            </p>
          </div>
        </div>

        <p className="text-center text-[11px] text-zinc-700 mt-6">
          {t('sign.common.agree')} <Link to="/terms" className="underline hover:text-zinc-500">{t('sign.common.termsLink')}</Link>
        </p>
      </div>
    </div>
  );
}
