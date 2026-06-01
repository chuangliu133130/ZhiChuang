// Minimal test: GET /api/hello → "ok" to verify Functions are enabled
export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, msg: 'Pages Functions are working!' }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
