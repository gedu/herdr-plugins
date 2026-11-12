// Productive REST API (https://developer.productive.io): JSON:API with a personal token.
const BASE = 'https://api.productive.io/api/v2';

export function productive({ token, organizationId }) {
  async function call(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'X-Auth-Token': token, 'X-Organization-Id': String(organizationId), 'Content-Type': 'application/vnd.api+json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* error pages are not JSON */ }
    if (!res.ok) {
      const e = json?.errors?.[0];
      throw new Error(`Productive ${res.status}: ${e?.detail || e?.title || text.slice(0, 160) || res.statusText}`);
    }
    return json;
  }

  return {
    async personId(email) {
      const json = await call('GET', `/people?filter[email]=${encodeURIComponent(email)}`);
      const id = json?.data?.[0]?.id;
      if (!id) throw new Error(`No Productive person with email ${email}`);
      return id;
    },

    // Entries dated from..to (inclusive). The API's after/before bounds are widened by a day
    // and the dates re-checked here, so their inclusiveness does not matter.
    async entries(personId, from, to) {
      const shift = (iso, days) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
      const out = [];
      for (let page = 1; page <= 10; page++) {
        const q = `filter[person_id]=${personId}&filter[after]=${shift(from, -1)}&filter[before]=${shift(to, 1)}&include=service&page[size]=200&page[number]=${page}`;
        const json = await call('GET', `/time_entries?${q}`);
        const services = new Map((json?.included ?? []).filter((i) => i.type === 'services').map((s) => [s.id, s.attributes?.name]));
        for (const e of json?.data ?? []) {
          const serviceId = e.relationships?.service?.data?.id;
          out.push({ id: e.id, date: e.attributes?.date, minutes: e.attributes?.time, note: e.attributes?.note, serviceId, serviceName: services.get(serviceId) });
        }
        if ((json?.data ?? []).length < 200) break;
      }
      return out.filter((e) => e.date >= from && e.date <= to).sort((a, b) => a.date.localeCompare(b.date));
    },

    async create({ personId, serviceId, date, minutes, note }) {
      const json = await call('POST', '/time_entries', {
        data: {
          type: 'time_entries',
          attributes: { date, time: minutes, note },
          relationships: { person: { data: { type: 'people', id: String(personId) } }, service: { data: { type: 'services', id: String(serviceId) } } },
        },
      });
      return json?.data?.id;
    },
  };
}
