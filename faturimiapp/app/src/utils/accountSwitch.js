import { isSampleCompanyValue } from '../storage/companySamples';

// The company profile counts as filled in once it has a real name; a fresh install only has samples.
export function profileIsCustom(profile) {
  return !isSampleCompanyValue('companyName', profile?.companyName);
}

/**
 * What happens to the data on this phone when someone signs in. The server is where data lives;
 * the phone keeps a copy, and may hold changes the server has not confirmed yet.
 *
 *  'keep'    – the same account as before: the copy is already this account's.
 *  'replace' – show the account's data from the server (nothing local needs saving).
 *  'upload'  – first sign-in on a phone that was used without an account: its data joins the account.
 *  'ask'     – a different account while the phone holds changes the server never took. Uploading
 *              them or dropping them is the owner's call, never a silent one.
 */
export function signInPlan({ migratedUserId, nextUserId, hasLocalData, hasUnsyncedChanges }) {
  if (migratedUserId && migratedUserId === nextUserId) return 'keep';
  if (!hasLocalData) return 'replace';
  if (!migratedUserId) return 'upload';
  return hasUnsyncedChanges ? 'ask' : 'replace';
}

/**
 * Whether the phone's company profile should be sent along with an upload. A profile already
 * filled in on the server (from the web, say) always wins over what a phone happens to hold.
 */
export function shouldUploadProfile(localProfile, serverProfile) {
  return profileIsCustom(localProfile) && !profileIsCustom(serverProfile);
}
