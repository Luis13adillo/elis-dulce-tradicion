import { subDays, startOfWeek, startOfMonth } from 'date-fns';

// Re-export type for use across report components
export type DatePreset = 'today' | 'this_week' | 'this_month' | 'last_30' | 'last_90' | 'all_time';

export function generateCSV(headers: string[], rows: (string | number)[][]): string {
  const escape = (val: string | number) => {
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.map(escape).join(',')];
  rows.forEach(row => lines.push(row.map(escape).join(',')));
  return lines.join('\n');
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function getDateRange(preset: DatePreset): { start: Date; end: Date; label: string } {
  const now = new Date();
  const end = now;
  switch (preset) {
    case 'today':
      return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end, label: 'Today' };
    case 'this_week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end, label: 'This Week' };
    case 'this_month':
      return { start: startOfMonth(now), end, label: 'This Month' };
    case 'last_30':
      return { start: subDays(now, 30), end, label: 'Last 30 Days' };
    case 'last_90':
      return { start: subDays(now, 90), end, label: 'Last 90 Days' };
    case 'all_time':
      return { start: new Date(2020, 0, 1), end, label: 'All Time' };
  }
}
