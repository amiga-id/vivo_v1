import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { Conf, FieldKey, Fields } from './types';

export interface Extraction {
  f: Fields;
  conf: Conf;
  mode: 'bedrock' | 'simulasi';
}

const KEYS: FieldKey[] = ['no', 'tgl', 'vendor', 'npwp', 'dpp', 'ppn', 'total', 'rek'];

const PROMPT = `Ekstrak data dari invoice PDF terlampir. Balas HANYA dengan satu objek JSON, tanpa penjelasan, dengan bentuk:
{
  "no": "nomor invoice",
  "tgl": "tanggal invoice format YYYY-MM-DD",
  "vendor": "nama penerbit invoice",
  "npwp": "NPWP vendor format 99.999.999.9-999.999",
  "dpp": angka rupiah tanpa titik atau koma,
  "ppn": angka rupiah tanpa titik atau koma,
  "total": angka rupiah tanpa titik atau koma,
  "rek": "bank dan nomor rekening tujuan",
  "confidence": { "no": 0-1, "tgl": 0-1, "vendor": 0-1, "npwp": 0-1, "dpp": 0-1, "ppn": 0-1, "total": 0-1, "rek": 0-1 }
}
Jika sebuah field tidak terbaca, isi string kosong atau 0 dan beri confidence 0. Jangan menebak.`;

const num = (v: unknown): number => {
  const d = String(v ?? '').replace(/\D/g, '');
  return d === '' ? 0 : Number(d);
};
const clamp = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
};

function simulate(bytes: Buffer, klien: string): Extraction {
  const dpp = 5_000_000 + (bytes.length % 50) * 100_000;
  const ppn = Math.round(dpp * 0.11);
  return {
    mode: 'simulasi',
    f: {
      no: `INV-${7000 + (bytes.length % 900)}`,
      tgl: new Date().toISOString().slice(0, 10),
      vendor: `${klien} (vendor)`,
      npwp: '06.789.012.3-456.000',
      dpp, ppn, total: dpp + ppn,
      rek: 'BCA 1122334455',
    },
    conf: { no: 0.97, tgl: 0.96, vendor: 0.94, npwp: 0.92, dpp: 0.95, ppn: 0.93, total: 0.96, rek: 0.9 },
  };
}

let client: BedrockRuntimeClient | null = null;
const getClient = () =>
  (client ??= new BedrockRuntimeClient({ region: process.env.BEDROCK_REGION || process.env.AWS_REGION || 'ap-southeast-1' }));

/**
 * Ekstraksi invoice. Memakai Amazon Bedrock (Converse API, input dokumen PDF) jika BEDROCK_MODEL_ID diisi,
 * selain itu memakai ekstraksi simulasi supaya aplikasi bisa jalan lokal tanpa kredensial AWS.
 */
export async function extractInvoice(bytes: Buffer, klien: string): Promise<Extraction> {
  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId) return simulate(bytes, klien);

  const out = await getClient().send(
    new ConverseCommand({
      modelId,
      system: [{ text: 'Anda adalah mesin ekstraksi invoice untuk back office di Indonesia. Patuhi format keluaran persis.' }],
      messages: [
        {
          role: 'user',
          content: [
            { document: { format: 'pdf', name: 'invoice', source: { bytes: new Uint8Array(bytes) } } },
            { text: PROMPT },
          ],
        },
      ],
      inferenceConfig: { maxTokens: 1024, temperature: 0 },
    }),
  );

  const blocks = out.output?.message?.content ?? [];
  const text = blocks.map((b: { text?: string }) => b.text ?? '').join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Jawaban model bukan JSON.');
  const j = JSON.parse(m[0]) as Record<string, unknown> & { confidence?: Record<string, unknown> };

  const f: Fields = {
    no: String(j.no ?? '').trim(),
    tgl: String(j.tgl ?? '').trim(),
    vendor: String(j.vendor ?? '').trim(),
    npwp: String(j.npwp ?? '').trim(),
    dpp: num(j.dpp),
    ppn: num(j.ppn),
    total: num(j.total),
    rek: String(j.rek ?? '').trim(),
  };
  const conf = {} as Conf;
  for (const k of KEYS) conf[k] = clamp(j.confidence?.[k] ?? 0.5);
  return { f, conf, mode: 'bedrock' };
}
