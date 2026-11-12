import { ResearchPrivacySettings } from './ResearchPrivacySettings';
import { cleanDataClassOverrides } from '../../../shared/dataClasses';
import { MailboxesSettings } from './MailboxesSettings';
import type { PlaceGroup } from '@shared/settingsPlaces';
import { ClaudeConnectorsSettings } from './ClaudeConnectorsSettings';
import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { fieldLabel, groupName, hint, panelStyle } from './fieldText';
import { useDialog } from '@/shell/useDialog';
import { useBackdropClose } from '@/hooks/useBackdropClose';
import { useTranslation } from 'react-i18next';
import { agentModels, type HarnessConfig } from '@/store/config';
import { useStore } from '@/store/store';
import { clearLocalState, restoreLocalState, snapshotLocalState } from '@/store/localState';
import { plainReasonKey } from '@/store/plainReason';
import { SHOW_MAILBOXES, SHOW_SIMPLE_MODE_SWITCH } from '@shared/buildFeatures';
import { InfoTip } from './InfoTip';
import { KnowledgeDocList } from './KnowledgeDocList';
import { PixelButton } from './PixelButton';
import { SettingsHeroCard } from './SettingsHeroCard';
import { CompanyProfileSettings, type CompanyProfileDraft } from './CompanyProfileSettings';
import { cityLine, cleanCompanyProfile, mergeEditedProfile } from '@shared/companyProfile';
import { SetupPanel } from './SetupPanel';
import { ClaudeSignInSettings } from './ClaudeSignInSettings';
import { Icon } from './Icon';
import { IntegrationsRegistry } from './IntegrationsRegistry';

export interface SettingsModalProps {
  config: HarnessConfig;
  onClose: () => void;
  /** Open straight to a section instead of General. Used by deep links from
   *  elsewhere in the UI — "set it now" beside a disabled Talk button lands on
   *  the tab that actually holds the field, rather than making the user hunt. */
  initialSection?: Section;
  /** A place named in agent text (settings-links-in-replies.md): the section,
   *  a group to scroll to and highlight, and Mailboxes' Add form. A new seq
   *  moves an open Settings too. */
  place?: SettingsPlace;
}

export interface SettingsPlace { section?: Section; group?: PlaceGroup; add?: boolean; seq: number }

/** The v2 field (DESIGN.md 7.9). Its ring and indigo focus ring come from the
 *  `cth-input` class every caller sets. */
const fieldInputStyle: CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  background: 'var(--cth-card)',
  border: 'none',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 13,
  color: 'var(--cth-ink)',
  outline: 'none'
};

// snapshotLocalState / restoreLocalState / clearLocalState live in
// store/localState.ts (re-exported here for existing importers).
export { clearLocalState, restoreLocalState, snapshotLocalState } from '@/store/localState';

// v0.3.4 redesign: six tabs, one topic each. 'AI Engines' folded into
// Agents (once Agents & Models, now also autonomy and budgets); connectors, mailboxes and REST live together in Connections;
// Danger Zone became a red row at the bottom of General.
/* Every Settings section is a group on the shared soft panel with its name at
   the top (app-style-rollout.md AS2, AS3); the panels' gap replaces the old
   hairlines and small caps heads. */
const group: CSSProperties = { ...panelStyle, gap: 10 };

// Agents & Models and Autonomy & Budgets are one Agents tab (owner, 2026-10-01):
// the model agents run on, how much they do alone and the limits that stop them.
export type Section = 'General' | 'Company profile' | 'Prerequisites' | 'Agents' | 'Connections' | 'Research & privacy' | 'Memory & Knowledge';
const VISIBLE_SECTIONS: Section[] = ['General', 'Company profile', 'Prerequisites', 'Agents', 'Connections', 'Research & privacy', 'Memory & Knowledge'];
/** i18n key for each nav section's label — the Section values themselves stay
 *  as stable identifiers (tab state, deep links). */
const NAV_SECTION_KEYS: Record<Section, string> = {
  'General': 'settings.nav.general',
  'Company profile': 'settings.nav.companyProfile',
  'Prerequisites': 'settings.nav.prerequisites',
  'Agents': 'settings.nav.agents',
  'Connections': 'settings.nav.connections',
  'Research & privacy': 'settings.nav.research',
  'Memory & Knowledge': 'settings.nav.memoryKnowledge'
};

export function SettingsModal({ config, onClose, initialSection, place }: SettingsModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // Esc and the focus trap (DESIGN.md 7.23). The close it runs is set below,
  // once requestClose exists, so unsaved changes still ask first.
  const closeFnRef = useRef<() => void>(() => onClose());
  useDialog(dialogRef, () => closeFnRef.current());
  // The backdrop closes through the same guard, and only on a real click on
  // it: a click outside used to drop staged changes without asking.
  const backdrop = useBackdropClose(() => closeFnRef.current());
  const godName = useStore((s) => s.agents.find((a) => a.isGod)?.name) ?? t('common.orchestrator');
  const [confirming, setConfirming] = useState(false);
  // Reset memory's own confirm (docs/designs/reset-agent-memory.md), with the
  // folders whose Claude Code notes go too.
  const [confirmingMemory, setConfirmingMemory] = useState(false);
  const [memoryFolders, setMemoryFolders] = useState<string[]>([]);
  const [memoryErr, setMemoryErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>(initialSection && VISIBLE_SECTIONS.includes(initialSection) ? initialSection : 'General');
  // The group a place asked for: switched to, scrolled into view, unfolded
  // (Mailboxes) and highlighted for 2 s, once per seq.
  const [groupFocus, setGroupFocus] = useState<{ group: PlaceGroup; add?: boolean; seq: number } | null>(null);
  useEffect(() => {
    if (!place) return;
    if (place.section && VISIBLE_SECTIONS.includes(place.section)) setActiveSection(place.section);
    setGroupFocus(place.group ? { group: place.group, add: place.add, seq: place.seq } : null);
  }, [place?.seq]);
  useEffect(() => {
    if (!groupFocus) return;
    const el = dialogRef.current?.querySelector<HTMLElement>(`[data-settings-group="${groupFocus.group}"]`);
    if (!el) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
    el.classList.remove('cth-place-highlight');
    void el.offsetWidth;
    el.classList.add('cth-place-highlight');
    const done = setTimeout(() => el.classList.remove('cth-place-highlight'), 2000);
    return () => clearTimeout(done);
  }, [groupFocus?.seq, activeSection]);

  // Change-home flow: null until the user picks a new folder, then the sub-modal
  // confirms move-vs-fresh. Pre-selects 'move' (recommended - keeps the data).
  const [changeHome, setChangeHome] = useState<string | null>(null);
  const [changeMode, setChangeMode] = useState<'move' | 'fresh'>('move');
  const [changeBusy, setChangeBusy] = useState(false);
  const [changeErr, setChangeErr] = useState('');
  // The picked folder already holds an office. Then the only offer is to OPEN
  // it: "move" would copy this office over that one (cpSync with force).
  const [changeTargetHasOffice, setChangeTargetHasOffice] = useState(false);
  // Other offices this install has used and that still exist, for one-click
  // switching. Took over from the launch picker, which no longer shows on a
  // normal launch (owner, 2026-09-24).
  const [otherOffices, setOtherOffices] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const candidates = (config.recentHives ?? []).filter((h) => h && h !== config.harnessHome);
    void Promise.all(candidates.map((h) => window.cth.homeStatus(h).then((st) => (st.hasOffice ? h : null)).catch(() => null)))
      .then((ok) => { if (alive) setOtherOffices(ok.filter((h): h is string => !!h)); });
    return () => { alive = false; };
  }, [config.recentHives, config.harnessHome]);

  // `notifications` is an optional field on the main-process config; the renderer
  // mirror type may not declare it yet, so read it defensively.
  const [notifications, setNotifications] = useState<boolean>(
    (config as HarnessConfig & { notifications?: boolean }).notifications === true
  );

  const toggleNotifications = async () => {
    const next = !notifications;
    setNotifications(next); // optimistic
    try { await window.cth.setNotifications(next); }
    catch { setNotifications(!next); /* revert on failure */ }
  };

  // ─── v0.3.4 redesign: settings that were onboarding-trapped or UI-less ────
  const cfgX = config as HarnessConfig & {
    strongKeepalive?: boolean; audience?: string; autoMode?: boolean;
    defaultModel?: string; maxTurns?: number;
  };
  /**
   * ONE SAVE BUTTON.
   *
   * Settings used to persist three different ways: toggles wrote to disk the
   * instant you clicked them, some sections had their own Save, and a couple of
   * fields saved on blur. Nothing told you which kind you were looking at, so
   * "did that stick?" had no answer you could learn once and reuse.
   *
   * Now every setting that goes through `updateConfig` is STAGED here and
   * written by the footer Save, in a single call.
   *
   * Two things stay immediate, on purpose, and they are not settings:
   *   - API keys, which go to the write-only secret broker. Nothing can read
   *     one back to diff it, so there is no staged value to hold.
   *   - Free Flow, which arms a global hotkey in main. Staging that would leave
   *     the hotkey and the checkbox disagreeing until you pressed Save.
   */
  const [pending, setPending] = useState<Partial<HarnessConfig>>({});
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  // Keep the raw profile draft across section changes. Cleaning on each key
  // would eat spaces and blank lines while the owner is still typing.
  const [companyDraft, setCompanyDraft] = useState<CompanyProfileDraft>(() => ({
    name: config.businessName ?? '', profile: cleanCompanyProfile(config.companyProfile)
  }));
  const [savedCompanyDraft, setSavedCompanyDraft] = useState(companyDraft);
  const companyProfileDirty = companyDraft !== savedCompanyDraft;
  const editCompanyProfile = (next: CompanyProfileDraft): void => {
    setCompanyDraft(next);
    setSaveNote('');
  };
  /** Staged controls and the company profile share the close guard. */
  const dirty = Object.keys(pending).length > 0 || companyProfileDirty;
  const stage = (patch: Partial<HarnessConfig>): void =>
    setPending((prev) => ({ ...prev, ...patch }));

  const [keepAwake, setKeepAwake] = useState<boolean>(cfgX.strongKeepalive === true);
  const toggleKeepAwake = async () => {
    const next = !keepAwake;
    setKeepAwake(next);
    stage({ strongKeepalive: next } as Partial<HarnessConfig>);
  };
  const [simpleMode, setSimpleMode] = useState<boolean>(cfgX.audience === 'non-technical');
  const toggleSimpleMode = async () => {
    const next = !simpleMode;
    setSimpleMode(next);
    stage({ audience: next ? 'non-technical' : 'technical' } as Partial<HarnessConfig>);
  };
  const [autoModeOn, setAutoModeOn] = useState<boolean>(cfgX.autoMode !== false);
  const toggleAutoMode = async () => {
    const next = !autoModeOn;
    setAutoModeOn(next);
    stage({ autoMode: next } as Partial<HarnessConfig>);
  };
  const [defaultModelSel, setDefaultModelSel] = useState<string>(cfgX.defaultModel ?? 'claude-fable-5');
  const saveDefaultModel = (id: string): void => {
    setDefaultModelSel(id);
    stage({ defaultModel: id } as Partial<HarnessConfig>);
  };
  const [maxTurnsVal, setMaxTurnsVal] = useState<string>(cfgX.maxTurns != null ? String(cfgX.maxTurns) : '');
  // The Claude plan's price a month, for Pulse's split by share of the work.
  // Blank uses the plan found in the owner's Claude account.
  const [planPriceVal, setPlanPriceVal] = useState<string>(cfgX.planPriceMonthly != null ? String(cfgX.planPriceMonthly) : '');
  const [detectedPlan, setDetectedPlan] = useState<{ label: string | null; listMonthly: number | null } | null>(null);
  useEffect(() => { void window.cth.claudePlan().then(setDetectedPlan).catch(() => setDetectedPlan(null)); }, []);
  const planPricePatch = (): Partial<HarnessConfig> => {
    const n = planPriceVal.trim() === '' ? undefined : Number(planPriceVal);
    return { planPriceMonthly: Number.isFinite(n as number) && (n as number) > 0 ? Math.round((n as number) * 100) / 100 : undefined } as Partial<HarnessConfig>;
  };
  const maxTurnsPatch = (): Partial<HarnessConfig> => {
    const n = maxTurnsVal.trim() === '' ? undefined : Number(maxTurnsVal);
    return { maxTurns: Number.isFinite(n as number) && (n as number) > 0 ? Math.round(n as number) : undefined } as Partial<HarnessConfig>;
  };
  // Search language + live status. Moved here from the floating "hive memory"
  // panel that sat on the office floor: nothing in it was about the floor, its
  // on/off duplicated the switch above, and searching memory is already on
  // Michael's Memory tab (owner, 2026-09-24).
  const [embeddingModel, setEmbeddingModel] = useState<'minilm' | 'embeddinggemma'>(cfgX.embeddingModel ?? 'minilm');
  const pickEmbeddingModel = (m: 'minilm' | 'embeddinggemma') => {
    setEmbeddingModel(m);
    stage({ embeddingModel: m } as Partial<HarnessConfig>);
  };
  const [memStatus, setMemStatus] = useState<{ available: boolean; enabled: boolean; initialized: boolean } | null>(null);
  useEffect(() => {
    if (activeSection !== 'Memory & Knowledge') return;
    let alive = true;
    void window.cth.memoryStatus().then((st) => { if (alive) setMemStatus(st); }).catch(() => { /* leave unknown */ });
    return () => { alive = false; };
  }, [activeSection]);

  // --- circuit-breaker config (Lane A #6 canonical fields, widened view) ---
  // Drives Jim's real breaker: floor-wide TOKEN budget (costCapTokens) + output-
  // token velocity ceiling (circuitBreaker.tokenVelocityPerMin). The token cap
  // replaced the old dollar cap as the user-facing budget.
  type BreakerCfgView = HarnessConfig & {
    costCapTokens?: number;
    circuitBreaker?: { tokenVelocityPerMin?: number; enabled?: boolean; hardStop?: boolean; repeatedToolLimit?: number; errorStormLimit?: number };
  };
  const breakerCfg = config as BreakerCfgView;
  const [agentBudget, setAgentBudget] = useState(breakerCfg.costCapTokens != null ? String(breakerCfg.costCapTokens) : '');
  const [velocityCeiling, setVelocityCeiling] = useState(breakerCfg.circuitBreaker?.tokenVelocityPerMin != null ? String(breakerCfg.circuitBreaker.tokenVelocityPerMin) : '');
  // v0.3.4: the four previously UI-less breaker fields get controls.
  const [brkEnabled, setBrkEnabled] = useState<boolean>(breakerCfg.circuitBreaker?.enabled !== false);
  const [brkHardStop, setBrkHardStop] = useState<boolean>(breakerCfg.circuitBreaker?.hardStop === true);
  const [brkRepeated, setBrkRepeated] = useState(breakerCfg.circuitBreaker?.repeatedToolLimit != null ? String(breakerCfg.circuitBreaker.repeatedToolLimit) : '');
  const [brkErrStorm, setBrkErrStorm] = useState(breakerCfg.circuitBreaker?.errorStormLimit != null ? String(breakerCfg.circuitBreaker.errorStormLimit) : '');
  const budgetPatch = (): Partial<HarnessConfig> => {
    const tokens = agentBudget.trim() === '' ? undefined : Number(agentBudget);
    const vel = velocityCeiling.trim() === '' ? undefined : Number(velocityCeiling);
    const rep = brkRepeated.trim() === '' ? undefined : Number(brkRepeated);
    const storm = brkErrStorm.trim() === '' ? undefined : Number(brkErrStorm);
    return {
      costCapTokens: Number.isFinite(tokens as number) ? (tokens as number) : undefined,
      circuitBreaker: {
        ...(breakerCfg.circuitBreaker ?? {}),
        enabled: brkEnabled,
        hardStop: brkHardStop,
        tokenVelocityPerMin: Number.isFinite(vel as number) ? (vel as number) : undefined,
        repeatedToolLimit: Number.isFinite(rep as number) ? Math.round(rep as number) : undefined,
        errorStormLimit: Number.isFinite(storm as number) ? Math.round(storm as number) : undefined
      }
    } as Partial<HarnessConfig>;
  };
  /** The one writer. Commits what the form currently shows, in a single
   *  updateConfig, so a half-applied save is not a state the app can reach. */
  const saveAll = async (): Promise<void> => {
    setSaveBusy(true); setSaveNote('');
    try {
      const patch: Partial<HarnessConfig> = {
        ...maxTurnsPatch(),
        ...planPricePatch(),
        ...budgetPatch(),
        ...pending
      };
      if (companyProfileDirty) {
        // Apply only owner edits to the latest profile: foundations may have
        // recorded other fields while Settings was open.
        const latest = cleanCompanyProfile((await window.cth.getConfig()).companyProfile);
        const clean = mergeEditedProfile(cleanCompanyProfile(savedCompanyDraft.profile), cleanCompanyProfile(companyDraft.profile), latest);
        Object.assign(patch, {
          businessName: companyDraft.name.trim() || config.businessName,
          companyProfile: clean,
          businessCity: cityLine(clean.address) ?? config.businessCity
        });
      }
      await window.cth.updateConfig(patch);
      // Mark only the submitted draft saved. An edit made while the write
      // was running must still be shown as unsaved and included next time.
      if (companyProfileDirty) setSavedCompanyDraft(companyDraft);
      setPending({});
      setSaveNote(t('settings.saved'));
      setTimeout(() => setSaveNote(''), 1800);
    } catch (e) {
      setSaveNote(e instanceof Error ? e.message : String(e));
    } finally { setSaveBusy(false); }
  };

  /** Closing with staged changes used to be impossible, because everything wrote
   *  on click. Now it is, so say so rather than dropping the edit silently. */
  const requestClose = (): void => {
    if (dirty && !window.confirm(t('settings.unsavedWarning'))) return;
    onClose();
  };
  closeFnRef.current = busy ? () => {} : requestClose;

  const fmtBudgetTokens = (raw: string): string => {
    const n = Number(raw);
    if (!raw.trim() || !Number.isFinite(n) || n <= 0) return '';
    if (n >= 1e9) return `${+(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${+(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}K`;
    return String(n);
  };

  // ─── Knowledge Graph (enterprise multimodal context for agents) ───────────
  const [kgDocCount, setKgDocCount] = useState(0);
  const [kgBusy, setKgBusy] = useState(false);
  const [kgNote, setKgNote] = useState('');

  const refreshKgStatus = async () => {
    try { const s = await window.cth.kgStatus(); setKgDocCount(s.docCount); }
    catch { /* status unavailable */ }
  };

  const addKgFiles = async () => {
    setKgBusy(true); setKgNote('');
    try {
      const res = await window.cth.kgAddFiles();
      if (!res.ok) { setKgNote(res.error === 'cancelled' ? '' : (res.error ?? 'failed')); return; }
      const added = res.results.filter((r) => r.ok).length;
      // Name each file that couldn't be read, with the reason. A bare "1 failed"
      // leaves an owner guessing which file, and why, and whether to retry.
      const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;
      // Raw system codes (ENOENT, EACCES) mean nothing to an owner; say what
      // happened instead. The reader's own reasons are already plain words.
      const plainReason = (err?: string): string => {
        const key = plainReasonKey(err);
        return key ? t(key) : (err as string);
      };
      const failures = res.results
        .filter((r) => !r.ok)
        .map((r) => t('settings.memory.couldNotRead', { file: fileName(r.srcPath), reason: plainReason(r.error) }));
      setKgNote([
        added ? t('settings.memory.docsAdded', { count: added }) : '',
        ...failures
      ].filter(Boolean).join(' · '));
      await refreshKgStatus();
    } catch (e) { setKgNote(e instanceof Error ? e.message : String(e)); }
    finally { setKgBusy(false); }
  };

  // Re-seed every editable field from the on-disk config when the modal opens.
  // App's `config` prop is loaded once and never refreshed after a save, so
  // without this the saved budget / velocity values show blank on reopen.
  useEffect(() => {
    let alive = true;
    window.cth.getConfig().then((c) => {
      if (!alive) return;
      const cc = c as BreakerCfgView;
      setNotifications(cc.notifications === true);
      setAgentBudget(cc.costCapTokens != null ? String(cc.costCapTokens) : '');
      setVelocityCeiling(cc.circuitBreaker?.tokenVelocityPerMin != null ? String(cc.circuitBreaker.tokenVelocityPerMin) : '');
    }).catch(() => { /* keep prop-seeded values */ });
    window.cth.kgStatus().then((s) => { if (alive) setKgDocCount(s.docCount); })
      .catch(() => { /* status unavailable */ });
    return () => { alive = false; };
  }, []);

  const reset = async () => {
    setBusy(true);
    clearLocalState();
    // Wipes hive + palace, resets config, and relaunches into onboarding.
    // The app exits, so this never resolves - no need to clear `busy`.
    await window.cth.resetAll();
  };

  const askResetMemory = async () => {
    setMemoryErr('');
    setMemoryFolders([]);
    setConfirmingMemory(true);
    setMemoryFolders(await window.cth.memoryResetFolders().catch(() => [] as string[]));
  };

  const resetMemory = async () => {
    setBusy(true);
    setMemoryErr('');
    // Every member forgets, then the app relaunches; the team and settings
    // stay, so local state stays too. On success this never resolves.
    try {
      const r = await window.cth.resetMemory();
      if (r?.ok) return;
    } catch { /* shown below */ }
    setBusy(false);
    setMemoryErr(t('settings.resetMemoryConfirm.failed'));
  };

  // --- Change home folder ---
  /** Pick a new folder, then open the move-vs-fresh sub-modal. */
  const pickNewHome = async () => {
    setChangeErr('');
    const res = await window.cth.chooseFolder();
    if (!res.ok) return; // cancelled - no-op
    const st = await window.cth.homeStatus(res.path).catch(() => null);
    const hasOffice = !!st?.hasOffice;
    setChangeTargetHasOffice(hasOffice);
    setChangeMode(hasOffice ? 'fresh' : 'move'); // open it, or move (recommended) into an empty one
    setChangeHome(res.path);
  };

  /** Switch to another office this install has used. A different office, so the
   *  renderer's saved state goes (its own roster comes back from its folder). */
  const openOtherOffice = async (path: string) => {
    setChangeErr('');
    const snap = snapshotLocalState();
    clearLocalState();
    const res = await window.cth.changeHome(path, 'fresh').catch((e) => ({ ok: false, error: String(e) }));
    if (!res.ok) { restoreLocalState(snap); setChangeErr(res.error ?? t('settings.changeHome.couldNotOpen')); }
  };

  /** Apply the home-folder change. On success the app relaunches (never resolves);
   *  on failure we surface the error and the existing home keeps running. */
  const applyChangeHome = async () => {
    if (!changeHome) return;
    setChangeBusy(true); setChangeErr('');
    // Moving copies the hive (incl. its .git) + palace, so the new home owns the
    // same renderer-side roster - keep localStorage. 'fresh' either starts an
    // empty office or opens one already in that folder; both bring their own
    // roster, so clear the renderer cache to match, and put it back if the
    // switch fails and this office keeps running.
    const snap = changeMode === 'fresh' ? snapshotLocalState() : null;
    if (snap) clearLocalState();
    try {
      const res = await window.cth.changeHome(changeHome, changeMode);
      if (!res.ok) { if (snap) restoreLocalState(snap); setChangeErr(res.error ?? t('settings.changeHome.couldNotChange')); setChangeBusy(false); }
      // ok === true never returns (the process relaunches).
    } catch (e) {
      if (snap) restoreLocalState(snap);
      setChangeErr(e instanceof Error ? e.message : String(e));
      setChangeBusy(false);
    }
  };

  const modalTitle = changeHome
    ? t('settings.changeHomeTitle')
    : confirmingMemory
      ? t('settings.resetMemoryTitle')
      : confirming
        ? t('settings.resetTitle')
        : t('settings.title');

  return (
    <div
      {...backdrop}
      style={{
        position: 'fixed', inset: 0,
        background: 'color-mix(in srgb, var(--cth-bg) 60%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 300
      }}
    >
      {/* Design v2 dialog (branding/DESIGN.md 7.23): a card with its title and
          close, Esc and a focus trap (useDialog). */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={modalTitle}
        tabIndex={-1}
        style={{
          width: 880, maxWidth: '92vw', maxHeight: '88vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', outline: 'none',
          background: 'var(--cth-card)', borderRadius: 'var(--cth-r-2xl)',
          boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-lg)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px 14px 22px', borderBottom: '1px solid var(--cth-line)', flexShrink: 0 }}>
          <h2 style={{ margin: 0, flex: 1, fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--cth-ink)' }}>{modalTitle}</h2>
          <button type="button" onClick={busy ? undefined : requestClose} aria-label={t('common.close')} style={{
            width: 30, height: 30, display: 'grid', placeItems: 'center', border: 'none', cursor: 'pointer', borderRadius: 'var(--cth-r-md)',
            background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2)', color: 'var(--cth-ink-2)'
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, flex: 1 }}>
          {/* === Change home sub-modal === */}
          {changeHome ? (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{t('settings.changeHome.newHome')}</span>
                <code style={{
                  fontFamily: 'var(--cth-font-mono, monospace)', fontSize: 12,
                  color: 'var(--cth-ink-900)', wordBreak: 'break-all'
                }}>{changeHome}</code>
              </div>

              {/* Move vs. fresh: two option rows with move preselected. When the
                  picked folder already holds an office, only the 'open' row shows
                  (mode 'fresh'), since a move would copy over that office. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(changeTargetHasOffice
                  ? [['fresh', t('settings.changeHome.openTitle'), t('settings.changeHome.openDesc')] as const]
                  : [
                    ['move', t('settings.changeHome.moveTitle'), t('settings.changeHome.moveDesc')] as const,
                    ['fresh', t('settings.changeHome.freshTitle'), t('settings.changeHome.freshDesc')] as const
                  ]
                ).map(([value, title, desc]) => {
                  const selected = changeMode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setChangeMode(value)}
                      disabled={changeBusy}
                      style={{
                        textAlign: 'left', cursor: changeBusy ? 'default' : 'pointer',
                        padding: '10px 12px', background: 'var(--cth-card)', border: 'none', borderRadius: 'var(--cth-r-lg)',
                        boxShadow: `inset 0 0 0 ${selected ? 2 : 1}px ${selected ? 'var(--cth-ink)' : 'var(--cth-line-2)'}`,
                        display: 'flex', flexDirection: 'column', gap: 3
                      }}
                    >
                      <span style={{
                        fontSize: 13, lineHeight: '20px',
                        color: 'var(--cth-ink-900)', fontWeight: selected ? 700 : 400
                      }}>
                        {selected ? '◉ ' : '○ '}{title}
                      </span>
                      <span style={hint}>{desc}</span>
                    </button>
                  );
                })}
              </div>

              {changeErr && (
                <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--cth-coral-text)' }}>{changeErr}</div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <PixelButton variant="secondary" size="md" onClick={() => { setChangeHome(null); setChangeErr(''); }} disabled={changeBusy}>
                  {t('common.cancel')}
                </PixelButton>
                <PixelButton variant="primary" size="md" onClick={applyChangeHome} disabled={changeBusy}>
                  {changeBusy ? t('settings.apply') : (changeMode === 'move' ? t('settings.moveAndRestart') : t('settings.switchAndRestart'))}
                </PixelButton>
              </div>
            </div>

          /* === Reset memory confirmation screen === */
          ) : confirmingMemory ? (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  borderRadius: 'var(--cth-r-md)',
                  width: 32, height: 32,
                  background: 'var(--cth-coral-light)',
                  boxShadow: 'inset 0 0 0 1.5px var(--cth-indigo)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Icon name="bell" />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15, lineHeight: '22px', color: 'var(--cth-ink-700)' }}>
                  <span>{t('settings.resetMemoryConfirm.body', { godName })}</span>
                  <span>{t('settings.resetMemoryConfirm.keeps')}</span>
                  {memoryFolders.length > 0 && (
                    <>
                      <span>{t('settings.resetMemoryConfirm.folders')}</span>
                      <ul style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {memoryFolders.map((f) => (
                          <li key={f}><code dir="ltr" style={{ fontFamily: 'var(--cth-font-mono, monospace)', fontSize: 12, wordBreak: 'break-all', color: 'var(--cth-ink-900)' }}>{f}</code></li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>

              {memoryErr && (
                <div role="alert" style={{ fontSize: 13, lineHeight: '18px', color: 'var(--cth-coral-text)' }}>{memoryErr}</div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <PixelButton variant="secondary" size="md" onClick={() => setConfirmingMemory(false)} disabled={busy}>
                  {t('common.cancel')}
                </PixelButton>
                <PixelButton variant="destructive" size="md" onClick={resetMemory} disabled={busy}>
                  {busy ? t('settings.resetting') : t('settings.resetMemoryConfirm.go')}
                </PixelButton>
              </div>
            </div>

          /* === Reset confirmation screen === */
          ) : confirming ? (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  borderRadius: 'var(--cth-r-md)',
                  width: 32, height: 32,
                  background: 'var(--cth-coral-light)',
                  boxShadow: 'inset 0 0 0 1.5px var(--cth-indigo)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Icon name="bell" />
                </div>
                <div style={{ flex: 1, fontSize: 15, lineHeight: '22px', color: 'var(--cth-ink-700)' }}>
                  {t('settings.resetConfirm.body')}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <PixelButton variant="secondary" size="md" onClick={() => setConfirming(false)} disabled={busy}>
                  {t('common.cancel')}
                </PixelButton>
                <PixelButton variant="destructive" size="md" onClick={reset} disabled={busy}>
                  {busy ? t('settings.resetting') : t('settings.eraseEverything')}
                </PixelButton>
              </div>
            </div>

          /* === Main two-pane settings layout === */
          ) : (
            <>
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

                {/* Left nav */}
                <div style={{
                  width: 190, flexShrink: 0,
                  display: 'flex', flexDirection: 'column', gap: 2,
                  borderInlineEnd: '1px solid var(--cth-line)',
                  padding: 10,
                  background: 'var(--cth-card-2)'
                }}>
                  {/* Research & privacy is in every office (owner, ship 2 D16). */}
                  {VISIBLE_SECTIONS.map((section) => {
                    const active = activeSection === section;
                    return (
                      <button
                        key={section}
                        type="button"
                        onClick={() => { setActiveSection(section); setGroupFocus(null); }}
                        aria-current={active ? 'page' : undefined}
                        style={{
                          display: 'block', width: '100%', textAlign: 'start',
                          height: 34, padding: '0 12px',
                          border: 'none', borderRadius: 'var(--cth-r-md)',
                          background: active ? 'var(--cth-ink)' : 'transparent',
                          color: active ? 'var(--cth-bg)' : 'var(--cth-ink-2)',
                          fontFamily: 'var(--cth-font-ui)',
                          fontSize: 13, fontWeight: active ? 600 : 500,
                          cursor: 'pointer'
                        }}
                      >
                        {t(NAV_SECTION_KEYS[section])}
                      </button>
                    );
                  })}
                </div>

                {/* Right scrollable content pane. minWidth:0 lets this flex child
                    shrink to the row's width instead of growing to its content's
                    min-content (which would push a horizontal scrollbar). */}
                <div style={{
                  flex: 1, minWidth: 0, overflowY: 'auto', overflowX: 'hidden',
                  padding: '20px 24px',
                  display: 'flex', flexDirection: 'column', gap: 20
                }}>

                  {/* GENERAL */}
                  {activeSection === 'General' && (
                    <>
                      {/* What this install is and whether it is current, in one
                          card: version once, the update status and its button, the
                          app level links (docs/designs/about-updates-card.md). "Am
                          I on the latest?" is the question people open Settings
                          with, and the toolbar chip says nothing when it is yes. */}
                      <SettingsHeroCard />


                      {/* Home folder */}
                      <div style={group}>
                        <h3 style={groupName}>
                          {t('settings.general.homeFolder')}
                        </h3>
                        <div style={{ display: 'flex', gap: 12, fontSize: 13, lineHeight: '20px', alignItems: 'center' }}>
                          <span style={{
                            flex: 1, color: 'var(--cth-ink-900)', wordBreak: 'break-all',
                            fontFamily: 'var(--cth-font-mono, monospace)'
                          }}>{config.harnessHome ?? '·'}</span>
                          <PixelButton variant="secondary" size="sm" onClick={pickNewHome}>{t('settings.change')}</PixelButton>
                        </div>
                        <span style={hint}>
                          {t('settings.general.homeFolderDesc')}
                        </span>
                        {otherOffices.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                            <span style={{ fontSize: 14, color: 'var(--cth-ink-700)' }}>{t('settings.general.otherOffices')}</span>
                            {otherOffices.map((h) => (
                              <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{
                                  flex: 1, minWidth: 0, fontFamily: 'var(--cth-font-mono, monospace)', fontSize: 14,
                                  color: 'var(--cth-ink-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                }}>{h}</span>
                                <PixelButton variant="secondary" size="sm" onClick={() => { void openOtherOffice(h); }}>
                                  {t('settings.general.openOffice')}
                                </PixelButton>
                              </div>
                            ))}
                          </div>
                        )}
                        {changeErr && !changeHome && (
                          <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--cth-coral-text)', marginTop: 6 }}>{changeErr}</div>
                        )}
                      </div>


                      {/* Environment — settings that used to be trapped in onboarding */}
                      <div style={group}>
                        <h3 style={groupName}>
                          {t('settings.general.environment')}
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={fieldLabel}>{t('settings.general.keepAwake')}</span>
                              <span style={hint}>
                                {t('settings.general.keepAwakeDesc')}
                              </span>
                            </div>
                            <PixelButton variant={keepAwake ? 'primary' : 'secondary'} size="sm" onClick={toggleKeepAwake}>
                              {keepAwake ? t('common.on') : t('common.off')}
                            </PixelButton>
                          </div>
                          {/* Hidden in this build (SHOW_SIMPLE_MODE_SWITCH); the saved audience still applies. */}
                          {SHOW_SIMPLE_MODE_SWITCH && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={fieldLabel}>{t('settings.general.simpleMode')}</span>
                              <span style={hint}>
                                {t('settings.general.simpleModeDesc')}
                              </span>
                            </div>
                            <PixelButton variant={simpleMode ? 'primary' : 'secondary'} size="sm" onClick={toggleSimpleMode}>
                              {simpleMode ? t('common.on') : t('common.off')}
                            </PixelButton>
                          </div>
                          )}
                        </div>
                      </div>


                      {/* Desktop notifications toggle */}
                      <div style={group}>
                        <h3 style={groupName}>
                          {t('settings.general.notifications')}
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={fieldLabel}>
                              {t('settings.general.desktopNotifications')}
                            </span>
                            <span style={hint}>
                              {t('settings.general.desktopNotificationsDesc', { godName })}
                            </span>
                          </div>
                          <PixelButton
                            variant={notifications ? 'primary' : 'secondary'}
                            size="sm"
                            onClick={toggleNotifications}
                          >
                            {notifications ? t('common.on') : t('common.off')}
                          </PixelButton>
                        </div>
                      </div>

                    </>
                  )}

                  {/* AGENTS & MODELS — what powers the office */}
                  {/* PREREQUISITES — the external tools the app leans on and
                      whether this machine has them. It was a Command Center tab,
                      which was the wrong home: it is machine-wide state, not
                      something about the agent whose terminal you are reading. */}
                  {activeSection === 'Prerequisites' && <SetupPanel onDone={onClose} />}

                  {/* AGENTS: the model, autonomy, and the limits that stop them. */}
                  {activeSection === 'Agents' && (
                    <>
                      <ClaudeSignInSettings />

                      <div style={group}>
                        <h3 style={groupName}>
                          {t('settings.agentsModels.defaultModel')}
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span style={hint}>
                            {t('settings.agentsModels.defaultModelDesc', { godName })}
                          </span>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {agentModels().map((m) => (
                              <button
                                key={m.label}
                                onClick={() => { if (m.id) void saveDefaultModel(m.id); }}
                                style={{
                                  borderRadius: 'var(--cth-r-md)',
                                  padding: '3px 8px 1px', border: 'none', cursor: 'pointer',
                                  fontFamily: 'var(--cth-font-ui)', fontSize: 12, color: 'var(--cth-ink-900)',
                                  background: defaultModelSel === m.id ? 'var(--cth-sky-light)' : 'var(--cth-cream-100)',
                                  boxShadow: defaultModelSel === m.id ? 'inset 0 0 0 1.5px var(--cth-indigo)' : 'inset 0 0 0 1px var(--cth-ink-100)'
                                }}
                              >{m.label}</button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* The Claude plan's price (owner, 2026-10-15): Pulse splits it
                          across the team by share of the work. Not on an API key. */}
                      {cfgX.claudeAuth !== 'apiKey' && (
                        <>
                          <div style={group}>
                            <h3 style={{ ...groupName, display: 'flex', gap: 6, alignItems: 'center' }}>
                              {t('settings.agentsModels.planPrice')}<InfoTip text={t('settings.agentsModels.planPriceTip')} />
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13, color: 'var(--cth-ink-900)' }}>{detectedPlan?.label ?? t('settings.agentsModels.planUnknown')}</span>
                              <span style={{ fontSize: 13, color: 'var(--cth-ink-500)' }}>$</span>
                              <input
                                type="number" min="0" step="1" value={planPriceVal}
                                aria-label={t('settings.agentsModels.planPriceAria')}
                                onChange={(e) => setPlanPriceVal(e.target.value)}
                                placeholder={detectedPlan?.listMonthly != null ? String(detectedPlan.listMonthly) : ''}
                                className="cth-input" style={{ ...fieldInputStyle, width: 100 }}
                              />
                              <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{t('settings.agentsModels.aMonth')}</span>
                            </div>
                          </div>
                        </>
                      )}


                      {/* Autonomy and budgets (was its own tab until 2026-10-01). */}
                      <div style={group}>
                        <h3 style={groupName}>
                          {t('settings.autonomy.autonomy')}
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ ...fieldLabel, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {autoModeOn ? t('settings.autonomy.autoOn') : t('settings.autonomy.autoOff')}
                            <InfoTip text={t('settings.autonomy.autoDesc')} />
                          </span>
                          <PixelButton variant={autoModeOn ? 'primary' : 'secondary'} size="sm" onClick={toggleAutoMode}>
                            {autoModeOn ? t('settings.autonomy.autonomous') : t('settings.autonomy.askFirst')}
                          </PixelButton>
                        </div>
                      </div>

                      {/* Circuit breaker — the FULL unit (v0.3.4: all fields have UI) */}
                      <div style={group}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <h3 style={{ ...groupName, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {t('settings.autonomy.breaker')}
                              <InfoTip text={t('settings.autonomy.breakerDesc')} />
                            </h3>
                            <PixelButton variant={brkEnabled ? 'primary' : 'secondary'} size="sm"
                              onClick={() => { setBrkEnabled(!brkEnabled); }}>
                              {brkEnabled ? t('common.on') : t('common.off')}
                            </PixelButton>
                          </div>
                          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...fieldLabel }}>
                              {t('settings.autonomy.floorBudget')}
                              <input
                                type="number" min="0" step="100000" value={agentBudget}
                                onChange={(e) => setAgentBudget(e.target.value)}
                                placeholder={t('settings.autonomy.budgetPlaceholder')}
                                className="cth-input" style={{ ...fieldInputStyle, width: 180 }}
                              />
                              <span style={{ fontSize: 11, color: 'var(--cth-ink-500)', textTransform: 'none', letterSpacing: 0 }}>
                                {fmtBudgetTokens(agentBudget) ? t('settings.autonomy.budgetEquals', { value: fmtBudgetTokens(agentBudget) }) : t('settings.autonomy.budgetTotal')}
                              </span>
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...fieldLabel }}>
                              {t('settings.autonomy.velocity')}
                              <input
                                type="number" min="0" step="1000" value={velocityCeiling}
                                onChange={(e) => setVelocityCeiling(e.target.value)}
                                placeholder={t('settings.autonomy.velocityPlaceholder')}
                                className="cth-input" style={{ ...fieldInputStyle, width: 180 }}
                              />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...fieldLabel }}>
                              {t('settings.autonomy.repeatedLimit')}
                              <input
                                type="number" min="0" step="5" value={brkRepeated}
                                onChange={(e) => setBrkRepeated(e.target.value)}
                                placeholder={t('settings.autonomy.defaultPlaceholder')}
                                className="cth-input" style={{ ...fieldInputStyle, width: 140 }}
                              />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...fieldLabel }}>
                              {t('settings.autonomy.errorStormLimit')}
                              <input
                                type="number" min="0" step="5" value={brkErrStorm}
                                onChange={(e) => setBrkErrStorm(e.target.value)}
                                placeholder={t('settings.autonomy.defaultPlaceholder')}
                                className="cth-input" style={{ ...fieldInputStyle, width: 140 }}
                              />
                            </label>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <span style={{ ...fieldLabel, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {t('settings.autonomy.hardStop')}
                              <InfoTip text={t('settings.autonomy.hardStopDesc')} />
                            </span>
                            <PixelButton variant={brkHardStop ? 'destructive' : 'secondary'} size="sm"
                              onClick={() => { setBrkHardStop(!brkHardStop); }}>
                              {brkHardStop ? t('settings.autonomy.killOnTrip') : t('settings.autonomy.steerFirst')}
                            </PixelButton>
                          </div>
                        </div>
                      </div>


                      {/* Advanced */}
                      <div style={group}>
                        <h3 style={groupName}>
                          {t('settings.agentsModels.advanced')}
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--cth-ink-900)' }}>
                            {t('settings.agentsModels.maxTurns')}<InfoTip text={t('settings.agentsModels.maxTurnsTip')} />
                          </span>
                          <input
                            type="number" min="1" step="10" value={maxTurnsVal}
                            onChange={(e) => setMaxTurnsVal(e.target.value)}
                            placeholder={t('settings.agentsModels.unlimited')}
                            className="cth-input" style={{ ...fieldInputStyle, width: 120 }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{t('settings.agentsModels.blankUnlimited')}</span>
                        </div>
                      </div>

                    </>
                  )}

                  {/* MEMORY & KNOWLEDGE */}
                  {/* COMPANY PROFILE: key facts every agent works from. */}
                  {activeSection === 'Company profile' && (
                    <CompanyProfileSettings
                      value={companyDraft}
                      needsIndustry={!config.businessType}
                      onChange={editCompanyProfile}
                      onOpenKnowledge={() => setActiveSection('Memory & Knowledge')}
                    />
                  )}

                  {activeSection === 'Memory & Knowledge' && (
                    <>
                      {/* Company knowledge: the documents the team searches, and searching
                          them by meaning (owner, 2026-10-19). */}
                      <div style={group}>
                        <h3 style={groupName}>
                          {t('settings.memory.kg')}
                        </h3>
                        {/* Always on (owner, 2026-10-19): no switch; members are pointed
                            at it once it holds a document. */}
                        <span style={{ ...fieldLabel, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {t('settings.memory.kgTitle')}<InfoTip text={t('settings.memory.kgDesc')} />
                        </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <PixelButton variant="secondary" size="sm" onClick={addKgFiles} disabled={kgBusy}>
                              {kgBusy ? t('settings.memory.adding') : t('settings.memory.addFiles')}
                            </PixelButton>
                            <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>
                              {kgDocCount === 1
                                ? t('settings.memory.docCount', { count: kgDocCount })
                                : t('settings.memory.docCountPlural', { count: kgDocCount })}
                            </span>
                            {kgNote && <span style={{ fontSize: 12, color: 'var(--cth-mint)' }}>{kgNote}</span>}
                          </div>
                        {/* What agents search, and Open to read or edit it (owner, 2026-10-19). */}
                        <KnowledgeDocList refreshKey={kgDocCount} />
                        {/* Search by meaning (owner, 2026-10-19): part of company knowledge,
                            which is all it ever searches; members' memory stays theirs. */}
                          <div style={{ marginTop: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                              <span style={{ ...fieldLabel, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                {t('settings.memory.meaning.title')}<InfoTip text={t('settings.memory.meaning.tip')} />
                              </span>
                              {/* No switch (owner, 2026-10-19): it runs whenever MemPalace is
                                  installed; this line says whether it is working. */}
                              {memStatus && (() => {
                                const st = !memStatus.available
                                  ? { dot: 'var(--cth-coral)', label: t('memoryPanel.notSetUp') }
                                  : memStatus.initialized
                                    ? { dot: 'var(--cth-mint)', label: t('memoryPanel.onReady') }
                                    : { dot: 'var(--cth-lemon)', label: t('memoryPanel.onGettingReady') };
                                return (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--cth-ink-900)' }}>
                                    <span style={{ borderRadius: 'var(--cth-r-md)', width: 8, height: 8, background: st.dot, boxShadow: 'inset 0 0 0 1px var(--cth-line-2)' }} />
                                    {st.label}
                                  </span>
                                );
                              })()}
                            </div>
                            {/* Not installed: send them to the setup that installs it. */}
                            {memStatus && !memStatus.available && (
                              <div style={{
                                borderRadius: 'var(--cth-r-md)',
                                marginTop: 8, fontSize: 12, color: 'var(--cth-ink-700)', lineHeight: 1.6,
                                background: 'var(--cth-cream-100)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2)', padding: 10
                              }}>
                                {t('memoryPanel.notInstalled')}
                                <div style={{ marginTop: 8 }}>
                                  <PixelButton variant="primary" size="sm" onClick={() => setActiveSection('Prerequisites')}>
                                    {t('memoryPanel.setUpInPrereqs')}
                                  </PixelButton>
                                </div>
                                <div style={{ marginTop: 8, color: 'var(--cth-ink-500)' }}>{t('memoryPanel.plainNotesStill')}</div>
                              </div>
                            )}

                            {/* Search language: a benefit framed choice, not a model codename. */}
                            {memStatus?.available && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                                <span style={{ ...fieldLabel, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{t('memoryPanel.searchLanguage')}<InfoTip text={t('settings.memory.meaning.languageTip')} /></span>
                                <div role="radiogroup" aria-label={t('memoryPanel.searchLanguage')} style={{ display: 'flex', gap: 8 }}>
                                  {([
                                    ['minilm', t('memoryPanel.modelFast'), t('memoryPanel.modelFastDetail')],
                                    ['embeddinggemma', t('memoryPanel.modelMultilingual'), t('memoryPanel.modelMultilingualDetail')]
                                  ] as const).map(([id, title, detail], i, all) => {
                                    const sel = embeddingModel === id;
                                    return (
                                      <button
                                        key={id}
                                        type="button"
                                        role="radio"
                                        aria-checked={sel}
                                        // One tab stop, the picked one; arrows move and pick (the app's option rows).
                                        tabIndex={sel ? 0 : -1}
                                        onClick={() => pickEmbeddingModel(id)}
                                        onKeyDown={(e) => {
                                          if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
                                            e.preventDefault();
                                            const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
                                            const next = all[(i + step + all.length) % all.length][0];
                                            pickEmbeddingModel(next);
                                            (e.currentTarget.parentElement?.querySelector(`[data-model="${next}"]`) as HTMLElement | null)?.focus();
                                          }
                                        }}
                                        data-model={id}
                                        className={sel ? 'cth-askme-opt is-on' : 'cth-askme-opt'}
                                        style={{ flex: 1, textAlign: 'start', border: 'none', fontFamily: 'var(--cth-font-ui)' }}
                                      >
                                        <span className="cth-askme-dot" aria-hidden="true" />
                                        <span>
                                          <span style={{ display: 'block', fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-900)' }}>{title}</span>
                                          <span style={{ display: 'block', fontSize: 11, lineHeight: '15px', color: 'var(--cth-ink-500)', marginTop: 2 }}>{detail}</span>
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                      </div>
                    </>
                  )}

                  {/* Research & privacy (docs/designs/research-agent-privacy.md, D3):
                      the one member on the internet, then what may be sent to it. */}
                  {activeSection === 'Research & privacy' && (
                    <ResearchPrivacySettings
                      config={config}
                      classes={pending.dataClasses ?? config.dataClasses}
                      onClassesChange={(next) => stage({ dataClasses: cleanDataClassOverrides(next) ?? {} } as Partial<HarnessConfig>)}
                    />
                  )}

                  {activeSection === 'Connections' && (
                    <>
                      {/* Claude connectors first (docs/designs/claude-connectors.md,
                          design D2): every connector on the owner's Claude account,
                          off until turned on here; who may use one is on each
                          agent's Access tab. QuickBooks and Gmail are rows in it. */}
                      <div data-settings-group="claude-connectors" style={{ scrollMarginTop: 8 }}>
                        <ClaudeConnectorsSettings />
                      </div>


                      {/* The mailboxes added here (docs/designs/multi-mailbox.md).
                          Hidden with SHOW_MAILBOXES. */}
                      {SHOW_MAILBOXES && (<>
                        <div data-settings-group="mailboxes" style={{ scrollMarginTop: 8 }}>
                          <MailboxesSettings focus={groupFocus?.group === 'mailboxes' ? groupFocus : undefined} />
                        </div>

                      </>)}

                      {/* Connected-services registry (generic, registry-driven). */}
                      <IntegrationsRegistry />

                    </>
                  )}

                  {/* Danger zone: loud on purpose (owner, 2026-10-02). A tinted red card
                      with a warning mark and a filled red button, the one solid
                      coral button besides Needs you (DESIGN.md 7.7). Reset still
                      asks once before it wipes anything. */}
                  {activeSection === 'General' && (
                    <div role="group" aria-labelledby="settings-danger-zone" style={{
                      flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px',
                      background: 'var(--cth-coral-soft)', borderRadius: 'var(--cth-r-xl)',
                      boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--cth-coral-base) 55%, transparent)'
                    }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1, color: 'var(--cth-coral-strong)' }}>
                        <path fill="currentColor" d="M12 2.8 1.6 20.6a1 1 0 0 0 .9 1.5h19a1 1 0 0 0 .9-1.5L12 2.8Zm-1 6.7h2v6h-2v-6Zm0 8h2v2h-2v-2Z" />
                      </svg>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div id="settings-danger-zone" style={{ fontSize: 15, lineHeight: '20px', fontWeight: 700, color: 'var(--cth-coral-text)' }}>
                          {t('settings.general.dangerZone')}
                        </div>
                        <p style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--cth-ink)' }}>
                          {t('settings.general.dangerDesc')}
                        </p>
                        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          <button type="button" onClick={() => void askResetMemory()} style={{
                            padding: '8px 16px', border: 'none', borderRadius: 'var(--cth-r-md)', cursor: 'pointer',
                            background: 'var(--cth-card)', color: 'var(--cth-coral-text)',
                            boxShadow: 'inset 0 0 0 1.5px var(--cth-coral-strong)',
                            fontFamily: 'var(--cth-font-ui)', fontSize: 13, fontWeight: 700
                          }}>
                            {t('settings.general.resetMemory')}
                          </button>
                          <button type="button" onClick={() => setConfirming(true)} style={{
                            padding: '8px 16px', border: 'none', borderRadius: 'var(--cth-r-md)', cursor: 'pointer',
                            background: 'var(--cth-coral-strong)', color: 'var(--cth-on-coral)',
                            fontFamily: 'var(--cth-font-ui)', fontSize: 13, fontWeight: 700
                          }}>
                            {t('settings.general.resetStartOver')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Footer */}
              <div style={{
                borderTop: '1px solid var(--cth-line)',
                padding: '10px 16px',
                display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
                background: 'var(--cth-cream-50)'
              }}>
                {saveNote && (
                  <span style={{ fontSize: 12, color: 'var(--cth-mint)' }}>{saveNote}</span>
                )}
                {dirty && !saveNote && (
                  <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{t('settings.unsavedChanges')}</span>
                )}
                <PixelButton variant="secondary" size="md" onClick={requestClose}>{t('settings.close')}</PixelButton>
                <PixelButton variant="primary" size="md" onClick={() => void saveAll()} disabled={saveBusy}>
                  {saveBusy ? t('settings.saving') : t('common.save')}
                </PixelButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
