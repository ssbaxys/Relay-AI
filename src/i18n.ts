import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      "nav": {
        "home": "Home",
        "chat": "Chat",
        "admin": "Admin",
        "payment": "Payment",
        "terms": "Terms",
        "uptime": "Uptime"
      },
      "common": {
        "loading": "Loading...",
        "error": "Error occurred",
        "save": "Save",
        "cancel": "Cancel",
        "language": "Language"
      },
      "home": {
        "title": "All AI Models in One Place",
        "subtitle": "Unified access to the world's most powerful AI models. Experience the future of artificial intelligence in one seamless interface.",
        "getStarted": "Get Started",
        "features": "Key Features"
      }
    }
  },
  ru: {
    translation: {
      "nav": {
        "home": "Главная",
        "chat": "Чат",
        "admin": "Админ",
        "payment": "Оплата",
        "terms": "Условия",
        "uptime": "Аптайм"
      },
      "common": {
        "loading": "Загрузка...",
        "error": "Произошла ошибка",
        "save": "Сохранить",
        "cancel": "Отмена",
        "language": "Язык"
      },
      "home": {
        "title": "Все AI-модели в одном месте",
        "subtitle": "Единый доступ к самым мощным AI-моделям мира. Испытайте будущее искусственного интеллекта в одном бесшовном интерфейсе.",
        "getStarted": "Начать",
        "features": "Ключевые особенности"
      }
    }
  },
  es: {
    translation: {
      "nav": { "home": "Inicio", "chat": "Chat" },
      "home": { "title": "Todos los modelos de IA en un solo lugar" }
    }
  },
  zh: {
    translation: {
      "nav": { "home": "首页", "chat": "聊天" },
      "home": { "title": "所有 AI 模型集于一身" }
    }
  },
  // Adding placeholders for others to be expanded
  ar: { translation: { "nav": { "home": "الرئيسية" } } },
  fr: { translation: { "nav": { "home": "Accueil" } } },
  de: { translation: { "nav": { "home": "Startseite" } } },
  ja: { translation: { "nav": { "home": "ホーム" } } },
  pt: { translation: { "nav": { "home": "Início" } } }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
