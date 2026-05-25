// Pages Function: POST /api/chat
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

【重要】如果客户提供了姓名和手机号，在回复的末尾加上这个标记（单独一行）：
[LEAD_COLLECTED:姓名=客户名字:电话=手机号]

例如当客户说"我叫张三，电话13800138000"，你回复的最后一行应该是：
[LEAD_COLLECTED:姓名=张三:电话=13800138000]`;

export async function onRequest(context) {
  const { request, env } = context;

  // CORS
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
    const messages = body.messages;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid messages format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const aiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const response = await env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
      messages: aiMessages,
      max_tokens: 512,
      temperature: 0.7,
    });

    // Workers AI returns { response: text } or ReadableStream for streaming
    let aiText = '';
    if (typeof response === 'string') {
      aiText = response;
    } else if (response instanceof ReadableStream) {
      aiText = '抱歉，AI流式响应暂不支持，请直接拨打电话 13161505904。';
    } else if (response?.response) {
      aiText = response.response;
    } else if (response?.choices?.[0]?.message?.content) {
      aiText = response.choices[0].message.content;
    } else {
      // Log unknown format
      console.log('AI response format:', JSON.stringify(response).substring(0, 200));
      aiText = JSON.stringify(response);
    }

    if (!aiText || aiText.length < 2) {
      aiText = '抱歉，我暂时无法回复，请直接拨打电话 13161505904 联系刘朝阳。';
    }

    return new Response(JSON.stringify({ reply: aiText }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    console.error('AI Chat Error:', err);
    return new Response(JSON.stringify({ error: 'AI service error', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
