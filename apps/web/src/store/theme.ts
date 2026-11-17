import { create } from 'zustand';

type Theme = 'light' | 'dark';
const saved = localStorage.getItem('pos-theme');
const initial: Theme = saved === 'light' || saved === 'dark' ? saved : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.setAttribute('data-theme', theme);
}

export const useTheme = create<{ theme: Theme; setTheme: (theme: Theme) => void }>((set) => ({
  theme: initial,
  setTheme: (theme) => { applyTheme(theme); localStorage.setItem('pos-theme', theme); set({ theme }); },
}));
