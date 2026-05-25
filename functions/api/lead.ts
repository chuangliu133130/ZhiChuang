// Pages Function: POST /api/lead
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const body = await request.json();
    const { name, phone, need } = body;

    if (!name || !phone) {
      return new Response(JSON.stringify({ error: '姓名和手机号为必填项' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const leadId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();
    const timestampCN = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    const leadData = {
      id: leadId,
      name: name.trim(),
      phone: phone.trim().replace(/\s/g, ''),
      need: need || '',
      source: 'AI客服',
      created_at: timestamp,
      created_at_cn: timestampCN,
    };

    await env.ZC_LEADS.put(leadId, JSON.stringify(leadData));

    return new Response(JSON.stringify({
      success: true,
      message: `感谢 ${name}！刘朝阳技术负责人会尽快联系您。`,
      lead: { id: leadId, name: name },
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    console.error('Lead Save Error:', err);
    return new Response(JSON.stringify({ error: '保存失败', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
