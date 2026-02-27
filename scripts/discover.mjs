import { readFileSync, existsSync } from 'fs';
import https from 'https';

const TOKEN = existsSync('.oura_token') ? readFileSync('.oura_token', 'utf-8').trim() : '';
const CID = process.env.OURA_CLIENT_ID;
const SEC = process.env.OURA_CLIENT_SECRET;

function req(url, opts = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: opts.method || 'GET',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', ...opts.headers },
      },
      res => {
        let d = '';
        res.on('data', c => (d += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

async function main() {
  const auth = await req(
    'https://api.ouraring.com/oauth/token',
    { method: 'POST' },
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CID,
      client_secret: SEC,
      refresh_token: TOKEN,
    }).toString()
  );
  const tok = auth.access_token;
  console.log('Connected\n');

  const yest = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const endpoints = ['daily_sleep', 'daily_readiness', 'daily_activity', 'heartrate', 'sleep', 'spo2', 'workout'];

  for (const ep of endpoints) {
    console.log(ep + ':');
    try {
      const url = 'https://api.ouraring.com/v2/usercollection/' + ep + '?start_date=' + yest + '&end_date=' + yest;
      const data = await req(url, { headers: { Authorization: 'Bearer ' + tok } });
      if (data.data && data.data[0]) {
        console.log('  Fields:', Object.keys(data.data[0]).join(', '));
      } else {
        console.log('  No data');
      }
    } catch (e) {
      console.log('  Error:', e.message);
    }
    console.log('');
  }
}

main();
