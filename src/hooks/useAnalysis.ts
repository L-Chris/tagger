import { useState, useCallback, useRef } from 'react'
import { jsonrepair } from 'jsonrepair'
import { fetchArticles, fetchAnswers, summarizeArticles, summarizeAnswers, getUserName, getUserId } from '@/api/zhihu'
import { ANALYSIS_RESPONSE_FORMAT, streamLLM, SYSTEM_PROMPT } from '@/api/llm'
import { getLLMConfig } from '@/api/storage'
import type { AnalysisJsonResult, AnalysisTarget, ArticleSummary, AnswerSummary } from '@/types'

interface AnalyzeOptions {
  maxPages?: number
  tabId?: number
  onComplete?: (resultText: string, parsed: AnalysisJsonResult | null) => void
  onError?: (error: string) => void
}

interface AnalysisState {
  loading: boolean
  streaming: boolean
  step: string
  error: string | null
  result: string | null
  articleCount: number
  answerCount: number
  target: AnalysisTarget | null
}

function buildPrompt(
  userName: string,
  userId: string,
  articles: ArticleSummary[],
  answers: AnswerSummary[]
): string {
  const articleSection = articles
    .map(
      (a, i) =>
        `${i + 1}. [${a.created}] ${a.title} | 赞同 ${a.voteup_count} 评论 ${a.comment_count}${!a.is_normal ? ' [非正常]' : ''}${a.suggest_edit ? ' [建议修改]' : ''}${a.is_labeled ? ' [已标注]' : ''}${a.reaction ? ` [反应:${a.reaction}]` : ''}\n   内容摘要: ${a.content_preview}`
    )
    .join('\n')

  const answerSection = answers
    .map(
      (a, i) =>
        `${i + 1}. [${a.created}] 问题: ${a.question_title} | 赞同 ${a.voteup_count} 评论 ${a.comment_count}${!a.is_normal ? ' [非正常]' : ''}${a.is_collapsed ? ' [已折叠]' : ''}${a.suggest_edit ? ' [建议修改]' : ''}${a.is_labeled ? ' [已标注]' : ''}${a.reaction ? ` [反应:${a.reaction}]` : ''}\n   内容摘要: ${a.content_preview}`
    )
    .join('\n')

  return `请分析知乎用户 "${userName}" (${userId}) 是否疑似水军、营销号或异常推广账号。

用户文章（共 ${articles.length} 篇）
${articleSection || '无公开文章数据'}

用户回答（共 ${answers.length} 条）
${answerSection || '无公开回答数据'}

请严格根据系统提示输出 JSON。`
}

function getDefaultMaxPages(): number {
  const configured = Number(import.meta.env.VITE_ZHIHU_ANALYSIS_MAX_PAGES || 5)
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 5
}

export function parseAnalysisJson(text: string): AnalysisJsonResult | null {
  const trimmed = text.trim()
  const jsonText = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()

  try {
    const parsed = JSON.parse(repairJsonText(jsonText)) as Partial<AnalysisJsonResult>
    if (!parsed || typeof parsed !== 'object') return null
    return {
      risk_level: parsed.risk_level || '未知',
      total_score: Number(parsed.total_score ?? 0),
      summary: parsed.summary || '',
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 3).map(String) : [],
      dimensions: normalizeAnalysisDimensions(parsed.dimensions),
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map(String) : [],
    }
  } catch {
    return null
  }
}

function normalizeAnalysisDimensions(value: unknown): AnalysisJsonResult['dimensions'] {
  const dimensions = isRecord(value) ? value : {}
  return {
    topic_focus: normalizeAnalysisDimension(dimensions.topic_focus),
    repetition: normalizeAnalysisDimension(dimensions.repetition),
    commercial_intent: normalizeAnalysisDimension(dimensions.commercial_intent),
    emotional_manipulation: normalizeAnalysisDimension(dimensions.emotional_manipulation),
    time_anomaly: normalizeAnalysisDimension(dimensions.time_anomaly),
    interaction_anomaly: normalizeAnalysisDimension(dimensions.interaction_anomaly),
    account_anomaly: normalizeAnalysisDimension(dimensions.account_anomaly),
  }
}

function normalizeAnalysisDimension(value: unknown): { score: number; evidence: string } {
  if (!isRecord(value)) return { score: 0, evidence: '' }
  return {
    score: Number(value.score ?? 0),
    evidence: String(value.evidence || ''),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function repairJsonText(text: string): string {
  try {
    return jsonrepair(text)
  } catch {
    return text
  }
}

function formatAnalysisAsMarkdown(r: AnalysisJsonResult): string {
  const dimNames = {
    topic_focus: '主题集中度 (20)',
    repetition: '内容重复度 (20)',
    commercial_intent: '商业植入 (15)',
    emotional_manipulation: '情绪操控 (15)',
    time_anomaly: '时间异常 (10)',
    interaction_anomaly: '互动异常 (10)',
    account_anomaly: '账号画像异常 (10)',
  }
  const dimLines = (Object.keys(dimNames) as Array<keyof typeof dimNames>)
    .map((k) => `- **${dimNames[k]}**: ${r.dimensions[k].score}/${k === 'topic_focus' || k === 'repetition' ? 20 : k === 'commercial_intent' || k === 'emotional_manipulation' ? 15 : 10} — ${r.dimensions[k].evidence}`)
    .join('\n')

  return `### 结论：${r.risk_level}（总分 ${r.total_score}/100）

${r.summary}

### 维度评分
${dimLines}

### 关键证据
${r.evidence.map((e) => `- ${e}`).join('\n')}

**标签**: ${r.tags.join(', ')}`
}

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({
    loading: false,
    streaming: false,
    step: '',
    error: null,
    result: null,
    articleCount: 0,
    answerCount: 0,
    target: null,
  })
  const streamTextRef = useRef('')
  const [streamText, setStreamText] = useState('')
  const portRef = useRef<chrome.runtime.Port | null>(null)

  const analyze = useCallback(async (target?: AnalysisTarget, options?: AnalyzeOptions) => {
    const analysisTarget = target || {
      userName: getUserName(),
      userId: getUserId() || '',
    }

    streamTextRef.current = ''
    setStreamText('')
    setState({
      loading: true,
      streaming: false,
      step: '正在获取数据...',
      error: null,
      result: null,
      articleCount: 0,
      answerCount: 0,
      target: analysisTarget,
    })

    try {
      const maxPages = options?.maxPages ?? getDefaultMaxPages()
      const answers = await fetchAnswers(maxPages, analysisTarget.userId, options?.tabId)
      const articles = await fetchArticles(maxPages, analysisTarget.userId, options?.tabId)

      setState((prev) => ({
        ...prev,
        articleCount: articles.length,
        answerCount: answers.length,
      }))

      const config = await getLLMConfig()

      if (config.serviceUrl) {
        setState((prev) => ({
          ...prev,
          step: '正在发送数据到后端分析...',
        }))

        const serviceUrl = config.serviceUrl.replace(/\/+$/, '')
        const response = await fetch(`${serviceUrl}/api/analyses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            zhihuUserId: analysisTarget.userId,
            userName: analysisTarget.userName,
            articles,
            answers,
          }),
        })

        if (!response.ok) {
          const text = await response.text().catch(() => '')
          throw new Error(`后端返回 ${response.status}: ${text.slice(0, 300)}`)
        }

        const json = await response.json() as {
          success: boolean
          data?: {
            riskLevel: string
            totalScore: number
            summary: string
            tags: unknown
            dimensions: unknown
            evidence: unknown
          }
        }

        if (!json.success || !json.data) {
          throw new Error('后端未返回有效结果')
        }

        const dimensions = normalizeAnalysisDimensions(json.data.dimensions)
        const result: AnalysisJsonResult = {
          risk_level: (json.data.riskLevel || '未知') as AnalysisJsonResult['risk_level'],
          total_score: json.data.totalScore,
          summary: json.data.summary,
          tags: Array.isArray(json.data.tags) ? json.data.tags.map(String) : [],
          dimensions,
          evidence: Array.isArray(json.data.evidence) ? json.data.evidence.map(String) : [],
        }

        const resultText = formatAnalysisAsMarkdown(result)

        setState((prev) => ({
          ...prev,
          loading: false,
          streaming: false,
          step: '',
          result: resultText,
        }))
        options?.onComplete?.(resultText, result)
        return
      }

      const articleSum = summarizeArticles(articles)
      const answerSum = summarizeAnswers(answers)

      setState((prev) => ({
        ...prev,
        step: '正在调用 AI 分析...',
      }))

      if (!config.apiKey) {
        const error = '请先在插件设置页面配置后端地址或 LLM API Key'
        setState((prev) => ({
          ...prev,
          loading: false,
          error,
        }))
        options?.onError?.(error)
        return
      }

      const prompt = buildPrompt(analysisTarget.userName, analysisTarget.userId, articleSum, answerSum)

      setState((prev) => ({ ...prev, streaming: true, step: '' }))

      const port = streamLLM(
        config.apiUrl || 'https://api.openai.com/v1/chat/completions',
        config.apiKey,
        config.model || 'gpt-4o-mini',
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        (delta) => {
          streamTextRef.current += delta
          setStreamText(streamTextRef.current)
        },
        () => {
          const final = streamTextRef.current.trim()
          const parsed = parseAnalysisJson(final)
          portRef.current = null
          setState((prev) => ({
            ...prev,
            loading: false,
            streaming: false,
            step: '',
            result: final,
          }))
          options?.onComplete?.(final, parsed)
        },
        (error) => {
          portRef.current = null
          setState((prev) => ({
            ...prev,
            loading: false,
            streaming: false,
            step: '',
            error,
          }))
          options?.onError?.(error)
        },
        true,
        ANALYSIS_RESPONSE_FORMAT
      )
      portRef.current = port
    } catch (err) {
      const error = err instanceof Error ? err.message : '分析失败'
      setState((prev) => ({
        ...prev,
        loading: false,
        streaming: false,
        step: '',
        error,
      }))
      options?.onError?.(error)
    }
  }, [])

  return { ...state, streamText, analyze }
}
