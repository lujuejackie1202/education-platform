import { getSetting } from './db.js';

export function llmConfig() {
  return {
    apiKey: getSetting('LLM_API_KEY'),
    baseUrl: (getSetting('LLM_BASE_URL', 'https://api.deepseek.com/v1') || 'https://api.deepseek.com/v1').replace(/\/$/, ''),
    model: getSetting('LLM_MODEL', 'deepseek-chat') || 'deepseek-chat',
  };
}

export function llmReady() {
  return Boolean(llmConfig().apiKey);
}

export async function complete(system, user) {
  const { apiKey, baseUrl, model } = llmConfig();
  if (!apiKey) {
    const error = new Error('尚未配置大模型接口');
    error.code = 'NO_LLM';
    throw error;
  }
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message || `模型接口返回 ${response.status}`;
    throw new Error(message);
  }
  return payload.choices?.[0]?.message?.content || '';
}

export function parseJsonLoose(text) {
  const source = String(text).trim();
  const objectStart = source.indexOf('{');
  const objectEnd = source.lastIndexOf('}');
  const arrayStart = source.indexOf('[');
  const arrayEnd = source.lastIndexOf(']');
  if (arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart)) {
    return JSON.parse(source.slice(arrayStart, arrayEnd + 1));
  }
  if (objectStart < 0) throw new Error('模型没有返回 JSON');
  return JSON.parse(source.slice(objectStart, objectEnd + 1));
}

export async function explainMatch(summary) {
  if (!llmReady()) return '';
  const text = await complete(
    '你是浙江高职提前招生的说明助手。只根据给定统计写一段 120 字以内的说明。不要新增学校，不要写分数，不要写录取概率，不要使用保过、稳上、预测命中。',
    `数据年份 ${summary.year}。结果 ${summary.total} 条：明显高于近年入围线 ${summary.high} 条，贴近 ${summary.mid} 条，刚过硬门槛 ${summary.low} 条，缺少入围分 ${summary.unknown || 0} 条。因硬门槛未进入结果 ${summary.excluded} 条。今年考纲未发布 ${summary.outlineClosed} 条。`,
  );
  return text.trim();
}

export async function extractBrochure(body) {
  const text = await complete(
    '你是浙江高职提前招生简章的字段抽取员。只抽取文本里写明的内容，没有的字段用 null。不要估算录取分。只输出 JSON。',
    `${body}\n\n输出格式：{"school":"","year":null,"formula_label":"","formula_mode":"selected6","points":{"A":null,"B":null,"C":null,"D":null,"E":null},"weights":null,"xuekao_req":"","test_form":"","body_note":"","majors":[{"name":"","plan_num":null,"cutoff_score":null}]}。formula_mode 只能是 selected6、all10、weighted10 或 null。`,
  );
  return parseJsonLoose(text);
}

export async function draftQuestions(major) {
  const text = await complete(
    '你为浙江高职提前招生编写仿真练习题。题目按考纲模块编写，不要称为真题，不要称为今年原题预测。只输出 JSON 数组，4 道单选题。',
    `学校：${major.school_name}\n专业：${major.name}\n校测形式：${major.test_form}\n考纲：${major.outline_text || '职业素养、专业认知、逻辑表达'}\n每题格式：{"module":"","stem":"","options":["","","",""],"answer":"A","explanation":"","difficulty":3}`,
  );
  const items = parseJsonLoose(text);
  if (!Array.isArray(items)) throw new Error('模型没有返回题目数组');
  return items.slice(0, 4);
}
