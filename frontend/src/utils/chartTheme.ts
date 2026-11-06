import { useThemeStore } from '@/store';

/** Recharts takes literal colours, so the palette is resolved here per theme instead of in CSS. */
export function useChartTheme() {
  const dark = useThemeStore((state) => state.theme) === 'dark';
  return {
    dark,
    grid: dark ? '#232c27' : '#e7ece9',
    axis: dark ? '#67746d' : '#94a19a',
    cursor: dark ? 'rgb(255 255 255 / 0.04)' : 'rgb(1 65 28 / 0.05)',
    muted: dark ? '#37423c' : '#dfe5e2',
    // Brand green first; the rest are distinguishable without relying on hue alone.
    series: dark
      ? ['#56cd8a', '#8fa8b8', '#e0a548', '#c792d8']
      : ['#01411c', '#5f7f93', '#b7791f', '#8b5a9e'],
    highlight: dark ? '#56cd8a' : '#01411c',
    tooltip: {
      contentStyle: {
        borderRadius: 10,
        border: `1px solid ${dark ? '#37423c' : '#dfe5e2'}`,
        background: dark ? '#161d19' : '#ffffff',
        boxShadow: '0 10px 30px -12px rgb(16 29 22 / 0.25)',
        fontSize: 12,
        padding: '8px 12px',
      },
      labelStyle: { color: dark ? '#eef2f0' : '#161d19', fontWeight: 600, marginBottom: 4 },
      itemStyle: { color: dark ? '#c6cfca' : '#4c5852', padding: 0 },
    },
    tick: { fontSize: 11, fill: dark ? '#67746d' : '#94a19a' },
  };
}
