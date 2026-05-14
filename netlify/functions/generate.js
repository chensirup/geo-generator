const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function loadPrompt(type) {
  const file = path.join(__dirname, '..', '..', 'prompts', `${type}.md`);
  return fs.readFileSync(file, 'utf-8');
}

function buildPrompt(type, params) {
  let prompt = loadPrompt(type);

  if (type === 'geo') {
    prompt = prompt.replace('{{BRAND_INFO}}', params.brand_info || '未提供');
  } else {
    prompt = prompt
      .replace('{{BRAND_NAME}}', params.brand_info || '品牌/公司名')
      .replace('{{PRODUCT_INFO}}', params.product_info || '未提供')
      .replace('{{KEYWORDS}}', params.keywords || '请自行思考总结得出');
  }

  return prompt;
}

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: '无效的请求体' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { type, brand_info, product_info, keywords } = body;

  if (!type || !brand_info) {
    return new Response(JSON.stringify({ error: '缺少必要参数：type 和 brand_info' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!['geo', 'geo-b'].includes(type)) {
    return new Response(JSON.stringify({ error: 'type 只能是 geo 或 geo-b' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: '服务端未配置 API Key' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const prompt = buildPrompt(type, { brand_info, product_info, keywords });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const msgStream = anthropic.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 16000,
          messages: [{ role: 'user', content: prompt }],
        });

        msgStream.on('text', (text) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        });

        msgStream.on('end', () => {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        });

        msgStream.on('error', (err) => {
          console.error('Stream error:', err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
          controller.close();
        });
      } catch (err) {
        console.error('API error:', err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};

export const config = {
  path: '/api/generate',
};
