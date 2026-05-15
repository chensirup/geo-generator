import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

const client = new OpenAI({
  apiKey: process.env.ARK_API_KEY,
  baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
});

const PROMPTS = {
  geo: fs.readFileSync(path.join(__dirname, 'prompts', 'geo.md'), 'utf-8'),
  'geo-b': fs.readFileSync(path.join(__dirname, 'prompts', 'geo-b.md'), 'utf-8'),
};

function buildPrompt(type, params) {
  let prompt = PROMPTS[type];
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

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
};

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  // 静态文件
  if (req.method === 'GET') {
    let filePath;
    if (req.url === '/' || req.url === '/index.html') {
      filePath = path.join(__dirname, 'public', 'index.html');
    } else {
      filePath = path.join(__dirname, 'public', req.url);
    }
    serveStatic(res, filePath);
    return;
  }

  // API
  if (req.method === 'POST' && req.url === '/api/generate') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      let params;
      try {
        params = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '无效的请求体' }));
        return;
      }

      const { type, brand_info, product_info, keywords } = params;

      if (!type || !brand_info) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '缺少必要参数：type 和 brand_info' }));
        return;
      }

      if (!['geo', 'geo-b'].includes(type)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'type 只能是 geo 或 geo-b' }));
        return;
      }

      if (!process.env.ARK_API_KEY || !process.env.ARK_ENDPOINT_ID) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '服务端未配置 API Key 或模型接入点，请设置环境变量 ARK_API_KEY 和 ARK_ENDPOINT_ID' }));
        return;
      }

      const prompt = buildPrompt(type, { brand_info, product_info, keywords });

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      try {
        const stream = await client.chat.completions.create({
          model: process.env.ARK_ENDPOINT_ID,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 16000,
          stream: true,
        });

        for await (const chunk of stream) {
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
          }
        }

        res.write('data: [DONE]\n\n');
        res.end();
      } catch (err) {
        console.error('API error:', err);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`GEO 方案生成器已启动：http://localhost:${PORT}`);
  if (!process.env.ARK_API_KEY || !process.env.ARK_ENDPOINT_ID) {
    console.log('\n⚠️  未检测到环境变量，请先设置：');
    console.log('   export ARK_API_KEY=你的API Key');
    console.log('   export ARK_ENDPOINT_ID=你的模型接入点ID');
  }
});
