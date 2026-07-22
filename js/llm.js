/**
 * Адаптер нейронки (итерация 8).
 *
 * Работает с любым OpenAI-совместимым API (OpenAI, прокси, свой бэкенд):
 * endpoint и модель настраиваются. Ключ хранится ТОЛЬКО в localStorage браузера —
 * в код и репозиторий не попадает. Для публичной страницы рекомендуется лёгкий
 * прокси-бэкенд (Cloudflare Worker и т.п.), чтобы не раздавать ключ; для локального
 * показа достаточно вставить ключ в настройках «ИИ» в шапке демо.
 *
 * Без ключа демо работает как раньше — на шаблонных текстах.
 */

const LLM = {
  get key() { return localStorage.getItem('llm_key') || ''; },
  get url() { return localStorage.getItem('llm_url') || 'https://api.openai.com/v1/chat/completions'; },
  get model() { return localStorage.getItem('llm_model') || 'gpt-4o-mini'; },

  save({ key, url, model }) {
    if (key !== undefined) localStorage.setItem('llm_key', key.trim());
    if (url !== undefined && url.trim()) localStorage.setItem('llm_url', url.trim());
    if (model !== undefined && model.trim()) localStorage.setItem('llm_model', model.trim());
  },

  clear() {
    localStorage.removeItem('llm_key');
  },

  enabled() { return !!this.key; },

  /** Один запрос: system + user, возвращает текст ответа. */
  async complete(userPrompt, { temperature = 0.3, maxTokens = 1600 } = {}) {
    const r = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.key
      },
      body: JSON.stringify({
        model: this.model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: PROMPTS.system },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    if (!r.ok) throw new Error('LLM HTTP ' + r.status);
    const j = await r.json();
    const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!text) throw new Error('LLM: пустой ответ');
    return text.trim();
  }
};
