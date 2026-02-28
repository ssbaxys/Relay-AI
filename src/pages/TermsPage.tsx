import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

const sections = (t: any) => [
  {
    title: t('terms.sections.s0'),
    content: `1.1. Настоящие Условия использования (далее — «Условия») регулируют отношения между Relay AI (далее — «Сервис», «мы», «наш») и пользователем (далее — «Пользователь», «вы», «ваш») при использовании платформы Relay AI.\n\n1.2. Используя Сервис, вы подтверждаете, что ознакомились с настоящими Условиями, полностью понимаете их и согласны с ними.\n\n1.3. Мы оставляем за собой право изменять настоящие Условия в любое время. Обновлённая версия вступает в силу с момента публикации.\n\n1.4. Сервис предназначен для лиц, достигших 16 лет.`,
  },
  {
    title: t('terms.sections.s1'),
    content: `2.1. Relay AI — платформа-агрегатор, предоставляющая единый интерфейс для доступа к различным AI моделям, включая GPT-4o, Claude 3.5, Gemini, Llama и другие.\n\n2.2. Сервис предоставляет API и веб-интерфейс для взаимодействия с AI моделями.\n\n2.3. Мы не являемся разработчиками AI моделей и выступаем в качестве посредника.\n\n2.4. Доступность конкретных моделей может изменяться без предварительного уведомления.\n\n2.5. Сервис предоставляется «как есть» (as is).`,
  },
  {
    title: t('terms.sections.s2'),
    content: `3.1. Для полного функционала необходимо создать учётную запись. Регистрация возможна через email/пароль или Google.\n\n3.2. Вы обязуетесь предоставить достоверную информацию при регистрации.\n\n3.3. Вы несёте полную ответственность за безопасность своего аккаунта.\n\n3.4. Один Пользователь может иметь только один аккаунт.\n\n3.5. Мы оставляем за собой право заблокировать аккаунт при нарушении Условий.\n\n3.6. Вы можете удалить аккаунт, обратившись в поддержку.`,
  },
  {
    title: t('terms.sections.s3'),
    content: `4.1. Пользователь обязуется использовать Сервис только в законных целях.\n\n4.2. Запрещается:\n• Генерация контента, нарушающего законодательство\n• Создание вредоносного, оскорбительного контента\n• Генерация спама или фишинговых материалов\n• Попытки обхода ограничений безопасности (jailbreaking)\n• Перепродажа доступа без письменного согласия\n• DDoS-атаки, попытки взлома инфраструктуры\n• Создание deepfake или введение в заблуждение\n\n4.3. Нарушение может повлечь немедленную блокировку без возврата средств.`,
  },
  {
    title: t('terms.sections.s4'),
    content: `5.1. Сервис предлагает бесплатный и платные тарифные планы.\n\n5.2. Подписка продлевается автоматически, если не отменена.\n\n5.3. Возврат средств возможен в течение 7 дней при не более 50 запросах.\n\n5.4. Мы вправе изменять цены с уведомлением за 14 дней.\n\n5.5. Все цены указаны в долларах США.`,
  },
  {
    title: t('terms.sections.s5'),
    content: `6.1. Контент, сгенерированный через наш Сервис, принадлежит Пользователю в допустимой мере.\n\n6.2. Бренд Relay AI, логотип, дизайн и код — наша интеллектуальная собственность.\n\n6.3. Пользователь предоставляет нам неисключительную лицензию на хранение запросов для работы Сервиса.\n\n6.4. Мы не претендуем на права на контент Пользователя.`,
  },
  {
    title: t('terms.sections.s6'),
    content: `7.1. Мы обрабатываем персональные данные в соответствии с Политикой конфиденциальности.\n\n7.2. Используем шифрование для защиты данных.\n\n7.3. Не продаём персональные данные третьим лицам.\n\n7.4. Запросы хранятся для истории чата. Пользователь может удалить историю.\n\n7.5. При утечке данных уведомим затронутых Пользователей в течение 72 часов.`,
  },
  {
    title: t('terms.sections.s7'),
    content: `8.1. Сервис предоставляется «как есть» без каких-либо гарантий.\n\n8.2. Мы не несём ответственности за:\n• Точность ответов AI моделей\n• Убытки от использования контента AI\n• Перебои в работе Сервиса\n• Потерю данных вследствие технических сбоев\n\n8.3. Максимальная ответственность ограничена суммой за последние 3 месяца.\n\n8.4. AI модели могут генерировать неточную информацию. Проверяйте важные данные.`,
  },
  {
    title: t('terms.sections.s8'),
    content: `9.1. Поддержка по email: support@relay-ai.com.\n\n9.2. Время реагирования:\n• Free: до 72 часов\n• Pro: до 24 часов\n• Enterprise: до 4 часов (SLA)\n\n9.3. Поддержка на русском и английском языках.\n\n9.4. Плановые работы анонсируются на странице статуса.`,
  },
  {
    title: t('terms.sections.s9'),
    content: `10.1. Вы вправе прекратить использование в любое время.\n\n10.2. Мы вправе заблокировать доступ при нарушении Условий.\n\n10.3. Данные будут удалены в течение 30 дней после прекращения.\n\n10.4. Положения об ответственности продолжают действовать.`,
  },
  {
    title: t('terms.sections.s10'),
    content: `11.1. Споры разрешаются путём переговоров. При невозможности — через суд.\n\n11.2. Условия регулируются действующим законодательством.\n\n11.3. Если положение признано недействительным, остальные сохраняют силу.`,
  },
  {
    title: t('terms.sections.s11'),
    content: `12.1. По всем вопросам: support@relay-ai.com\n\n12.2. Вопросы безопасности: security@relay-ai.com\n\nПоследнее обновление: Январь 2025`,
  },
];

export default function TermsPage() {
  const { t } = useTranslation();
  const sectionsList = sections(t);
  return (
    <div className="min-h-screen bg-[#050507] text-zinc-100">
      <nav className="sticky top-0 z-50 bg-[#050507]/80 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="max-w-3xl mx-auto px-6 h-12 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-6 h-6 bg-violet-600 rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-[10px]">R</span>
            </div>
            <span className="font-semibold text-sm">Relay AI</span>
          </Link>
          <Link to="/" className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> {t('terms.back')}
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-12">
          <h1 className="text-2xl font-bold mb-2">{t('terms.title')}</h1>
          <p className="text-sm text-zinc-600">{t('terms.lastUpdated')}</p>
        </div>

        <div className="border border-white/[0.04] bg-white/[0.01] rounded-xl p-5 mb-10">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-3">{t('terms.toc')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {sectionsList.map((s, i) => (
              <a key={i} href={`#s-${i}`} className="text-xs text-zinc-600 hover:text-violet-400 transition-colors py-1">{s.title}</a>
            ))}
          </div>
        </div>

        <div className="space-y-10">
          {sectionsList.map((s, i) => (
            <div key={i} id={`s-${i}`} className="scroll-mt-16">
              <h2 className="text-sm font-semibold mb-3 text-zinc-300">{s.title}</h2>
              <div className="text-sm text-zinc-500 leading-relaxed whitespace-pre-line">{s.content}</div>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-white/[0.04] text-center">
          <p className="text-xs text-zinc-600 mb-4">{t('terms.questions')}</p>
          <a href="mailto:support@relay-ai.com" className="inline-flex items-center gap-2 text-sm font-medium border border-white/[0.06] px-5 py-2 rounded-xl hover:border-violet-500/20 hover:text-violet-300 transition-all text-zinc-400">
            support@relay-ai.com
          </a>
        </div>
      </div>
    </div>
  );
}
