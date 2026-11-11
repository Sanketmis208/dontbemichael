import { useTranslation } from 'react-i18next';
import { type SidebarTab } from '@/store/store';
import { type AccentColorName } from '@/design/tokens';
import { type IconName } from './Icon';
import { PanelTabs } from '@/shell/PanelChrome';

const TABS: { key: SidebarTab; labelKey: string; icon: IconName }[] = [
  // Owner-facing tabs first; the technical one (terminal) last
  // (owner, 2026-09-25).
  // Who this agent is: job, what to send them, key facts (docs/designs/agent-profile.md).
  { key: 'profile',  labelKey: 'sidebar.profile',  icon: 'info' },
  // What this agent may do without asking (email) and its jobs on a clock
  // (docs/designs/multi-mailbox.md; schedules merged in, owner 2026-09-26).
  { key: 'capabilities', labelKey: 'sidebar.capabilities', icon: 'gear' },
  { key: 'messages', labelKey: 'sidebar.messages', icon: 'bell' },
  // What the agent has learned, as notes (docs/designs/memory-tab-readable.md).
  { key: 'memory',    labelKey: 'sidebar.memory',    icon: 'ledger' },
  { key: 'terminal', labelKey: 'sidebar.terminal', icon: 'terminal' }
];

export interface SidebarTabsProps {
  current: SidebarTab;
  accent: AccentColorName;
  onChange: (tab: SidebarTab) => void;
}

export function SidebarTabs({ current, onChange }: SidebarTabsProps) {
  const { t } = useTranslation();
  // Design v2 underline tabs (branding/DESIGN.md 7.11): Profile, Access,
  // Messages, Memory, Work.
  return <PanelTabs tabs={TABS.map((tab) => ({ key: tab.key, label: t(tab.labelKey) }))} current={current} onChange={onChange} />;
}
