const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function loadPrompt(type) {
  const file = path.join(__dirname, '..', 'prompts', `${type}.md`);
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, brand_info, product_info, keywords } = req.body || {};

  if (!type || !brand_info) {
    return res.status(400).json({ error: '缺少必要参数：type 和 brand_info' });
  }

  if (!['geo', 'geo-b'].includes(type)) {
    return res.status(400).json({ error: 'type 只能是 geo 或 geo-b' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: '服务端未配置 API Key' });
  }

  const prompt = buildPrompt(type, { brand_info, product_info, keywords });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }],
    });

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    stream.on('end', () => {
      res.write('data: [DONE]\n\n');
      res.end();
    });

    stream.on('error', (err) => {
      console.error('Stream error:', err);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    });

    req.on('close', () => {
      stream.stop();
    });
  } catch (err) {
    console.error('API error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
};
