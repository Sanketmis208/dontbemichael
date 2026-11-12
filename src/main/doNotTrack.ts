/**
 * The DO_NOT_TRACK env convention: any value except '' and '0' means the user
 * asked not to be tracked. Automatic failure reports (failureReport.ts) send
 * nothing while it is set. Checked at every call, so it can't be raced.
 */
export function dntSet(): boolean {
  const v = process.env.DO_NOT_TRACK;
  return v !== undefined && v !== '' && v !== '0';
}
