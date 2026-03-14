#!/usr/bin/env node
/**
 * Add DNS record for decap.rudrakshbhandari.com (Worker custom domain).
 * Requires CLOUDFLARE_API_TOKEN with Zone:DNS Edit permission.
 *
 * Usage: CLOUDFLARE_API_TOKEN=xxx node scripts/add-decap-dns.mjs
 */

const ZONE_NAME = 'rudrakshbhandari.com';
const RECORD_NAME = 'decap';
const RECORD_TARGET = 'rudrakshbhandari.com'; // CNAME to zone apex routes through CF

async function main() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    console.error('Error: CLOUDFLARE_API_TOKEN is required.');
    console.error('Create one at: https://dash.cloudflare.com/profile/api-tokens');
    console.error('Use template "Edit zone DNS" with Zone:DNS:Edit for rudrakshbhandari.com');
    process.exit(1);
  }

  const base = 'https://api.cloudflare.com/client/v4';

  // Get zone ID
  const zoneRes = await fetch(`${base}/zones?name=${ZONE_NAME}`, { headers: { Authorization: `Bearer ${token}` } });
  const zoneData = await zoneRes.json();
  if (!zoneData.success || !zoneData.result?.length) {
    console.error('Error: Zone not found or no API access:', zoneData.errors?.[0]?.message || zoneData);
    process.exit(1);
  }
  const zoneId = zoneData.result[0].id;
  console.log(`Zone ${ZONE_NAME}: ${zoneId}`);

  // Check existing record
  const listRes = await fetch(`${base}/zones/${zoneId}/dns_records?name=${RECORD_NAME}.${ZONE_NAME}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listData = await listRes.json();
  if (listData.result?.length > 0) {
    console.log(`DNS record already exists: ${RECORD_NAME}.${ZONE_NAME} -> ${listData.result[0].content}`);
    return;
  }

  // Create CNAME record (proxied so traffic goes through Cloudflare → Worker route)
  const createRes = await fetch(`${base}/zones/${zoneId}/dns_records`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'CNAME',
      name: RECORD_NAME,
      content: RECORD_TARGET,
      ttl: 1, // automatic
      proxied: true,
    }),
  });
  const createData = await createRes.json();

  if (!createData.success) {
    console.error('Error creating record:', createData.errors?.[0]?.message || createData);
    process.exit(1);
  }

  console.log(`Created: ${RECORD_NAME}.${ZONE_NAME} -> ${RECORD_TARGET} (proxied)`);
  console.log('Wait 1-2 minutes for DNS propagation, then try https://rudrakshbhandari.com/notes-admin/');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
