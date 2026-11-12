// Publishing one day: re-check right before creating, so a day logged elsewhere
// (the web app, another popup) since the popup opened is never posted twice.
import { noteFromBullets } from './day.js';

export const MINUTES = 480;

export async function publishDay({ api, personId, serviceId, date, bullets }) {
  if (!bullets.length) throw new Error('The note is empty; press e to write it');
  const existing = await api.entries(personId, date, date);
  if (existing.length) throw new Error(`${date} already has an entry; nothing sent`);
  return api.create({ personId, serviceId, date, minutes: MINUTES, note: noteFromBullets(bullets) });
}
