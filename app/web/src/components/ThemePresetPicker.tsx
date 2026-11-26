import { useId, type CSSProperties } from 'react';
import { defaultAppearance, palette, presets, type Appearance } from '../store/appearance';

export const appearanceModeOptions = [
  { value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' },
] as const;

const presetIds = Object.keys(presets) as Appearance['preset'][];

export function AppearanceSelect<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void;
}) {
  const id = useId();
  return <div className="grid gap-1 text-sm font-medium">
    <label htmlFor={id}>{label}</label>
    <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value as T)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </div>;
}

export default function ThemePresetPicker({ selected, dark, onSelect }: {
  selected: Appearance['preset']; dark: boolean; onSelect: (preset: Appearance['preset']) => void;
}) {
  const name = useId();
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
    {presetIds.map((id) => <label key={id} className="appearance-option">
      <input type="radio" name={name} checked={selected === id} onChange={() => onSelect(id)} />
      <span className="appearance-option-name font-medium">{presets[id].name}</span>
      <span className="appearance-sample" data-appearance-sample={id} aria-hidden="true"
        style={palette({ ...defaultAppearance, preset: id }, dark) as CSSProperties}>
        <span className="appearance-sample-sidebar" />
        <span className="appearance-sample-card"><span /></span>
      </span>
    </label>)}
  </div>;
}
