// Cloudflare Pages _worker.js (advanced mode)
// Handles ALL routes: /api/* → Worker logic, everything else → static assets

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

// CORS helper
function cors(resp) {
  resp.headers.set('Access-Control-Allow-Origin', '*');
  resp.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  resp.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return resp;
}

class APIHandler {
  constructor(env) {
    this.env = env;
  }

  // POST /api/chat
  async chat(request) {
    // AI binding check
    if (!this.env || !this.env.AI) {
      return cors(new Response(JSON.stringify({
        reply: '',
        fallback: true,
        reason: 'AI binding not configured'
      }), { headers: { 'Content-Type': 'application/json' } }));
    }

    try {
      const body = await request.json();
      const messages = body.messages;
      if (!messages || !Array.isArray(messages)) {
        return cors(new Response(JSON.stringify({ error: 'Invalid messages' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        }));
      }

      const aiMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ];

      const aiResponse = await this.env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
        messages: aiMessages,
        max_tokens: 512,
        temperature: 0.7,
      });

      let aiText = '';
      if (typeof aiResponse === 'string') {
        aiText = aiResponse;
      } else if (aiResponse instanceof ReadableStream) {
        const reader = aiResponse.getReader();
        const decoder = new TextDecoder();
        let done = false;
        while (!done) {
          const { value, done: d } = await reader.read();
          done = d;
          if (value) aiText += decoder.decode(value, { stream: true });
        }
      } else if (aiResponse?.response) {
        aiText = aiResponse.response;
      }

      if (!aiText || aiText.trim().length < 2) {
        aiText = '抱歉，我暂时无法回复，请直接拨打 13161505904 联系刘朝阳。';
      }

      return cors(new Response(JSON.stringify({ reply: aiText }), {
        headers: { 'Content-Type': 'application/json' }
      }));

    } catch (err) {
      console.error('AI Error:', err);
      return cors(new Response(JSON.stringify({
        reply: '',
        fallback: true,
        reason: 'AI error: ' + err.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
  }

  // POST /api/lead
  async saveLead(request) {
    try {
      const body = await request.json();
      if (!body.name || !body.phone) {
        return cors(new Response(JSON.stringify({ error: '姓名和手机号为必填项' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        }));
      }

      const leadId = 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const leadData = {
        id: leadId,
        name: body.name.trim(),
        phone: body.phone.trim().replace(/\s/g, ''),
        need: body.need || '',
        source: 'AI客服',
        created_at: new Date().toISOString(),
        created_at_cn: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      };

      if (this.env.ZC_LEADS) {
        await this.env.ZC_LEADS.put(leadId, JSON.stringify(leadData));
      }

      return cors(new Response(JSON.stringify({
        success: true,
        message: '感谢 ' + body.name + '！刘朝阳会尽快联系您。',
        lead: { id: leadId, name: body.name }
      }), { headers: { 'Content-Type': 'application/json' } }));

    } catch (err) {
      return cors(new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      }));
    }
  }

  // GET /api/leads
  async listLeads() {
    try {
      if (!this.env.ZC_LEADS) {
        return cors(new Response(JSON.stringify({ leads: [], total: 0, error: 'KV not bound' }), {
          headers: { 'Content-Type': 'application/json' }
        }));
      }
      const list = await this.env.ZC_LEADS.list();
      const leads = await Promise.all(
        list.keys.map(async k => {
          const data = await this.env.ZC_LEADS.get(k.name);
          return data ? JSON.parse(data) : null;
        })
      );
      const valid = leads.filter(Boolean).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return cors(new Response(JSON.stringify({ leads: valid, total: valid.length }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    } catch (err) {
      return cors(new Response(JSON.stringify({ error: err.message, leads: [], total: 0 }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      }));
    }
  }

  // GET /api/health
  health() {
    return cors(new Response(JSON.stringify({
      status: 'ok',
      service: '智创科技 AI客服',
      timestamp: new Date().toISOString(),
      mode: 'Pages _worker.js',
    }), { headers: { 'Content-Type': 'application/json' } }));
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const api = new APIHandler(env);

    // Handle OPTIONS preflight for all /api/*
    if (request.method === 'OPTIONS' && path.startsWith('/api/')) {
      return cors(new Response(null, { status: 204 }));
    }

    // API routes
    if (path === '/api/chat' && request.method === 'POST') {
      return api.chat(request);
    }
    if (path === '/api/lead' && request.method === 'POST') {
      return api.saveLead(request);
    }
    if (path === '/api/leads' && request.method === 'GET') {
      return api.listLeads();
    }
    if (path === '/api/health') {
      return api.health();
    }

    // Everything else → static assets
    return env.ASSETS.fetch(request);
  }
};
