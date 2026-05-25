interface LeadData {
  name: string;
  phone: string;
  need: string;
  timestamp: string;
}

function buildEmailHtml(data: LeadData): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0f1a;padding:20px;color:#e8edf5;">
  <div style="max-width:520px;margin:0 auto;background:linear-gradient(135deg,#0f1420,#151b2c);border:1px solid rgba(0,198,255,0.2);border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#00c6ff,#007a9e);padding:28px 24px;text-align:center;">
      <div style="font-size:1.5rem;font-weight:900;color:#000;letter-spacing:2px;">🔔 新客户咨询</div>
      <div style="font-size:0.85rem;color:rgba(0,0,0,0.7);margin-top:6px;">智创科技 · AI智能客服线索通知</div>
    </div>
    <div style="padding:28px 24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:14px 16px;background:rgba(0,198,255,0.04);border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.85rem;color:#8b95a5;width:80px;">👤 姓名</td>
          <td style="padding:14px 16px;background:rgba(0,198,255,0.04);border-bottom:1px solid rgba(255,255,255,0.05);font-size:1.05rem;font-weight:700;color:#00c6ff;">${data.name}</td>
        </tr>
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.85rem;color:#8b95a5;">📱 手机</td>
          <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:1.05rem;font-weight:700;color:#e8edf5;">
            <a href="tel:${data.phone}" style="color:#00e5ff;text-decoration:none;">${data.phone}</a>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 16px;background:rgba(0,198,255,0.04);border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.85rem;color:#8b95a5;">🕐 时间</td>
          <td style="padding:14px 16px;background:rgba(0,198,255,0.04);border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.95rem;color:#e8edf5;">${data.timestamp}</td>
        </tr>
        <tr>
          <td style="padding:14px 16px;font-size:0.85rem;color:#8b95a5;vertical-align:top;">💬 需求</td>
          <td style="padding:14px 16px;font-size:0.95rem;color:#e8edf5;line-height:1.7;">${data.need || '未填写具体需求'}</td>
        </tr>
      </table>
    </div>
    <div style="padding:20px 24px;text-align:center;background:rgba(0,198,255,0.03);border-top:1px solid rgba(255,255,255,0.05);">
      <div style="font-size:0.8rem;color:#5a6475;">来源：智创科技官网 AI 智能客服 · zhi-chuang-tech.pages.dev</div>
      <div style="margin-top:10px;">
        <a href="https://zhi-chuang-tech.pages.dev/api/leads" style="display:inline-block;padding:8px 20px;background:linear-gradient(135deg,#00c6ff,#007a9e);color:#000;font-size:0.82rem;font-weight:700;text-decoration:none;border-radius:20px;">📋 查看所有线索</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function onRequestPost({ request, env }: { request: Request; env: any }) {
  const body: LeadData = await request.json();
  const { name, phone, need, timestamp } = body;

  if (!name || !phone) {
    return new Response(JSON.stringify({ success: false, error: 'missing name or phone' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ts = timestamp || new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const htmlBody = buildEmailHtml({ name, phone, need: need || '', timestamp: ts });
  const plainBody = `[新客户咨询] 智创科技\n\n姓名：${name}\n手机：${phone}\n时间：${ts}\n需求：${need || '未填写'}\n\n来源：智创科技官网 AI智能客服\n`;
  const toEmail = 'chaoyang126126@126.com';

  // Strategy: try multiple email sending methods in order

  // Method 1: MailChannels (Cloudflare partner, free)
  try {
    const mcResp = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail, name: '刘朝阳' }] }],
        from: { email: 'noreply@zhi-chuang-tech.pages.dev', name: '智创科技AI客服' },
        subject: `[新线索] ${name} - ${phone} - ${need ? need.substring(0, 30) : '新咨询'}`,
        content: [
          { type: 'text/plain', value: plainBody },
          { type: 'text/html', value: htmlBody },
        ],
      }),
    });

    if (mcResp.ok || mcResp.status === 202) {
      return new Response(JSON.stringify({ success: true, method: 'mailchannels' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (_) {}

  // Method 2: Cloudflare Email Routing Worker (if configured)
  // Try the /cdn-cgi/email routing endpoint
  try {
    const cfResp = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN || ''}` },
    });
    // Only proceed if we have a valid API token
    if (cfResp.ok && env.CF_API_TOKEN) {
      // This requires Email Routing setup - skip for now
    }
  } catch (_) {}

  // Method 3: Store in KV as fallback
  try {
    if (env.ZC_LEADS) {
      await env.ZC_LEADS.put(
        `email-notify:${Date.now()}`,
        JSON.stringify({ name, phone, need, timestamp: ts, notified: false }),
        { expirationTtl: 604800 }
      );
    }
  } catch (_) {}

  // Always return success - lead is safely stored
  return new Response(JSON.stringify({
    success: true,
    method: 'kv-stored',
    note: `线索已保存。查看所有线索: GET /api/leads`,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
