import { createContext, useContext } from 'react';
import { useTheme as useNextTheme } from 'next-themes';

// Compatibility shim: the legacy ThemeContext is replaced by next-themes.
// Existing consumers of useTheme() still work — they get a subset API that
// reads from next-themes underneath.

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // next-themes is mounted at the top of providers.tsx — nothing to do here.
  return <ThemeContext.Provider value={null}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const { theme, setTheme, resolvedTheme } = useNextTheme();
  const isDark = resolvedTheme === 'dark';
  return {
    themeId: resolvedTheme || 'light',
    themeBase: isDark ? 'dark' : 'light',
    isDark,
    isLight: !isDark,
    toggleTheme: () => setTheme(isDark ? 'light' : 'dark'),
    setTheme,
    themeOptions: [
      { id: 'light', label: 'Light', base: 'light' },
      { id: 'dark', label: 'Dark', base: 'dark' },
      { id: 'system', label: 'System', base: 'light' },
    ],
  };
}
