import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { closedTime, nextIndex, openAddBusiness, rowAction, showsBusinesses, type BusinessRow } from './businessMenuRows';
import { ChevronGlyph } from './TopBar';

/**
 * The open business's name in the top bar, as a quiet menu button
 * (docs/designs/separate-businesses.md, DT1; D14, D16 to D18, D21, D22).
 *
 *   [Harbor & Pine Bakery v]
 *     ● Harbor & Pine Bakery        Open
 *     ○ Northgate Realty            Closed since 9:12
 *     ○ Harbor & Pine Catering      Folder not found · Find it
 *     ○ New business                Setup not finished
 *     ─────────────────────────────
 *     + Add a business
 *
 * Only once each business keeps its own settings (perOffice); before that it
 * is not shown. With one business the menu holds only Add a business. Choosing
 * a closed business, or one whose setup is not finished, switches to it, which
 * closes the open office first (closing time, D10). A business whose folder is
 * gone opens Settings to find it, and never starts closing time.
 */
/** The app's name, as the window title has it (index.html). */
const APP_TITLE = "Don't Be Michael";

export function BusinessMenu() {
  const { t } = useTranslation();
  const [list, setList] = useState<{ perOffice: boolean; businesses: BusinessRow[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const load = useCallback(() => {
    void window.cth.listBusinesses?.().then(setList).catch(() => { /* keep the last list */ });
  }, []);
  useEffect(() => { load(); }, [load]);
  // A save anywhere (a business renamed, a switch noted) and coming back to
  // the window bring the list up to date.
  useEffect(() => window.cth.onConfigChanged(() => load()), [load]);
  useEffect(() => {
    const onFocus = (): void => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const rows = list?.businesses ?? [];
  const current = rows.find((r) => r.state === 'open');
  const name = current?.name ?? t('businessMenu.newBusiness');
  const many = showsBusinesses(rows);
  const items = many ? rows.length + 1 : 1; // the rows, then Add a business

  // The window title names the business when there are two or more (D22).
  useEffect(() => {
    document.title = list?.perOffice && many ? t('businessMenu.windowTitle', { name, app: APP_TITLE }) : APP_TITLE;
  }, [list?.perOffice, many, name, t]);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setError('');
    if (refocus) buttonRef.current?.focus();
  }, []);

  // Opening moves focus to the open business's row, or Add a business (D21).
  useEffect(() => {
    if (!open) return;
    const start = many ? Math.max(0, rows.findIndex((r) => r.state === 'open')) : 0;
    requestAnimationFrame(() => itemRefs.current[start]?.focus());
    const onDown = (e: MouseEvent): void => { if (!wrapRef.current?.contains(e.target as Node)) close(false); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open, many, rows, close]);

  if (!list?.perOffice) return null;

  const switchTo = async (home: string): Promise<void> => {
    setBusy(true);
    setError('');
    const res = await window.cth.changeHome(home, 'fresh').catch((e) => ({ ok: false, error: String(e) }));
    setBusy(false);
    // ok: closing time took over (its bar says "Closing A to open B"), or the
    // app is reopening on the other business.
    if (res.ok) { close(false); return; }
    setError(res.error ?? t('businessMenu.couldNotSwitch'));
  };

  const choose = (row: BusinessRow): void => {
    const action = rowAction(row);
    if (action === 'none') { close(true); return; }
    if (action === 'findIt') {
      close(false);
      window.dispatchEvent(new CustomEvent('cth:open-settings', { detail: { section: 'General' } }));
      return;
    }
    // Setup not finished: the wizard goes on where it stopped (D18, D19).
    if (action === 'resume') { close(false); openAddBusiness(row.id); return; }
    void switchTo(row.home);
  };

  // Add a business: the setup wizard over the open business, which keeps
  // working until the wizard's Open the office (D19, DT3).
  const addBusiness = (): void => { close(false); openAddBusiness(); };

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if (e.key === 'Tab') { close(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const at = itemRefs.current.findIndex((el) => el === document.activeElement);
      itemRefs.current[nextIndex(at, items, e.key)]?.focus();
    }
  };

  const stateText = (row: BusinessRow): JSX.Element => {
    if (row.state === 'open') return <span style={{ ...stateStyle, color: 'var(--cth-green-text)' }}>{t('businessMenu.open')}</span>;
    if (row.state === 'setup') return <span style={stateStyle}>{t('businessMenu.setupNotFinished')}</span>;
    if (row.state === 'missing') {
      return <span style={stateStyle}>{t('businessMenu.folderNotFound')} · <span style={{ textDecoration: 'underline' }}>{t('businessMenu.findIt')}</span></span>;
    }
    return row.closedAt
      ? <span style={stateStyle}>{t('businessMenu.closedSince')} <span style={{ fontFamily: 'var(--cth-font-mono)' }}>{closedTime(row.closedAt)}</span></span>
      : <span style={stateStyle}>{t('businessMenu.closed')}</span>;
  };

  return (
    <div ref={wrapRef} className="cth-titlebar-nodrag" style={{ position: 'relative', flexShrink: 1, minWidth: 0 }}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('businessMenu.button', { name })}
        title={name}
        onClick={() => (open ? close(false) : setOpen(true))}
        className="cth-business-button"
        style={buttonStyle}
      >
        <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <ChevronGlyph />
      </button>
      {open && (
        <div role="menu" aria-label={t('businessMenu.label')} onKeyDown={onMenuKey} style={menuStyle}>
          {many && rows.map((row, i) => (
            <button
              key={row.id}
              ref={(el) => { itemRefs.current[i] = el; }}
              type="button"
              role="menuitemradio"
              aria-checked={row.state === 'open'}
              disabled={busy}
              title={row.name ?? undefined}
              onClick={() => choose(row)}
              style={rowStyle}
              className="cth-business-row"
            >
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: row.state === 'open' ? 'var(--cth-green)' : 'var(--cth-ink-4)' }} />
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: row.state === 'missing' ? 'var(--cth-ink-3)' : 'var(--cth-ink)' }}>
                {row.name ?? t('businessMenu.newBusiness')}
              </span>
              {stateText(row)}
            </button>
          ))}
          {many && <div role="separator" style={{ height: 1, margin: '4px 6px', background: 'var(--cth-line)' }} />}
          <button
            ref={(el) => { itemRefs.current[many ? rows.length : 0] = el; }}
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={addBusiness}
            style={{ ...rowStyle, minHeight: 32, color: 'var(--cth-ink-2)', fontWeight: 500 }}
            className="cth-business-row"
          >
            <span aria-hidden="true" style={{ width: 8, textAlign: 'center' }}>+</span>
            {t('businessMenu.add')}
          </button>
          {error && <div role="alert" style={{ padding: '6px 10px', fontSize: 12, lineHeight: '17px', color: 'var(--cth-coral-text)' }}>{error}</div>}
        </div>
      )}
    </div>
  );
}

// A quiet button beside the lockup (DESIGN.md 7.1, icon button hover).
const buttonStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 8px 0 10px', minWidth: 0,
  border: 'none', borderRadius: 'var(--cth-r-md)', cursor: 'pointer', background: 'transparent',
  fontFamily: 'var(--cth-font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--cth-ink)'
};

const menuStyle: CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', insetInlineStart: 0, zIndex: 200, width: 320, maxWidth: 'calc(100vw - 32px)',
  padding: 6, display: 'flex', flexDirection: 'column',
  background: 'var(--cth-card)', borderRadius: 'var(--cth-r-lg)',
  boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-lg)'
};

// Rows are 40 px tall (D21).
const rowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, padding: '6px 10px', width: '100%',
  border: 'none', borderRadius: 'var(--cth-r-sm)', cursor: 'pointer', textAlign: 'start', background: 'transparent',
  fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink)'
};

const stateStyle: CSSProperties = { fontSize: 11, color: 'var(--cth-ink-3)', flex: 'none', whiteSpace: 'nowrap' };
