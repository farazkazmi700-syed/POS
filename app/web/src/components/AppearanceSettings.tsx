import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useBusinessAppearance } from '../hooks/useBusinessAppearance';
import { defaultAppearance, palette, useAppearanceMode, useAppearancePreview, type Appearance } from '../store/appearance';
import { useTheme } from '../store/theme';
import { errorMessage } from '../utils/errors';
import ThemePresetPicker, { AppearanceSelect, appearanceModeOptions } from './ThemePresetPicker';

const densityOptions = [{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }] as const;
const sidebarOptions = [{ value: 'preset', label: 'Preset sidebar' }, { value: 'surface', label: 'Match cards' }] as const;

export default function AppearanceSettings() {
  const { key, appearance, query } = useBusinessAppearance();
  const client = useQueryClient();
  const draft = useAppearancePreview((state) => state.draft);
  const [fileError, setFileError] = useState('');
  const readerRef = useRef<FileReader | null>(null);
  const current = draft ?? appearance;
  const dark = useTheme((state) => state.theme) === 'dark';
  const colors = palette(current, dark);

  useEffect(() => () => {
    readerRef.current?.abort();
    useAppearancePreview.setState({ draft: null });
  }, []);

  const save = useMutation({
    mutationFn: async (value: Appearance) => (await api.patch<Appearance>('/tenant/me/appearance', value)).data,
    onSuccess: (saved) => {
      client.setQueryData(key, saved);
      useAppearancePreview.setState({ draft: null });
      useAppearanceMode.setState({ mode: null });
    },
  });

  function update(changes: Partial<Appearance>) {
    save.reset();
    useAppearancePreview.setState({ draft: { ...current, ...changes } });
  }

  function loadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 48_000) {
      setFileError('Choose a PNG, JPEG, or WebP file up to 48 KB.');
      return;
    }
    setFileError('');
    readerRef.current?.abort();
    const reader = new FileReader();
    readerRef.current = reader;
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      useAppearancePreview.setState((state) => ({ draft: { ...(state.draft ?? current), logo: reader.result as string } }));
    };
    reader.onerror = () => setFileError('The logo file could not be read.');
    reader.readAsDataURL(file);
  }

  return <section className="card scroll-mt-28 space-y-5" id="appearance" aria-labelledby="appearance-heading">
    <div>
      <h2 id="appearance-heading" className="text-base font-semibold">Appearance</h2>
      <p className="mt-1 text-sm text-slate-500">Changes preview live. Saving applies them to this business.</p>
    </div>
    <fieldset disabled={save.isPending || query.isPending} className="space-y-5">
      <legend className="mb-2 text-sm font-medium">Theme</legend>
      <ThemePresetPicker selected={current.preset} dark={dark} onSelect={(preset) => update({
        preset, primary: null, secondary: null,
        dashboardDensity: preset === 'compact' ? 'compact' : 'comfortable',
        tableDensity: preset === 'compact' ? 'compact' : 'comfortable',
        ...(preset === 'premium' ? { mode: 'dark' } : {}),
      })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <AppearanceSelect label="Mode" value={current.mode} options={appearanceModeOptions} onChange={(mode) => update({ mode })} />
        <AppearanceSelect label="Sidebar" value={current.sidebar} options={sidebarOptions} onChange={(sidebar) => update({ sidebar })} />
        <AppearanceSelect label="Dashboard density" value={current.dashboardDensity} options={densityOptions} onChange={(dashboardDensity) => update({ dashboardDensity })} />
        <AppearanceSelect label="Table density" value={current.tableDensity} options={densityOptions} onChange={(tableDensity) => update({ tableDensity })} />
      </div>
      <div className="flex flex-wrap gap-4">
        {(['primary', 'secondary'] as const).map((name) => <div key={name} className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">{name === 'primary' ? 'Primary' : 'Secondary'}
            <input type="color" className="h-8 w-10 cursor-pointer" value={colors[`--appearance-${name}`]} onChange={(event) => update({ [name]: event.target.value })} />
          </label>
          {current[name] && <button type="button" className="text-sm underline" onClick={() => update({ [name]: null })}>Reset {name}</button>}
        </div>)}
      </div>
      <p className="text-xs text-slate-500">Button text and focus indicators adjust automatically for contrast.</p>
      <div className="flex flex-wrap items-end gap-3">
        {current.logo && <img src={current.logo} alt="Business logo preview" className="h-12 w-12 rounded object-contain" />}
        <label className="grid gap-1 text-sm font-medium">Business logo
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={loadLogo} className="input max-w-full" />
        </label>
        {current.logo && <button type="button" className="btn-secondary" onClick={() => update({ logo: '' })}>Remove logo</button>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={!draft || query.isError} onClick={() => save.mutate(current)}>{save.isPending ? 'Saving…' : 'Save appearance'}</button>
        <button type="button" className="btn-secondary" disabled={!draft} onClick={() => {
          readerRef.current?.abort(); useAppearancePreview.setState({ draft: null }); setFileError(''); save.reset();
        }}>Cancel</button>
        <button type="button" className="btn-secondary" onClick={() => {
          readerRef.current?.abort(); setFileError(''); update(defaultAppearance);
        }}>Restore defaults</button>
      </div>
    </fieldset>
    {(fileError || query.error || save.error) && <p role="alert" className="text-sm text-red-600">{fileError || errorMessage(save.error ?? query.error)}</p>}
    {save.isSuccess && <p role="status" className="text-sm">Business appearance saved.</p>}
  </section>;
}
