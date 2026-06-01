// API Backend for CloudStudio - uses Ollama locally
import { createServer } from 'http';

const PORT = process.env.PORT || 8787;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

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
- 一定要在对话中找合适时机询问姓名和电话

【重要】如果客户提供了姓名和手机号，在回复的末尾加上这个标记（单独一行）：
[LEAD_COLLECTED:姓名=客户名字:电话=手机号]`;

// CORS headers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonReply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// In-memory lead storage (resets on restart)
let leads = [];

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  // Health check
  if (path === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders() });
    res.end(JSON.stringify({ status: 'ok', service: '智创科技 AI客服', backend: 'ollama', timestamp: new Date().toISOString() }));
    return;
  }

  // AI Chat
  if (path === '/api/chat' && req.method === 'POST') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const messages = body.messages;

      if (!messages || !Array.isArray(messages)) {
        return jsonReply({ error: 'Invalid messages' }, 400);
      }

      // Build Ollama request
      const ollamaMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ];

      const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5:3b',
          messages: ollamaMessages,
          stream: false,
          options: { temperature: 0.7, num_predict: 512 },
        }),
      });

      if (!ollamaRes.ok) {
        console.error(`Ollama error: ${ollamaRes.status}`);
        return jsonReply({ reply: 'AI服务暂时繁忙，请直接拨打 131 6150 5904 联系刘朝阳。' });
      }

      const data = await ollamaRes.json();
      const reply = data?.message?.content || '抱歉，我暂时无法回复，请直接拨打 131 6150 5904 联系刘朝阳。';

      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders() });
      res.end(JSON.stringify({ reply }));
    } catch (err) {
      console.error('Chat error:', err);
      return jsonReply({ reply: 'AI服务暂时繁忙，请直接拨打 131 6150 5904 联系刘朝阳。' });
    }
    return;
  }

  // Save lead
  if (path === '/api/lead' && req.method === 'POST') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const { name, phone, need } = body;

      if (!name || !phone) {
        return jsonReply({ error: '姓名和手机号为必填项' }, 400);
      }

      const lead = {
        id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim(),
        phone: phone.trim().replace(/\s/g, ''),
        need: need || '',
        source: 'AI客服',
        created_at: new Date().toISOString(),
        created_at_cn: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      };

      leads.push(lead);

      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders() });
      res.end(JSON.stringify({ success: true, message: `感谢 ${name}！`, lead: { id: lead.id, name: lead.name } }));
    } catch (err) {
      return jsonReply({ error: '保存失败' }, 500);
    }
    return;
  }

  // List leads
  if (path === '/api/leads' && req.method === 'GET') {
    const sorted = [...leads].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders() });
    res.end(JSON.stringify({ leads: sorted, total: sorted.length }));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain', ...corsHeaders() });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`API server running on port ${PORT}, Ollama: ${OLLAMA_URL}`);
});
