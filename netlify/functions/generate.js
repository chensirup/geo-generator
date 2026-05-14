import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const client = new OpenAI({
  apiKey: process.env.ARK_API_KEY,
  baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
});

function loadPrompt(type) {
  const file = path.join(process.cwd(), 'prompts', `${type}.md`);
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

  if (!process.env.ARK_API_KEY || !process.env.ARK_ENDPOINT_ID) {
    return new Response(JSON.stringify({ error: '服务端未配置 API Key 或模型接入点' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const prompt = buildPrompt(type, { brand_info, product_info, keywords });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.chat.completions.create({
          model: process.env.ARK_ENDPOINT_ID,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 16000,
          stream: true,
        });

        for await (const chunk of response) {
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: content })}\n\n`));
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
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
