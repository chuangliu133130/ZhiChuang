import { Hono } from 'hono'

type Bindings = {
  ASSETS: Fetcher
  ZC_LEADS: KVNamespace
  AI: Ai
}

const app = new Hono<{ Bindings: Bindings }>()

// ── CORS Headers ──
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

// ── Handle CORS preflight ──
app.options('/api/*', (c) => {
  return new Response(null, { status: 204, headers: corsHeaders() })
})

// ──────────────────────────────────────────
// AI Customer Service Chat API
// ──────────────────────────────────────────

const SYSTEM_PROMPT = `你是"智创科技"的AI智能客服，名字叫"小智"。你代表公司热情、专业地与潜在客户沟通。

【公司背景】
智创科技是一支全栈技术团队，承接：网页设计开发、微信小程序、iOS/Android App、Java企业级后端、人工智能研发、技术架构咨询。

【你的任务】
1. 友好问候，了解客户的需求
2. 根据客户描述推荐匹配的服务
3. 在对话中自然地收集客户的【姓名】和【手机号码】
4. 收集到联系方式后，告诉客户"刘朝阳技术负责人"会尽快联系他们

【对话规则】
- 语气热情但专业，不要太啰嗦
- 每次回复控制在2-4句话内
- 如果客户问你不知道的技术细节，说"这部分细节刘工可以详细为您解答"
- 回复时不要在末尾加多余的寒暄
- 一定要在对话中找合适时机询问姓名和电话

【重要】如果客户提供了姓名和手机号，在回复的末尾加上这个标记（单独一行）：
[LEAD_COLLECTED:姓名=客户名字:电话=手机号]

例如当客户说"我叫张三，电话13800138000"，你回复的最后一行应该是：
[LEAD_COLLECTED:姓名=张三:电话=13800138000]`

// POST /api/chat - AI chat endpoint
app.post('/api/chat', async (c) => {
  try {
    const body = await c.req.json<{ messages: { role: string; content: string }[] }>()

    if (!body.messages || !Array.isArray(body.messages)) {
      return c.json({ error: 'Invalid messages format' }, { status: 400, headers: corsHeaders() })
    }

    // Convert messages to Workers AI format
    const aiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...body.messages.map((m) => ({ role: m.role, content: m.content })),
    ]

    const response = await c.env.AI.run('@cf/zai-org/glm-4.7-flash', {
      messages: aiMessages,
      max_tokens: 512,
      temperature: 0.7,
    })

    const aiText = (response as any)?.response || '抱歉，我暂时无法回复，请稍后再试。'

    return c.json({ reply: aiText }, { headers: corsHeaders() })

  } catch (err: any) {
    console.error('AI Chat Error:', err)
    return c.json(
      { error: 'AI service error', detail: err.message },
      { status: 500, headers: corsHeaders() }
    )
  }
})

// ──────────────────────────────────────────
// Lead Management API
// ──────────────────────────────────────────

// POST /api/lead - Save customer lead
app.post('/api/lead', async (c) => {
  try {
    const body = await c.req.json<{ name: string; phone: string; need?: string }>()

    if (!body.name || !body.phone) {
      return c.json(
        { error: '姓名和手机号为必填项' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const leadId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const timestamp = new Date().toISOString()
    const timestampCN = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

    const leadData = {
      id: leadId,
      name: body.name.trim(),
      phone: body.phone.trim().replace(/\s/g, ''),
      need: body.need || '',
      source: 'AI客服',
      created_at: timestamp,
      created_at_cn: timestampCN,
    }

    await c.env.ZC_LEADS.put(leadId, JSON.stringify(leadData))

    return c.json(
      {
        success: true,
        message: `感谢 ${body.name}！刘朝阳技术负责人会尽快联系您。`,
        lead: { id: leadId, name: body.name },
      },
      { headers: corsHeaders() }
    )

  } catch (err: any) {
    console.error('Lead Save Error:', err)
    return c.json(
      { error: '保存失败', detail: err.message },
      { status: 500, headers: corsHeaders() }
    )
  }
})

// GET /api/leads - List all leads (admin)
app.get('/api/leads', async (c) => {
  try {
    const list = await c.env.ZC_LEADS.list()
    const leads = await Promise.all(
      list.keys.map(async (k) => {
        const data = await c.env.ZC_LEADS.get(k.name)
        return data ? JSON.parse(data) : null
      })
    )
    const valid = leads.filter(Boolean).sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    return c.json({ leads: valid, total: valid.length }, { headers: corsHeaders() })
  } catch (err: any) {
    return c.json({ error: err.message }, { status: 500, headers: corsHeaders() })
  }
})

// ──────────────────────────────────────────
// Health Check
// ──────────────────────────────────────────
app.get('/api/health', (c) => {
  return c.json(
    {
      status: 'ok',
      service: '智创科技 AI客服',
      timestamp: new Date().toISOString(),
    },
    { headers: corsHeaders() }
  )
})

// ──────────────────────────────────────────
// Fallback to Static Assets
// ──────────────────────────────────────────
app.all('*', (c) => {
  return c.env.ASSETS.fetch(c.req.raw)
})

export default app
