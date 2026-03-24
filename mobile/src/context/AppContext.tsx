import React, { createContext, useContext, useState, useEffect } from 'react';
import { setTheme } from '../theme';
import { i18n, Language } from '../i18n/i18n';
import * as SecureStore from 'expo-secure-store';

interface AppContextType {
  theme: 'light' | 'dark';
  language: Language;
  toggleTheme: () => void;
  setLanguage: (lang: Language) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    // Load persisted preferences
    const loadPrefs = async () => {
      const savedTheme = await SecureStore.getItemAsync('app_theme');
      if (savedTheme === 'dark') {
        setThemeState('dark');
        setTheme('dark');
      }

      const savedLang = await SecureStore.getItemAsync('app_lang');
      if (savedLang) {
        const lang = savedLang as Language;
        setLanguageState(lang);
        i18n.setLanguage(lang);
      }
    };
    loadPrefs();
  }, []);

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setThemeState(newTheme);
    setTheme(newTheme);
    await SecureStore.setItemAsync('app_theme', newTheme);
  };

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    i18n.setLanguage(lang);
    await SecureStore.setItemAsync('app_lang', lang);
  };

  return (
    <AppContext.Provider value={{ 
      theme, 
      language, 
      toggleTheme, 
      setLanguage
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
