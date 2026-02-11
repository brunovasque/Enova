const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;
const WORKER_BASE_URL = process.env.WORKER_BASE_URL!;
const ENOVA_ADMIN_KEY = process.env.ENOVA_ADMIN_KEY!;

function sbHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
    'Content-Type': 'application/json'
  };
}

export async function sb(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      ...sbHeaders(),
      ...(init?.headers || {})
    },
    cache: 'no-store'
  });
  if (!res.ok) {
    throw new Error(`Supabase error: ${res.status} ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function callAdmin(path: string, body: unknown) {
  const res = await fetch(`${WORKER_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-enova-admin-key': ENOVA_ADMIN_KEY
    },
    body: JSON.stringify(body),
    cache: 'no-store'
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(JSON.stringify(json));
  }
  return json;
}
