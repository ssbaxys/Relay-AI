import { ArrowLeft, CreditCard, Check, Sparkles, AlertTriangle, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

type PayMethod = "ru" | "foreign" | "crypto";

const methodLabels = (t: any): Record<PayMethod, string> => ({
  ru: t('payment.ruCard'),
  foreign: t('payment.foreignCard'),
  crypto: t('payment.crypto')
});
const methodIcons: Record<PayMethod, string> = { ru: "🏦", foreign: "💳", crypto: "₿" };
const planNames: Record<string, string> = { pro: "Pro", ultra: "Ultra" };

function formatCardNumber(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 16);
  return d.replace(/(.{4})/g, "$1 ").trim();
}
function formatExpiry(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 4);
  if (d.length >= 3) return d.slice(0, 2) + "/" + d.slice(2);
  return d;
}

type PaymentMode = "success" | "insufficient_funds" | "invalid_card";

export default function PaymentPage() {
  const { t } = useTranslation();
  const labels = methodLabels(t);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const plan = params.get("plan") || "pro";
  const price = params.get("price") || (plan === "ultra" ? "1299" : "499");

  const [method, setMethod] = useState<PayMethod>("ru");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardName, setCardName] = useState("");
  const [country, setCountry] = useState("US");
  const [cryptoWallet, setCryptoWallet] = useState("");
  const [cryptoNetwork, setCryptoNetwork] = useState("USDT");
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<"insufficient_funds" | "invalid_card" | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("success");

  // Load payment mode from Firebase
  useEffect(() => {
    const unsub = onValue(ref(db, "settings/paymentMode"), (snap) => {
      const mode = snap.val();
      if (mode && ["success", "insufficient_funds", "invalid_card"].includes(mode)) {
        setPaymentMode(mode as PaymentMode);
      } else {
        setPaymentMode("success");
      }
    });
    return () => unsub();
  }, []);

  const isCardValid = () => {
    const num = cardNumber.replace(/\s/g, "");
    return num.length === 16 && expiry.length === 5 && cvv.length === 3 && cardName.trim().length > 0;
  };
  const isCryptoValid = () => cryptoWallet.trim().length > 10;

  const canSubmit = method === "crypto" ? isCryptoValid() : isCardValid();

  const handleSubmit = async () => {
    if (!canSubmit || processing) return;
    setProcessing(true);
    setError(null);

    // Simulate processing
    await new Promise(r => setTimeout(r, 2000));

    // Check payment mode from admin settings
    if (paymentMode === "insufficient_funds") {
      setProcessing(false);
      setError("insufficient_funds");
      return;
    }
    if (paymentMode === "invalid_card") {
      setProcessing(false);
      setError("invalid_card");
      return;
    }

    // Save payment record (NO card data saved)
    const user = auth.currentUser;
    const email = user?.email || "unknown";
    await push(ref(db, "payments"), {
      email,
      uid: user?.uid || "",
      plan,
      method: labels[method],
      amount: price + "₽",
      timestamp: Date.now(),
      createdAt: serverTimestamp(),
    });

    // Update user plan
    if (user) {
      await update(ref(db, `users/${user.uid}`), { plan });
    }

    setProcessing(false);
    setSuccess(true);
  };

  // Error: Insufficient funds
  if (error === "insufficient_funds") {
    return (
      <div className="min-h-screen bg-[#050507] text-zinc-100 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <AlertTriangle className="w-9 h-9 text-red-400" />
          </div>
          <h1 className="text-xl font-bold mb-2">{t('payment.insufficientFunds.title')}</h1>
          <p className="text-sm text-zinc-500 mb-2">
            {t('payment.insufficientFunds.desc')}
          </p>
          <p className="text-xs text-zinc-600 mb-8">{t('payment.insufficientFunds.help')}</p>
          <div className="space-y-3">
            <button onClick={() => setError(null)}
              className="w-full py-3 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors">
              {t('common.retry', "Попробовать снова")}
            </button>
            <button onClick={() => navigate(-1)}
              className="w-full py-3 rounded-xl border border-white/[0.06] text-zinc-400 text-sm font-medium hover:text-zinc-200 transition-colors">
              {t('common.back', "Назад")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Error: Invalid card
  if (error === "invalid_card") {
    return (
      <div className="min-h-screen bg-[#050507] text-zinc-100 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-yellow-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <XCircle className="w-9 h-9 text-yellow-400" />
          </div>
          <h1 className="text-xl font-bold mb-2">{t('payment.invalidCard.title')}</h1>
          <p className="text-sm text-zinc-500 mb-2">
            {t('payment.invalidCard.desc')}
          </p>
          <p className="text-xs text-zinc-600 mb-8">{t('payment.invalidCard.help')}</p>
          <div className="space-y-3">
            <button onClick={() => setError(null)}
              className="w-full py-3 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors">
              {t('common.retry', "Попробовать снова")}
            </button>
            <button onClick={() => navigate(-1)}
              className="w-full py-3 rounded-xl border border-white/[0.06] text-zinc-400 text-sm font-medium hover:text-zinc-200 transition-colors">
              {t('common.back', "Назад")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Success screen
  if (success) {
    return (
      <div className="min-h-screen bg-[#050507] text-zinc-100 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="relative mb-8">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto">
              <Check className="w-9 h-9 text-emerald-400" />
            </div>
            {/* Confetti dots */}
            {[...Array(12)].map((_, i) => (
              <div key={i} className="absolute w-2 h-2 rounded-full animate-ping"
                style={{
                  background: ["#8b5cf6", "#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#ec4899"][i % 6],
                  left: `${20 + Math.random() * 60}%`,
                  top: `${10 + Math.random() * 80}%`,
                  animationDelay: `${i * 0.15}s`,
                  animationDuration: "1.5s",
                  opacity: 0.6,
                }} />
            ))}
          </div>
          <h1 className="text-xl font-bold mb-2">{t('payment.success.title')}</h1>
          <p className="text-sm text-zinc-500 mb-2">
            {t('payment.success.desc', { plan: planNames[plan] || plan })}
          </p>
          <p className="text-xs text-zinc-600 mb-8">{t('payment.success.price', { price })}</p>
          <button onClick={() => navigate("/chat")}
            className="w-full py-3 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4" /> {t('payment.success.toChat')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050507] text-zinc-100 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <button onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors mb-8">
          <ArrowLeft className="w-3.5 h-3.5" /> {t('common.back', "Назад")}
        </button>

        <div className="border border-white/[0.06] bg-white/[0.01] rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-white/[0.04]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-violet-600/20 rounded-xl flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <h1 className="text-sm font-semibold">{t('payment.title')}</h1>
                <p className="text-xs text-zinc-600">Relay AI {planNames[plan] || plan}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-lg font-bold text-white">{price}₽</p>
                <p className="text-[10px] text-zinc-600">{t('pricing.perMonth', "в месяц")}</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Payment method selector */}
            <div>
              <label className="block text-xs text-zinc-500 mb-2">Способ оплаты</label>
              <div className="grid grid-cols-3 gap-2">
                {(["ru", "foreign", "crypto"] as PayMethod[]).map((m) => (
                  <button key={m} onClick={() => setMethod(m)}
                    className={`px-3 py-3 rounded-xl border text-center transition-all duration-200 ${method === m
                        ? "border-violet-500/40 bg-violet-600/[0.08] ring-1 ring-violet-500/20"
                        : "border-white/[0.06] bg-white/[0.01] hover:border-white/[0.1]"
                      }`}>
                    <span className="text-lg block mb-1">{methodIcons[m]}</span>
                    <span className="text-[10px] text-zinc-400 block">{labels[m]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Card form (RU / Foreign) */}
            {(method === "ru" || method === "foreign") && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">{t('payment.form.cardNumber')}</label>
                  <input type="text" value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    placeholder="1234 5678 9012 3456" maxLength={19}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40 transition-colors font-mono tracking-wider" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1.5">{t('payment.form.expiry')}</label>
                    <input type="text" value={expiry}
                      onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                      placeholder="MM/YY" maxLength={5}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40 transition-colors font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1.5">{t('payment.form.cvv')}</label>
                    <input type="password" value={cvv}
                      onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 3))}
                      placeholder="•••" maxLength={3}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40 transition-colors font-mono" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">{t('payment.form.cardName')}</label>
                  <input type="text" value={cardName}
                    onChange={(e) => setCardName(e.target.value.toUpperCase())}
                    placeholder="IVAN IVANOV"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40 transition-colors uppercase tracking-wide" />
                </div>
                {method === "foreign" && (
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1.5">{t('payment.form.country')}</label>
                    <select value={country} onChange={(e) => setCountry(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm text-zinc-300 focus:outline-none focus:border-violet-500/40 transition-colors appearance-none cursor-pointer">
                      <option value="US" className="bg-[#111114]">United States</option>
                      <option value="GB" className="bg-[#111114]">United Kingdom</option>
                      <option value="DE" className="bg-[#111114]">Germany</option>
                      <option value="FR" className="bg-[#111114]">France</option>
                      <option value="JP" className="bg-[#111114]">Japan</option>
                      <option value="KR" className="bg-[#111114]">South Korea</option>
                      <option value="TR" className="bg-[#111114]">Turkey</option>
                      <option value="KZ" className="bg-[#111114]">Kazakhstan</option>
                      <option value="OTHER" className="bg-[#111114]">{t('common.other', "Другая")}</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Crypto form */}
            {method === "crypto" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">{t('payment.form.network')}</label>
                  <div className="grid grid-cols-4 gap-2">
                    {["USDT", "BTC", "ETH", "SOL"].map((n) => (
                      <button key={n} onClick={() => setCryptoNetwork(n)}
                        className={`px-3 py-2 rounded-xl border text-xs font-medium text-center transition-all ${cryptoNetwork === n
                            ? "border-violet-500/40 bg-violet-600/10 text-violet-400"
                            : "border-white/[0.06] text-zinc-500 hover:text-zinc-300"
                          }`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1.5">{t('payment.form.address')}</label>
                  <input type="text" value={cryptoWallet}
                    onChange={(e) => setCryptoWallet(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-sm placeholder-zinc-700 focus:outline-none focus:border-violet-500/40 transition-colors font-mono text-xs" />
                </div>
                <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3">
                  <p className="text-[10px] text-zinc-600 leading-relaxed">
                    {t('payment.form.cryptoNote', { price, network: cryptoNetwork })}
                  </p>
                </div>
              </div>
            )}

            {/* Security note */}
            <div className="flex items-start gap-2 bg-white/[0.02] border border-white/[0.04] rounded-xl px-3.5 py-3">
              <svg className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p className="text-[10px] text-zinc-600 leading-relaxed">
                {t('payment.form.securityNote')}
              </p>
            </div>

            {/* Submit */}
            <button onClick={handleSubmit} disabled={!canSubmit || processing}
              className="w-full py-3 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {processing ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t('payment.form.processing')}</>
              ) : (
                <>{t('payment.form.submit', { price })}</>
              )}
            </button>
          </div>
        </div>

        <p className="text-center text-[10px] text-zinc-700 mt-4">
          {t('payment.form.agree')}
        </p>
      </div>
    </div>
  );
}
