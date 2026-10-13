const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const WIB = 7 * 3600 * 1000;

export const rp = (n: number | string): string => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

export const dstr = (iso: string): string => {
  const p = iso.split('-');
  return `${+p[2]} ${MON[+p[1] - 1]} ${p[0]}`;
};

export const todayISO = (): string => new Date(Date.now() + WIB).toISOString().slice(0, 10);

export const addDays = (iso: string, n: number): string =>
  new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);

export const dayDiff = (iso: string): number =>
  Math.round((Date.parse(iso) - Date.parse(todayISO())) / 864e5);

/** Waktu sekarang dalam WIB, contoh "13 Okt 2026, 14:30". */
export const stamp = (): string => {
  const p = new Date(Date.now() + WIB).toISOString();
  return `${+p.slice(8, 10)} ${MON[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}, ${p.slice(11, 16)}`;
};

/** Waktu n hari lalu pada jam tertentu, untuk data contoh. */
export const stampAt = (daysAgo: number, hhmm: string): string => {
  const p = addDays(todayISO(), -daysAgo);
  return `${+p.slice(8, 10)} ${MON[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}, ${hhmm}`;
};
