export function formatNumber(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat('en-US', options).format(value);
}

export function formatCompact(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatRelativeTime(date: Date | string | number): string {
  const target = typeof date === 'object' ? date.getTime() : new Date(date).getTime();
  const delta = Math.round((target - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ];

  for (const [unit, secondsIn] of units) {
    if (Math.abs(delta) >= secondsIn || unit === 'second') {
      return rtf.format(Math.round(delta / secondsIn), unit);
    }
  }
  return 'just now';
}
