/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';

export type Language = 'es' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (spanishOrKey: string, englishOrOptions?: string | Record<string, unknown>) => string;
  i18n: typeof i18n;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n: i18nInstance } = useTranslation();
  const [language, setLanguageState] = useState<Language>((i18nInstance.language as Language) || 'en');
  const [isRTL, setIsRTL] = useState(false);

  // Update document language and direction
  useEffect(() => {
    const currentLang = i18nInstance.language as Language;
    document.documentElement.lang = currentLang;
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
  }, [i18nInstance.language, isRTL]);

  // Sync language state with i18n
  useEffect(() => {
    const currentLang = i18nInstance.language as Language;
    setLanguageState(currentLang);
  }, [i18nInstance.language]);

  const setLanguage = (lang: Language) => {
    i18nInstance.changeLanguage(lang);
    setLanguageState(lang);
    // Save to localStorage (handled by i18next-browser-languagedetector)
    localStorage.setItem('i18nextLng', lang);
  };

  const t = (spanishOrKey: string, englishOrOptions?: string | Record<string, unknown>): string => {
    // If second argument is a string, use inline translation pattern: t('Spanish', 'English')
    if (typeof englishOrOptions === 'string') {
      return language === 'es' ? spanishOrKey : englishOrOptions;
    }
    // Otherwise, use i18next key-based translation: t('key', { options })
    return i18nInstance.t(spanishOrKey, englishOrOptions);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, i18n: i18nInstance, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
