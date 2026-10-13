import { Forbidden, Rule } from '@/lib/rbac';
import { fileFor } from '@/lib/services';
import { getUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** PDF asli hanya untuk peran dan cakupan yang berhak (dicek ulang di server). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const u = await getUser();
  if (!u) return new Response('Belum masuk', { status: 401 });
  try {
    const f = fileFor(u, params.id);
    return new Response(new Uint8Array(f.bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${encodeURIComponent(f.name)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    if (e instanceof Forbidden) return new Response(e.message, { status: 403 });
    if (e instanceof Rule) return new Response(e.message, { status: 404 });
    return new Response('Kesalahan server', { status: 500 });
  }
}
