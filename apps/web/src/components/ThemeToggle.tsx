import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('pos-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.setAttribute('data-theme', theme);
    localStorage.setItem('pos-theme', theme);
  }, [theme]);

  return (
    <button
      type="button"
      aria-label="Toggle color mode"
      onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/80 p-2 text-base shadow-sm backdrop-blur transition hover:border-indigo-200 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:text-indigo-300"
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
    </button>
  );
}
