/**
 * Admin-only testing utilities.
 * Allows removing a user's access records so you can test the subscribe,
 * restore-by-email, and cancel-subscription flows from scratch.
 *
 * All actions require a valid X-Admin-Token header.
 *
 * POST /.netlify/functions/adminTestUtils
 * Body: { action: 'removeUser', email: 'user@example.com' }
 *   → Deletes entitlements + subscription records for that email.
 *
 * Body: { action: 'listUser', email: 'user@example.com' }
 *   → Returns the entitlement and subscription records for that email (read-only).
 */
const { json } = require('./lib/http');
const { isAdmin } = require('./lib/auth');
const { getCollections } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed' });
  if (!isAdmin(event)) return json(401, { message: 'Unauthorized' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_) {
    return json(400, { message: 'Invalid JSON' });
  }

  const { action, email } = body;
  const normalizedEmail = (email || '').trim().toLowerCase();

  if (!action) return json(400, { message: 'action is required' });
  if (!normalizedEmail) return json(400, { message: 'email is required' });

  const { entitlements, subscriptions } = await getCollections();

  if (action === 'listUser') {
    const [entitlementDocs, subscriptionDocs] = await Promise.all([
      entitlements.find({ 'listener.email': normalizedEmail }).toArray(),
      subscriptions.find({ email: normalizedEmail }).toArray(),
    ]);
    return json(200, { email: normalizedEmail, entitlements: entitlementDocs, subscriptions: subscriptionDocs });
  }

  if (action === 'removeUser') {
    const [entResult, subResult] = await Promise.all([
      entitlements.deleteMany({ 'listener.email': normalizedEmail }),
      subscriptions.deleteMany({ email: normalizedEmail }),
    ]);
    return json(200, {
      message: `Removed all records for ${normalizedEmail}`,
      entitlementsDeleted: entResult.deletedCount,
      subscriptionsDeleted: subResult.deletedCount,
    });
  }

  return json(400, { message: `Unknown action: ${action}. Supported: removeUser, listUser` });
};
