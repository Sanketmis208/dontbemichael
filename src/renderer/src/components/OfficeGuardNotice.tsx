import { useTranslation } from 'react-i18next';
import { InfoTip } from './InfoTip';
import { PixelButton } from './PixelButton';

export type OfficeGuard = 'otherBusiness' | 'newBusiness';

/**
 * Why a switch to another office was refused (main: officeSwitchGuard). The
 * settings belong to the business that is open, so another business's office,
 * or a new empty one, can't be opened from here until each office keeps its
 * own (docs/designs/separate-businesses.md). A title, one line and OK; the why
 * sits behind the info icon.
 */
export function OfficeGuardNotice({ guard, onClose }: { guard: OfficeGuard; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alertdialog" aria-labelledby="office-guard-title" aria-describedby="office-guard-line" style={{
      display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 'var(--cth-r-lg)',
      background: 'var(--cth-card-2)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span id="office-guard-title" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--cth-ink)' }}>
          {t(`officeGuard.${guard}.title`)}
        </span>
        <InfoTip text={t('officeGuard.why')} />
      </div>
      <span id="office-guard-line" style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-2)' }}>
        {t(`officeGuard.${guard}.line`)}
      </span>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <PixelButton variant="secondary" size="sm" onClick={onClose} autoFocus>
          {t('common.ok')}
        </PixelButton>
      </div>
    </div>
  );
}
