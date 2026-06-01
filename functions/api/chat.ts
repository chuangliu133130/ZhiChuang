// Pages Function: /api/chat
// Named exports for specific HTTP methods
export async function onRequestPost(context) {
  const { request, env } = context;

  // AI Binding check
  if (!env || !env.AI) {
    return new Response(JSON.stringify({
      reply: '',
      fallback: true,
      reason: 'AI binding not configured'
    }), {
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
    } else if (aiResponse instanceof ReadableStream) {
      const reader = aiResponse.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) aiText += decoder.decode(value, { stream: true });
      }
    } else if (aiResponse) {
      // OpenAI-compatible: choices[0].message.content
      const choice = aiResponse.choices?.[0]?.message;
      if (choice) {
        aiText = choice.content || choice.reasoning_content || '';
      }
      // Non-streaming text generation: response field
      if (!aiText && aiResponse.response) {
        aiText = aiResponse.response;
      }
      // result field (some models)
      if (!aiText && aiResponse.result?.response) {
        aiText = aiResponse.result.response;
      }
    }

    console.log('AI raw type:', typeof aiResponse, 'aiText length:', aiText?.length || 0);

    if (!aiText || aiText.trim().length < 2) {
      aiText = '抱歉，我暂时无法回复，请直接拨打 13161505904 联系刘朝阳。';
    }

    return new Response(JSON.stringify({ reply: aiText }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    console.error('AI Chat Error:', err);
    return new Response(JSON.stringify({
      reply: '',
      fallback: true,
      reason: 'AI error: ' + err.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

// Handle OPTIONS for CORS
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
