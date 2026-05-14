(function () {
  const form = document.getElementById('geoForm');
  const submitBtn = document.getElementById('submitBtn');
  const resultArea = document.getElementById('resultArea');
  const resultContent = document.getElementById('resultContent');
  const errorArea = document.getElementById('errorArea');
  const errorMsg = document.getElementById('errorMsg');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const productInfoGroup = document.getElementById('productInfoGroup');
  const keywordsGroup = document.getElementById('keywordsGroup');

  let currentMarkdown = '';
  let currentBrandName = '';

  // B端版才显示产品信息和关键词字段
  document.querySelectorAll('input[name="type"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      const isBType = this.value === 'geo-b';
      productInfoGroup.style.display = isBType ? '' : 'none';
      keywordsGroup.style.display = isBType ? '' : 'none';
    });
  });

  // 初始化时根据默认选中值设置显示
  function updateFieldVisibility() {
    const type = document.querySelector('input[name="type"]:checked').value;
    const isBType = type === 'geo-b';
    productInfoGroup.style.display = isBType ? '' : 'none';
    keywordsGroup.style.display = isBType ? '' : 'none';
  }
  updateFieldVisibility();

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const type = document.querySelector('input[name="type"]:checked').value;
    const brand_info = document.getElementById('brand_info').value.trim();
    const product_info = document.getElementById('product_info').value.trim();
    const keywords = document.getElementById('keywords').value.trim();

    if (!brand_info) return;

    // 提取品牌名（取第一行或前20字符）
    currentBrandName = brand_info.split(/[，,\n]/)[0].substring(0, 20);

    submitBtn.disabled = true;
    submitBtn.textContent = '生成中...';
    resultArea.classList.remove('hidden');
    errorArea.classList.add('hidden');
    resultContent.innerHTML = '<span class="typing-cursor"></span>';
    currentMarkdown = '';

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, brand_info, product_info, keywords }),
      });

      if (!response.ok) {
        const data = await response.json().catch(function () { return {}; });
        throw new Error(data.error || '请求失败：' + response.status);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.text) {
                currentMarkdown += parsed.text;
                renderMarkdown(currentMarkdown);
              }
            } catch (e) {
              if (e.message && !e.message.includes('JSON')) throw e;
            }
          }
        }
      }

      // 最终渲染
      if (currentMarkdown) {
        renderMarkdown(currentMarkdown);
      }
    } catch (err) {
      errorArea.classList.remove('hidden');
      errorMsg.textContent = err.message || '生成失败，请重试';
      resultArea.classList.add('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '生成方案';
    }
  });

  function renderMarkdown(text) {
    resultContent.innerHTML = marked.parse(text);
    // 自动滚动到底部
    resultContent.scrollTop = resultContent.scrollHeight;
  }

  copyBtn.addEventListener('click', function () {
    if (!currentMarkdown) return;
    navigator.clipboard.writeText(currentMarkdown).then(function () {
      copyBtn.textContent = '已复制';
      setTimeout(function () { copyBtn.textContent = '复制'; }, 2000);
    });
  });

  downloadBtn.addEventListener('click', function () {
    if (!currentMarkdown) return;
    const type = document.querySelector('input[name="type"]:checked').value;
    const suffix = type === 'geo-b' ? 'GEO营销解决方案' : 'AI时代品牌数字信任资产策略方案';
    const filename = currentBrandName + suffix + '.md';
    const blob = new Blob([currentMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
})();
