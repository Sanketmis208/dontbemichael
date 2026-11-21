/**
 * Moving the whole inbox at once (owner, 2026-11-20). Michael moved every
 * file in his inbox to .done with one wildcard after reading a few, and the
 * messages that had arrived meanwhile went with them unread; twice that held
 * closing time, as confirmations and the app's own note were filed unseen. His
 * instructions say to move each message by name, and he kept the old habit,
 * so the app refuses the command itself. Reading with a wildcard is fine;
 * moving with one is not. Pure, so it tests as a module.
 */

/** An inbox path with a wildcard in it: agents/god/inbox/*.json, inbox/2026*. */
const INBOX_GLOB = /inbox\/[^\s'";|&<>]*[*?[]/;

export const INBOX_SWEEP_REASON =
  'Not run: move each message you read by its own file name, one mv per file (mv inbox/<its name>.json inbox/.done/). ' +
  'A wildcard also files messages that arrived while you worked, unread, and you are not told of them again.';

/** True when the command moves inbox files picked by a wildcard. */
export function sweepsInbox(command: string): boolean {
  if (typeof command !== 'string' || !/\bmv\b/.test(command) || !/inbox\//.test(command)) return false;
  // mv itself given a wildcard inbox path, in any simple command.
  for (const seg of command.split(/;|&&|\|\||\||\n/)) {
    const words = seg.trim().replace(/^(sudo|command|builtin)\s+/, '');
    if (/^mv\b/.test(words) && INBOX_GLOB.test(words)) return true;
  }
  // A loop over a wildcard inbox path that moves what it loops over.
  for (const m of command.matchAll(/for\s+(\w+)\s+in\s+([^;\n]*)[;\n]\s*do\b([\s\S]*?)\bdone\b/g)) {
    if (INBOX_GLOB.test(m[2]) && new RegExp(`\\bmv\\b[^;\\n]*\\$\\{?${m[1]}\\b`).test(m[3])) return true;
  }
  // find or a listing piped to xargs, moving each hit.
  if (INBOX_GLOB.test(command) && /(-exec(dir)?\s+mv\b|xargs\s+(-\S+\s+)*mv\b)/.test(command)) return true;
  if (/\bfind\s+\S*inbox\/?\s/.test(command) && /-exec(dir)?\s+mv\b/.test(command)) return true;
  return false;
}
