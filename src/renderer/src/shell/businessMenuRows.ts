/**
 * The business menu's rows as data (docs/designs/separate-businesses.md, DT1,
 * decisions D14, D16 to D18, D21, D22), kept apart from the component so they
 * test without a page.
 */

export interface BusinessRow {
  id: string;
  home: string;
  name: string | null;
  state: 'open' | 'closed' | 'missing' | 'setup';
  closedAt?: number;
}

/** What choosing a row does. Open: nothing, it is on screen. Closed or setup
 *  not finished: switch to it (closing time first). Folder not found: Settings,
 *  to find it; it never starts closing time (D17). */
export type RowAction = 'none' | 'switch' | 'findIt';

export function rowAction(row: BusinessRow): RowAction {
  if (row.state === 'open') return 'none';
  if (row.state === 'missing') return 'findIt';
  return 'switch';
}

/** "9:12" for an office closed today, "Nov 18" for one closed before. */
export function closedTime(at: number, now: number = Date.now(), locale?: string): string {
  const a = new Date(at);
  const n = new Date(now);
  const sameDay = a.getFullYear() === n.getFullYear() && a.getMonth() === n.getMonth() && a.getDate() === n.getDate();
  return sameDay
    ? a.toLocaleTimeString(locale ? [locale] : [], { hour: 'numeric', minute: '2-digit' })
    : a.toLocaleDateString(locale ? [locale] : [], { month: 'short', day: 'numeric' });
}

/** The menu lists the businesses only when there are two or more (D14); with
 *  one, it holds only Add a business. The window title names the business in
 *  the same case (D22). */
export function showsBusinesses(rows: BusinessRow[]): boolean {
  return rows.length >= 2;
}

/** The next item for an arrow key, wrapping at the ends (D21). */
export function nextIndex(current: number, count: number, key: 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'): number {
  if (count <= 0) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (current < 0) return key === 'ArrowDown' ? 0 : count - 1;
  return key === 'ArrowDown' ? (current + 1) % count : (current - 1 + count) % count;
}
