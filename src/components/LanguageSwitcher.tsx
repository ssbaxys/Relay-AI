import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ref, update } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../App';

const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'ru', name: 'Русский', flag: '🇷🇺' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'zh', name: '中文', flag: '🇨🇳' },
    { code: 'ar', name: 'العربية', flag: '🇦🇪' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'ja', name: '日本語', flag: '🇯🇵' },
    { code: 'pt', name: 'Português', flag: '🇵🇹' },
];

export const LanguageSwitcher: React.FC = () => {
    const { i18n } = useTranslation();
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);

    const currentLanguage = languages.find(l => l.code === i18n.language.split('-')[0]) || languages[0];

    const changeLanguage = async (lng: string) => {
        i18n.changeLanguage(lng);
        setIsOpen(false);

        if (user) {
            try {
                await update(ref(db, `users/${user.uid}`), {
                    language: lng
                });
            } catch (err) {
                console.error("Failed to update language in Firebase:", err);
            }
        }
    };

    return (
        <div className="relative inline-block text-left">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-200"
            >
                <span className="text-lg">{currentLanguage.flag}</span>
                <span className="text-sm font-medium text-white/80 hidden sm:block">{currentLanguage.name}</span>
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-48 rounded-xl bg-[#0f0f13] border border-white/10 shadow-2xl z-50 overflow-hidden py-1 backdrop-blur-xl">
                        {languages.map((lang) => (
                            <button
                                key={lang.code}
                                onClick={() => changeLanguage(lang.code)}
                                className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-white/5 ${i18n.language.startsWith(lang.code) ? 'text-violet-400 bg-violet-400/5' : 'text-white/60'
                                    }`}
                            >
                                <span>{lang.flag}</span>
                                <span>{lang.name}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
