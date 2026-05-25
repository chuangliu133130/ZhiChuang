// Pages Function: GET /api/health
export async function onRequest(context) {
  return new Response(JSON.stringify({
    status: 'ok',
    service: '智创科技 AI客服',
    timestamp: new Date().toISOString(),
  }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
