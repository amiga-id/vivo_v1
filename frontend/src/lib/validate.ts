import { FIELDS } from './constants';
import { rp } from './format';
import type { Conf, Fields, Validation } from './types';

/** Aturan bisnis yang dipakai Robot Admin dan ditampilkan ke Finance Reviewer. */
export function validate(f: Fields, conf: Conf): Validation {
  const r = {} as Validation;
  for (const x of FIELDS) {
    const k = x.k;
    r[k] = { s: 'ok', m: 'Sesuai aturan' };
    if (conf[k] < 0.85) {
      r[k] = { s: 'warn', m: `Keyakinan ekstraksi rendah (${Math.round(conf[k] * 100)}%). Cek dengan dokumen asli.` };
    }
    const v: string | number = f[k];
    if (v === '' || v === 0 || Number.isNaN(v)) r[k] = { s: 'err', m: 'Wajib diisi' };
  }
  if (!/^\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}$/.test(String(f.npwp))) {
    r.npwp = { s: 'err', m: 'Format NPWP tidak valid' };
  }
  if (Math.round(f.dpp * 0.11) !== f.ppn) {
    r.ppn = { s: 'warn', m: `Tidak sama dengan 11% dari DPP (${rp(Math.round(f.dpp * 0.11))})` };
  }
  const sum = f.dpp + f.ppn;
  if (sum !== f.total) {
    r.total = { s: 'err', m: `Total tidak sama dengan DPP + PPN. Selisih ${rp(Math.abs(f.total - sum))}.` };
  }
  return r;
}

export function tally(v: Validation): { ok: number; warn: number; err: number } {
  const o = { ok: 0, warn: 0, err: 0 };
  for (const k of Object.keys(v) as (keyof Validation)[]) o[v[k].s]++;
  return o;
}
