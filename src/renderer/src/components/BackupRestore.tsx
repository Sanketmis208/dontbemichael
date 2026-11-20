import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { InfoTip } from './InfoTip';

/** The shortest backup password (backupSecrets.ts MIN_BACKUP_PASSWORD). */
const MIN_PASSWORD = 8;

type Summary = { createdAt: number; appVersion: string; businesses: string[]; hasSecrets: boolean; fromOtherHome: boolean };
type State =
  | { kind: 'idle' }
  | { kind: 'backupPassword' }
  | { kind: 'backingUp'; files: number; bytes: number }
  | { kind: 'backedUp'; path: string; bytes: number }
  | { kind: 'restorePicked'; path: string; summary: Summary }
  | { kind: 'restoring' }
  | { kind: 'restoreStopped'; secrets: boolean };

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Back up everything on this computer, or restore it on a new one
 * (docs/designs/backup-restore.md). Settings, General shows both; the first
 * setup screen of a new computer shows Restore only (`restoreOnly`).
 *
 *   Back up: a backup password (twice), where to save, the progress, done.
 *   Restore: pick the file, see what is in it, its password, confirm, and the
 *   app reopens on it.
 */
export function BackupRestore({ restoreOnly = false, hasOffice = true }: { restoreOnly?: boolean; hasOffice?: boolean }) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');

  useEffect(() => window.cth.onBackupProgress?.((p) => {
    setState((s) => (s.kind === 'backingUp' ? { kind: 'backingUp', files: p.files, bytes: p.bytes } : s));
  }), []);

  const reset = (): void => { setState({ kind: 'idle' }); setPassword(''); setAgain(''); setError(''); };

  const backUp = async (): Promise<void> => {
    setError('');
    if (password.length < MIN_PASSWORD) { setError(t('backup.passwordShort', { count: MIN_PASSWORD })); return; }
    if (password !== again) { setError(t('backup.passwordMismatch')); return; }
    setState({ kind: 'backingUp', files: 0, bytes: 0 });
    const res = await window.cth.backupCreate(password).catch(() => ({ ok: false, error: 'failed' }));
    if (res.ok && 'path' in res && res.path) { setPassword(''); setAgain(''); setState({ kind: 'backedUp', path: res.path, bytes: res.bytes ?? 0 }); return; }
    setState({ kind: 'backupPassword' });
    if (res.error !== 'cancelled') setError(t('backup.couldNotBackUp'));
  };

  const pick = async (): Promise<void> => {
    setError('');
    const res = await window.cth.backupPick().catch(() => ({ ok: false, error: 'notBackup' }));
    if (res.ok && 'summary' in res && res.summary && res.path) { setPassword(''); setState({ kind: 'restorePicked', path: res.path, summary: res.summary }); return; }
    if (res.error !== 'cancelled') setError(t('backup.notBackup'));
  };

  const restore = async (path: string): Promise<void> => {
    setError('');
    setState({ kind: 'restoring' });
    const res = await window.cth.backupRestore(path, password).catch(() => ({ ok: false, error: 'failed' }));
    // ok: the app reopens on the restored office.
    if (res.ok) return;
    // Stopped after it began writing: the office is stopped, so the owner is
    // told what happened and reopens the app on what came back.
    if (res.error === 'stopped' || res.error === 'secretsNotSaved') { setState({ kind: 'restoreStopped', secrets: res.error === 'secretsNotSaved' }); return; }
    const back = state.kind === 'restorePicked' ? state : null;
    if (back) setState(back);
    setError(res.error === 'wrongPassword' ? t('backup.wrongPassword') : t('backup.couldNotRestore'));
  };

  const field = (value: string, set: (v: string) => void, label: string, autoFocus = false) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--cth-ink-2)' }}>
      {label}
      <input type="password" value={value} onChange={(e) => set(e.target.value)} autoFocus={autoFocus} autoComplete="new-password" style={input} />
    </label>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {state.kind === 'idle' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {!restoreOnly && <PixelButton variant="secondary" size="sm" onClick={() => setState({ kind: 'backupPassword' })}>{t('backup.backUp')}</PixelButton>}
          <PixelButton variant="secondary" size="sm" onClick={() => { void pick(); }}>{t('backup.restore')}</PixelButton>
          <InfoTip text={restoreOnly ? t('backup.restoreTip') : t('backup.tip')} />
        </div>
      )}

      {state.kind === 'backupPassword' && (
        <div style={panel}>
          <span style={{ fontSize: 13, color: 'var(--cth-ink)' }}>{t('backup.passwordLine')}</span>
          {field(password, setPassword, t('backup.password'), true)}
          {field(again, setAgain, t('backup.passwordAgain'))}
          <div style={buttons}>
            <PixelButton variant="secondary" size="sm" onClick={reset}>{t('common.cancel')}</PixelButton>
            <PixelButton variant="primary" size="sm" onClick={() => { void backUp(); }}>{t('backup.chooseWhere')}</PixelButton>
          </div>
        </div>
      )}

      {state.kind === 'backingUp' && (
        <div role="status" aria-live="polite" style={{ fontSize: 13, color: 'var(--cth-ink-2)' }}>
          {t('backup.backingUp', { count: state.files, size: size(state.bytes) })}
        </div>
      )}

      {state.kind === 'backedUp' && (
        <div role="status" style={panel}>
          <span style={{ fontSize: 13, color: 'var(--cth-ink)' }}>{t('backup.done', { size: size(state.bytes) })}</span>
          <span style={{ fontFamily: 'var(--cth-font-mono, monospace)', fontSize: 12, color: 'var(--cth-ink-3)', wordBreak: 'break-all' }}>{state.path}</span>
          <span style={{ fontSize: 12.5, color: 'var(--cth-ink-3)' }}>{t('backup.keepPassword')}</span>
          <div style={buttons}><PixelButton variant="secondary" size="sm" onClick={reset}>{t('backup.ok')}</PixelButton></div>
        </div>
      )}

      {state.kind === 'restoreStopped' && (
        <div role="alert" style={panel}>
          <span style={{ fontSize: 13, color: 'var(--cth-ink)' }}>{state.secrets ? t('backup.stoppedSecrets') : t('backup.stopped')}</span>
          <div style={buttons}>
            <PixelButton variant="primary" size="sm" onClick={() => { void window.cth.backupReopen(); }}>{t('backup.reopen')}</PixelButton>
          </div>
        </div>
      )}
      {state.kind === 'restorePicked' && (
        <div style={panel}>
          <span style={{ fontSize: 13, color: 'var(--cth-ink)' }}>
            {t('backup.from', { date: new Date(state.summary.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) })}
          </span>
          {state.summary.businesses.length > 0 && (
            <span style={{ fontSize: 12.5, color: 'var(--cth-ink-2)' }}>{state.summary.businesses.join(', ')}</span>
          )}
          {state.summary.hasSecrets && field(password, setPassword, t('backup.password'), true)}
          {hasOffice && <span role="alert" style={{ fontSize: 12.5, color: 'var(--cth-coral-text)' }}>{t('backup.replaces')}</span>}
          <span style={{ fontSize: 12.5, color: 'var(--cth-ink-3)' }}>{t('backup.signInAgain')}</span>
          <div style={buttons}>
            <PixelButton variant="secondary" size="sm" onClick={reset}>{t('common.cancel')}</PixelButton>
            <PixelButton variant={hasOffice ? 'destructive' : 'primary'} size="sm" disabled={state.summary.hasSecrets && !password} onClick={() => { void restore(state.path); }}>
              {t('backup.restoreNow')}
            </PixelButton>
          </div>
        </div>
      )}

      {state.kind === 'restoring' && (
        <div role="status" aria-live="polite" style={{ fontSize: 13, color: 'var(--cth-ink-2)' }}>{t('backup.restoring')}</div>
      )}

      {error && <div role="alert" style={{ fontSize: 12, lineHeight: '18px', color: 'var(--cth-coral-text)' }}>{error}</div>}
    </div>
  );
}

const panel: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 'var(--cth-r-lg)',
  background: 'var(--cth-card-2)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2)'
};
const buttons: CSSProperties = { display: 'flex', gap: 8, justifyContent: 'flex-end' };
const input: CSSProperties = {
  height: 32, padding: '0 10px', borderRadius: 'var(--cth-r-md)', border: 'none', fontSize: 13,
  background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2)', color: 'var(--cth-ink)', fontFamily: 'var(--cth-font-ui)'
};
