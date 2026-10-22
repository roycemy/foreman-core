// Vercel Routing Middleware: serve invite links through the server-rendered invite page so link previews
// (iMessage, Mac Messages, WhatsApp) see per-invite og: tags. Only /i.html and /i with a well-formed code are touched;
// everything else, and any invite without a valid code, falls through to the static public/i.html.
export const config = { matcher: ['/i.html', '/i'] };
export default function middleware(request) {
  const url = new URL(request.url), code = url.searchParams.get('code');
  if (!/^[a-f0-9]{32}$/.test(code || '')) return;
  return new Response(null, { headers: { 'x-middleware-rewrite': new URL('/api/invite-page/' + code, url).toString() } });
}
