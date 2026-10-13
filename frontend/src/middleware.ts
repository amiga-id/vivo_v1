import { jwtVerify } from 'jose';
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, secretKey } from '@/lib/authkey';

/**
 * Lapis pertama: wajib punya sesi yang sah. Pemeriksaan PERAN dan CAKUPAN DATA dilakukan di layout
 * tiap peran (requireUser) dan di lapisan layanan, memakai data terbaru, bukan isi token.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/' || pathname === '/login' || pathname.startsWith('/api/health')) return NextResponse.next();
  const token = req.cookies.get(COOKIE)?.value;
  if (token) {
    try {
      await jwtVerify(token, secretKey());
      return NextResponse.next();
    } catch {
      /* sesi tidak sah, jatuh ke pengalihan */
    }
  }
  const url = req.nextUrl.clone();
  url.pathname = '/';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
