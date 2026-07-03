import type { ChatMessage, LLMResponseFormat, MessageResponse, StreamMessage } from '@/types'

type OnDelta = (text: string) => void
type OnDone = () => void

export function streamLLM(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  onDelta: OnDelta,
  onDone: OnDone,
  onError: (error: string) => void,
  jsonMode = false,
  responseFormat?: LLMResponseFormat,
): chrome.runtime.Port {
  const port = chrome.runtime.connect({ name: 'streamLLM' })
  port.postMessage({ apiUrl, apiKey, model, messages, jsonMode, responseFormat })

  port.onMessage.addListener((msg: StreamMessage) => {
    if (msg.type === 'delta') onDelta(msg.text)
    else if (msg.type === 'done') onDone()
    else if (msg.type === 'error') onError(msg.error)
  })

  return port
}

export function generateLLM(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  responseFormat?: LLMResponseFormat,
): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'generateLLM', apiUrl, apiKey, model, messages, responseFormat },
      (res: MessageResponse | undefined) => {
        const runtimeError = chrome.runtime.lastError?.message
        if (runtimeError) {
          reject(runtimeError)
          return
        }
        if (!res?.ok) {
          reject(res?.error || 'LLM 请求失败')
          return
        }
        resolve(String(res.data || ''))
      }
    )
  })
}

const SYSTEM_PROMPT = `<role>
你是知乎账号行为分析师。
</role>

<task>
基于用户公开文章和回答，评估其是否疑似水军、营销号或异常推广账号。
</task>

<scoring>
总分 0 到 100，按以下维度加权评估：
- topic_focus: 20 分，长期围绕同一品牌、公司、人物、争议议题。
- repetition: 20 分，模板化表达、重复句式、观点机械复用。
- commercial_intent: 15 分，频繁引导购买、注册、私信、站外转化。
- emotional_manipulation: 15 分，夸大、攻击、煽动、带节奏。
- time_anomaly: 10 分，短时间高频发布、异常活跃窗口。
- interaction_anomaly: 10 分，互动数据、评论或感谢行为异常。
- account_anomaly: 10 分，资料过空、新号、领域跳变、身份与内容不匹配。
</scoring>

<output_contract>
必须只输出一个 JSON 对象，不要 Markdown，不要代码块，不要额外解释。
所有字段必须符合 JSON shape。
</output_contract>

<json_shape>
{
  "risk_level": "低风险 | 中风险 | 高风险 | 极高风险",
  "total_score": 0,
  "summary": "一句话结论",
  "tags": ["最多3个短标签"],
  "dimensions": {
    "topic_focus": { "score": 0, "evidence": "证据" },
    "repetition": { "score": 0, "evidence": "证据" },
    "commercial_intent": { "score": 0, "evidence": "证据" },
    "emotional_manipulation": { "score": 0, "evidence": "证据" },
    "time_anomaly": { "score": 0, "evidence": "证据" },
    "interaction_anomaly": { "score": 0, "evidence": "证据" },
    "account_anomaly": { "score": 0, "evidence": "证据" }
  },
  "evidence": ["最多5条关键证据"]
}
</json_shape>`

const scoreDimensionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'evidence'],
  properties: {
    score: { type: 'number' },
    evidence: { type: 'string' },
  },
}

const ANALYSIS_RESPONSE_FORMAT: LLMResponseFormat = {
  type: 'object',
  name: 'zhihu_user_analysis',
  description: '知乎用户详细分析结果',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['risk_level', 'total_score', 'summary', 'tags', 'dimensions', 'evidence'],
    properties: {
      risk_level: { type: 'string', enum: ['低风险', '中风险', '高风险', '极高风险', '未知'] },
      total_score: { type: 'number', minimum: 0, maximum: 100 },
      summary: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      dimensions: {
        type: 'object',
        additionalProperties: false,
        required: [
          'topic_focus',
          'repetition',
          'commercial_intent',
          'emotional_manipulation',
          'time_anomaly',
          'interaction_anomaly',
          'account_anomaly',
        ],
        properties: {
          topic_focus: scoreDimensionSchema,
          repetition: scoreDimensionSchema,
          commercial_intent: scoreDimensionSchema,
          emotional_manipulation: scoreDimensionSchema,
          time_anomaly: scoreDimensionSchema,
          interaction_anomaly: scoreDimensionSchema,
          account_anomaly: scoreDimensionSchema,
        },
      },
      evidence: { type: 'array', items: { type: 'string' } },
    },
  },
}

export { ANALYSIS_RESPONSE_FORMAT, SYSTEM_PROMPT }
