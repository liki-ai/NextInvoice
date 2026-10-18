import { isSampleCompanyValue } from '../storage/companySamples';

// The company profile counts as filled in once it has a real name; a fresh install only has samples.
export function profileIsCustom(profile) {
  return !isSampleCompanyValue('companyName', profile?.companyName);
}

/**
 * What happens to the data on this phone when someone signs in. The server is where data lives;
 * the phone keeps a copy, and may hold changes the server has not confirmed yet.
 *
 *  'keep'    – the same account as before: the copy is already this account's, and its waiting
 *              changes go up with the next sync.
 *  'replace' – show the account's data from the server. Signing in to an account that already
 *              exists never brings the phone's own invoices along: those were tries, and the
 *              account is what was built on the web.
 *  'ask'     – a new account on a phone that was used before signing up: whether what was made
 *              there joins the account or was only a test is the owner's call.
 */
export function signInPlan({ migratedUserId, nextUserId, hasLocalData, isNewAccount }) {
  if (migratedUserId && migratedUserId === nextUserId) return 'keep';
  if (isNewAccount && hasLocalData) return 'ask';
  return 'replace';
}

/**
 * Whether the phone's company profile should be sent along with an upload. A profile already
 * filled in on the server (from the web, say) always wins over what a phone happens to hold.
 */
export function shouldUploadProfile(localProfile, serverProfile) {
  return profileIsCustom(localProfile) && !profileIsCustom(serverProfile);
}
