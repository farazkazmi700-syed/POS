import { create } from 'zustand';
import { useTheme, applyTheme } from './theme';

export const presets = {
  minimal: { name: 'Minimalism', colors: ['#0F172A', '#64748B', '#F8FAFC', '#FFFFFF', '#FFFFFF', '#0F172A', '#E2E8F0'] },
  modern: { name: 'Modern', colors: ['#2563EB', '#6366F1', '#EFF6FF', '#FFFFFF', '#FFFFFF', '#1E293B', '#DBEAFE'] },
  enterprise: { name: 'Enterprise', colors: ['#1E40AF', '#475569', '#F1F5F9', '#FFFFFF', '#0F172A', '#1E293B', '#CBD5E1'] },
  premium: { name: 'Premium', colors: ['#C9A227', '#A16207', '#121212', '#262626', '#171717', '#F5F5F5', '#404040'] },
  compact: { name: 'Compact', colors: ['#047857', '#334155', '#ECFDF5', '#FFFFFF', '#064E3B', '#1E293B', '#D1D5DB'] },
  glassmorphism: { name: 'Glassmorphism', colors: ['#155E75', '#4338CA', '#E6F2FA', '#F8FDFF', '#F2F9FF', '#102A43', '#AEC7DA'] },
  skeuomorphism: { name: 'Skeuomorphism', colors: ['#7A4328', '#455363', '#EEE7DC', '#FFF9ED', '#E8DCCD', '#2E241B', '#B9A594'] },
  'neo-brutalism': { name: 'Neo-Brutalism', colors: ['#FACC15', '#A5B4FC', '#FCF5DB', '#FFFDFA', '#EFF6FF', '#171522', '#292438'] },
  claymorphism: { name: 'Claymorphism', colors: ['#7043A3', '#9D365F', '#F6EAF3', '#FFF8FC', '#F7ECFF', '#33223A', '#DCC8E1'] },
  'liquid-glass': { name: 'Liquid Glass', colors: ['#5143B5', '#0E6270', '#EAE8FF', '#FCFBFF', '#F3F0FF', '#1E2145', '#BDB9E1'] },
} as const;

export interface Appearance {
  preset: keyof typeof presets;
  mode: 'light' | 'dark' | 'system';
  sidebar: 'preset' | 'surface';
  dashboardDensity: 'comfortable' | 'compact';
  tableDensity: 'comfortable' | 'compact';
  primary: string | null;
  secondary: string | null;
  logo: string;
}

export const defaultAppearance: Appearance = {
  preset: 'minimal', mode: 'system', sidebar: 'preset',
  dashboardDensity: 'comfortable', tableDensity: 'comfortable',
  primary: null, secondary: null, logo: '',
};

export type DeveloperAppearance = Pick<Appearance, 'preset' | 'mode'>;

export function readDeveloperAppearance(developerId: string): DeveloperAppearance {
  const defaults: DeveloperAppearance = { preset: defaultAppearance.preset, mode: defaultAppearance.mode };
  try {
    const saved = JSON.parse(localStorage.getItem(`pos-developer-appearance:${developerId}`) ?? 'null');
    const mode = saved?.mode ?? localStorage.getItem('pos-theme');
    return {
      preset: Object.hasOwn(presets, saved?.preset) ? saved.preset : defaults.preset,
      mode: mode === 'light' || mode === 'dark' || mode === 'system' ? mode : defaults.mode,
    };
  } catch {
    return defaults;
  }
}

export function saveDeveloperAppearance(developerId: string, appearance: DeveloperAppearance) {
  localStorage.setItem(`pos-developer-appearance:${developerId}`, JSON.stringify(appearance));
}

const darkSurfaces = {
  minimal: ['#0B1220', '#182233', '#3A4A60'],
  modern: ['#0A1327', '#14203C', '#33476C'],
  enterprise: ['#111827', '#1F2937', '#465469'],
  premium: ['#121212', '#262626', '#404040'],
  compact: ['#071B18', '#102A24', '#37544B'],
  glassmorphism: ['#0A1D30', '#132B42', '#456680'],
  skeuomorphism: ['#211A15', '#332820', '#705A48'],
  'neo-brutalism': ['#14141A', '#24232C', '#D6D3E2'],
  claymorphism: ['#241829', '#36253E', '#72567C'],
  'liquid-glass': ['#141535', '#222548', '#5D619D'],
} as const;

export const useAppearancePreview = create<{ draft: Appearance | null }>(() => ({ draft: null }));
export const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
export const useAppearanceMode = create<{ mode: 'light' | 'dark' | null }>(() => ({ mode: null }));

function luminance(hex: string) {
  const channels = (hex.match(/[a-f0-9]{2}/gi) ?? []).map((pair) => {
    const s = parseInt(pair, 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrast(a: string, b: string) {
  const l = luminance(a);
  const r = luminance(b);
  return (Math.max(l, r) + 0.05) / (Math.min(l, r) + 0.05);
}

function foreground(background: string) {
  return contrast(background, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#000000';
}

export function palette(value: Appearance, dark: boolean) {
  const [base, accent, bg, card, sidebarBase, ink, border] = presets[value.preset].colors;
  const [nightBg, nightSurface, nightBorder] = darkSurfaces[value.preset];
  const premium = value.preset === 'premium';
  const background = dark ? nightBg : premium ? '#FFFBEB' : bg;
  const surface = dark ? nightSurface : premium ? '#FFFFFF' : card;
  const text = dark ? (premium ? ink : '#F1F5F9') : premium ? '#292524' : ink;
  const sidebar = value.sidebar === 'surface' ? surface : dark && contrast(sidebarBase, '#FFFFFF') < 4.5 ? surface : sidebarBase;
  const primary = value.primary ?? base;
  const secondary = value.secondary ?? accent;
  return {
    '--appearance-bg': background,
    '--appearance-surface': surface,
    '--appearance-sidebar': sidebar,
    '--appearance-sidebar-text': contrast(sidebar, text) >= 4.5 ? text : foreground(sidebar),
    '--appearance-text': text,
    '--appearance-border': dark ? nightBorder : premium ? '#E7E0CE' : border,
    '--appearance-primary': primary,
    '--appearance-primary-text': foreground(primary),
    '--appearance-link': contrast(primary, surface) >= 4.5 ? primary : text,
    '--appearance-secondary': secondary,
    '--appearance-secondary-text': foreground(secondary),
    '--appearance-focus': contrast(primary, surface) >= 3 ? primary : text,
  };
}

export function readAppearance(tenantId: string): Appearance {
  try {
    const cached = JSON.parse(localStorage.getItem(`pos-appearance:${tenantId}`) ?? 'null');
    return cached && Object.hasOwn(presets, cached.preset) ? { ...defaultAppearance, ...cached } : defaultAppearance;
  } catch {
    return defaultAppearance;
  }
}

export function cacheAppearance(tenantId: string, appearance: Appearance) {
  try {
    localStorage.setItem(`pos-appearance:${tenantId}`, JSON.stringify(appearance));
    localStorage.setItem(`pos-appearance-palette:${tenantId}`, JSON.stringify({
      preset: appearance.preset, mode: appearance.mode, light: palette(appearance, false), dark: palette(appearance, true),
    }));
  } catch { /* The business still uses its server preferences when local storage is unavailable. */ }
}

export function applyAppearance(appearance: Appearance, override = useAppearanceMode.getState().mode) {
  const root = document.documentElement;
  const dark = (override ?? appearance.mode) === 'dark'
    || (!override && appearance.mode === 'system' && systemTheme.matches);
  applyTheme(dark ? 'dark' : 'light');
  root.style.removeProperty('background-color');
  useTheme.setState({ theme: dark ? 'dark' : 'light' });
  Object.assign(root.dataset, { appearance: appearance.preset, dashboardDensity: appearance.dashboardDensity, tableDensity: appearance.tableDensity });
  for (const [name, value] of Object.entries(palette(appearance, dark))) root.style.setProperty(name, value);
}
