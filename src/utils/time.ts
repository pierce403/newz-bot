export function parseDate(value: string): Date {
  const normalized = value.trim();
  if (/^\d{14}$/u.test(normalized)) {
    const year = Number.parseInt(normalized.slice(0, 4), 10);
    const month = Number.parseInt(normalized.slice(4, 6), 10) - 1;
    const day = Number.parseInt(normalized.slice(6, 8), 10);
    const hour = Number.parseInt(normalized.slice(8, 10), 10);
    const minute = Number.parseInt(normalized.slice(10, 12), 10);
    const second = Number.parseInt(normalized.slice(12, 14), 10);
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function hoursBetween(earlierIso: string | undefined, later = new Date()): number {
  if (!earlierIso) {
    return 24;
  }
  const earlier = new Date(earlierIso);
  if (Number.isNaN(earlier.getTime())) {
    return 24;
  }
  return Math.max(1, Math.ceil((later.getTime() - earlier.getTime()) / (60 * 60 * 1000)));
}

export function deriveTimespanFromHours(hours: number): string {
  if (hours <= 1) {
    return '1h';
  }
  if (hours <= 72) {
    return `${hours}h`;
  }
  return `${Math.ceil(hours / 24)}d`;
}

export function formatShortTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}
