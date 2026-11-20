import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { closedTime, rowAction, type BusinessRow } from '@/shell/businessMenuRows';

/**
 * Settings, General, Your businesses (docs/designs/separate-businesses.md, DT2,
 * D15 to D18): the same entries as the business menu in the top bar, each with
 * its folder. A closed business opens (closing time first); one whose folder
 * went missing is found again; one whose setup was never finished opens or is
 * removed. Shown once each business keeps its own settings.
 */
export function YourBusinesses({ businesses, onOpen, onChanged }: {
  businesses: BusinessRow[];
  /** Switch to this business (Settings' own open, which handles closing time). */
  onOpen: (home: string) => void;
  /** Something changed here: read the list again. */
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const findIt = async (row: BusinessRow): Promise<void> => {
    setError('');
    const pick = await window.cth.chooseFolder();
    if (!pick.ok) return;
    setBusy(row.id);
    const res = await window.cth.relocateBusiness(row.id, pick.path).catch(() => ({ ok: false, error: 'notFound' as const }));
    setBusy(null);
    if (res.ok) { onChanged(); return; }
    setError(t('settings.business.notThatOffice', { name: row.name ?? t('businessMenu.newBusiness') }));
  };

  const remove = async (row: BusinessRow): Promise<void> => {
    setError('');
    setBusy(row.id);
    const ok = await window.cth.removeUnfinishedBusiness(row.id).catch(() => false);
    setBusy(null);
    if (ok) onChanged();
    else setError(t('settings.business.couldNotRemove'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }} role="list" aria-label={t('settings.business.title')}>
      {businesses.map((row) => {
        const action = rowAction(row);
        const name = row.name ?? t('businessMenu.newBusiness');
        return (
          <div key={row.id} role="listitem" style={rowStyle}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: row.state === 'open' ? 'var(--cth-green)' : 'var(--cth-ink-4)' }} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                <span title={name} style={{ fontSize: 13.5, fontWeight: 600, color: row.state === 'missing' ? 'var(--cth-ink-3)' : 'var(--cth-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                <span style={{ fontSize: 11.5, flex: 'none', color: row.state === 'open' ? 'var(--cth-green-text)' : 'var(--cth-ink-3)' }}>
                  {row.state === 'open' ? t('businessMenu.open')
                    : row.state === 'setup' ? t('businessMenu.setupNotFinished')
                      : row.state === 'missing' ? t('businessMenu.folderNotFound')
                        : row.closedAt ? <>{t('businessMenu.closedSince')} <span style={{ fontFamily: 'var(--cth-font-mono)' }}>{closedTime(row.closedAt)}</span></> : t('businessMenu.closed')}
                </span>
              </div>
              <span title={row.home} style={{ fontFamily: 'var(--cth-font-mono, monospace)', fontSize: 12, color: 'var(--cth-ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.home}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
              {action === 'switch' && (
                <PixelButton variant="secondary" size="sm" disabled={busy === row.id} onClick={() => onOpen(row.home)}>{t('settings.business.open')}</PixelButton>
              )}
              {action === 'findIt' && (
                <PixelButton variant="secondary" size="sm" disabled={busy === row.id} onClick={() => { void findIt(row); }}>{t('businessMenu.findIt')}</PixelButton>
              )}
              {row.state === 'setup' && (
                <PixelButton variant="ghost" size="sm" disabled={busy === row.id} onClick={() => { void remove(row); }}>{t('settings.business.remove')}</PixelButton>
              )}
            </div>
          </div>
        );
      })}
      {error && <div role="alert" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--cth-coral-text)', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '6px 10px',
  borderRadius: 'var(--cth-r-md)', boxShadow: 'inset 0 0 0 1px var(--cth-line)'
};
