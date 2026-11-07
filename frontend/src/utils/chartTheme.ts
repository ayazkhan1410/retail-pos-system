import { useThemeStore } from '@/store';

/** Tailwind classes for the design's categorical colours, in order: ink, indigo, teal, amber, grey. */
export const SERIES_CLASSES = [
  'bg-brand-900 dark:bg-brand-100',
  'bg-accent',
  'bg-cyan-500',
  'bg-amber-500',
  'bg-brand-300 dark:bg-brand-600',
];

/** Recharts takes literal colours, so the palette is resolved here per theme instead of in CSS. */
export function useChartTheme() {
  const dark = useThemeStore((state) => state.theme) === 'dark';
  const accent = dark ? '#8a84ff' : '#635bff';
  return {
    dark,
    accent,
    accentFill: dark ? 'rgba(138,132,255,0.16)' : 'rgba(99,91,255,0.10)',
    grid: dark ? '#23252a' : '#ececef',
    axis: dark ? '#6b7079' : '#9a9ea6',
    cursor: dark ? 'rgb(255 255 255 / 0.04)' : 'rgb(15 17 21 / 0.04)',
    muted: dark ? '#3f434a' : '#d3d4d9',
    previous: dark ? '#6b7079' : '#c3c5cb',
    // Ink, Tijori indigo, teal, amber, grey — readable without relying on hue alone.
    series: dark
      ? ['#e6e6ea', '#8a84ff', '#22b8cf', '#f0b43c', '#4b4f57']
      : ['#0f1115', '#635bff', '#0ea5b7', '#d9900f', '#d3d4d9'],
    highlight: accent,
    tooltip: {
      contentStyle: {
        borderRadius: 8,
        border: 'none',
        background: dark ? '#f1f1f3' : '#0f1115',
        boxShadow: '0 10px 30px -12px rgb(16 17 20 / 0.35)',
        fontSize: 12,
        padding: '6px 10px',
      },
      labelStyle: { color: dark ? '#4b4f57' : '#9a9ea6', fontWeight: 500, marginBottom: 2 },
      itemStyle: { color: dark ? '#0f1115' : '#ffffff', padding: 0, fontWeight: 600 },
    },
    tick: { fontSize: 11, fill: dark ? '#6b7079' : '#9a9ea6' },
  };
}
