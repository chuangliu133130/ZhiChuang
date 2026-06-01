// _worker.js — 智创科技 Pages 统一 API 路由
// 处理所有 /api/* 请求，其他请求交给静态资源

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function handleChat(env, request) {
  if (!env.AI) {
    return json({ reply: '', fallback: true, reason: 'AI binding not configured' });
  }

  try {
    const body = await request.json();
    const messages = body.messages;

    if (!messages || !Array.isArray(messages)) {
      return json({ error: 'Invalid messages format' }, 400);
    }

    const SYSTEM_PROMPT = `你是"智创科技"的AI智能客服，名字叫"小智"。你代表公司热情、专业地与潜在客户沟通。

【公司背景】
智创科技是一支全栈技术团队，承接：网页设计开发、微信小程序、iOS/Android App、Java企业级后端、人工智能研发、技术架构咨询。技术负责人是刘朝阳，电话13161505904。

【你的任务】
1. 友好问候，了解客户的需求
2. 根据客户描述推荐匹配的服务
3. 在对话中自然地收集客户的【姓名】和【手机号码】
4. 收集到联系方式后，告诉客户"刘朝阳技术负责人"会尽快联系他们

【对话规则】
- 语气热情但专业，不要太啰嗦
- 每次回复控制在2-4句话内
- 如果客户问你不知道的技术细节，说"这部分细节刘朝阳可以详细为您解答"
- 回复时不要在末尾加多余的寒暄
- 一定要在对话中找合适时机询问姓名和电话

【重要】客户提供了姓名和手机号，回复末尾加：[LEAD_COLLECTED:姓名=客户名字:电话=手机号]`;

    const aiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const MODEL = '@cf/meta/llama-3.2-3b-instruct';
    const aiResponse = await env.AI.run(MODEL, {
      messages: aiMessages,
      max_tokens: 512,
      temperature: 0.7,
    });

    let aiText = '';
    if (typeof aiResponse === 'string') {
      aiText = aiResponse;
    } else if (aiResponse?.response) {
      aiText = aiResponse.response;
    } else if (aiResponse?.choices?.[0]?.message?.content) {
      aiText = aiResponse.choices[0].message.content;
    } else if (aiResponse?.result?.response) {
      aiText = aiResponse.result.response;
    }

    console.log('AI text length:', aiText?.length || 0);

    if (!aiText || aiText.trim().length < 2) {
      aiText = '抱歉，我暂时无法回复，请直接拨打 13161505904 联系刘朝阳。';
    }

    return json({ reply: aiText });

  } catch (err) {
    console.error('AI Chat Error:', err);
    return json({ reply: '', fallback: true, reason: 'AI error: ' + err.message }, 500);
  }
}

async function handleLead(env, request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  try {
    const body = await request.json();
    const { name, phone, need } = body;
    if (!name || !phone) {
      return json({ error: '姓名和手机号为必填项' }, 400);
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
    return json({
      success: true,
      message: `感谢 ${name}！刘朝阳技术负责人会尽快联系您。`,
      lead: { id: leadId, name },
    });
  } catch (err) {
    return json({ error: '保存失败', detail: err.message }, 500);
  }
}

async function handleLeads(env) {
  const list = await env.ZC_LEADS.list();
  const leads = [];
  for (const k of list.keys) {
    const data = await env.ZC_LEADS.get(k.name);
    if (data) leads.push(JSON.parse(data));
  }
  leads.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return json({ leads, total: leads.length });
}

async function handleNotify(env, request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  const { name, phone, need, timestamp } = await request.json();
  if (!name || !phone) {
    return json({ success: false, error: 'missing name or phone' }, 400);
  }
  const ts = timestamp || new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const htmlBody = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,sans-serif;background:#0a0f1a;padding:20px;color:#e8edf5;">
<div style="max-width:520px;margin:0 auto;background:linear-gradient(135deg,#0f1420,#151b2c);border:1px solid rgba(0,198,255,0.2);border-radius:16px;">
<div style="background:linear-gradient(135deg,#00c6ff,#007a9e);padding:28px 24px;text-align:center;">
<div style="font-size:1.5rem;font-weight:900;color:#000;">新客户咨询</div>
<div style="font-size:0.85rem;color:rgba(0,0,0,0.7);margin-top:6px;">智创科技 · AI智能客服</div></div>
<div style="padding:28px 24px;">
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:14px 16px;background:rgba(0,198,255,0.04);border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.85rem;color:#8b95a5;width:60px;">姓名</td><td style="padding:14px 16px;background:rgba(0,198,255,0.04);border-bottom:1px solid rgba(255,255,255,0.05);font-weight:700;color:#00c6ff;">${name}</td></tr>
<tr><td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.85rem;color:#8b95a5;">手机</td><td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.05);font-weight:700;color:#e8edf5;"><a href="tel:${phone}" style="color:#00e5ff;text-decoration:none;">${phone}</a></td></tr>
<tr><td style="padding:14px 16px;background:rgba(0,198,255,0.04);border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.85rem;color:#8b95a5;">时间</td><td style="padding:14px 16px;background:rgba(0,198,255,0.04);border-bottom:1px solid rgba(255,255,255,0.05);color:#e8edf5;">${ts}</td></tr>
<tr><td style="padding:14px 16px;font-size:0.85rem;color:#8b95a5;vertical-align:top;">需求</td><td style="padding:14px 16px;color:#e8edf5;line-height:1.7;">${need || '未填写'}</td></tr>
</table></div>
<div style="padding:20px 24px;text-align:center;background:rgba(0,198,255,0.03);border-top:1px solid rgba(255,255,255,0.05);">
<div style="font-size:0.8rem;color:#5a6475;">来源：智创科技官网</div></div></div></body></html>`;
  const plainBody = `[新客户咨询] 智创科技\n\n姓名：${name}\n手机：${phone}\n时间：${ts}\n需求：${need || '未填写'}\n`;

  try {
    const mcResp = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: 'chaoyang126126@126.com', name: '刘朝阳' }] }],
        from: { email: 'noreply@zhi-chuang-tech.pages.dev', name: '智创科技AI客服' },
        subject: `[新线索] ${name} - ${phone} - ${need ? need.substring(0, 30) : '新咨询'}`,
        content: [
          { type: 'text/plain', value: plainBody },
          { type: 'text/html', value: htmlBody },
        ],
      }),
    });
    if (mcResp.ok || mcResp.status === 202) {
      return json({ success: true, method: 'mailchannels' });
    }
  } catch (_) {}

  // Fallback: store in KV
  if (env.ZC_LEADS) {
    await env.ZC_LEADS.put(`email-notify:${Date.now()}`, JSON.stringify({ name, phone, need, timestamp: ts }), { expirationTtl: 604800 });
  }
  return json({ success: true, method: 'kv-stored', note: '线索已保存' });
}

// --- Route Dispatcher ---

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle OPTIONS (CORS preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // API Routes
    if (path === '/api/chat' && request.method === 'POST') {
      return handleChat(env, request);
    }
    if (path === '/api/hello') {
      return json({ ok: true, msg: 'Pages Functions (via _worker.js) are working!' });
    }
    if (path === '/api/health') {
      return json({ status: 'ok', service: '智创科技 AI客服', timestamp: new Date().toISOString() });
    }
    if (path === '/api/lead' && request.method === 'POST') {
      return handleLead(env, request);
    }
    if (path === '/api/leads') {
      return handleLeads(env);
    }
    if (path === '/api/notify' && request.method === 'POST') {
      return handleNotify(env, request);
    }

    // Fall through to static assets
    return env.ASSETS.fetch(request);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
