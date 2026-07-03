import type { LLMConfig } from '@/types'

const DEFAULT_CONFIG: LLMConfig = {
  apiUrl: import.meta.env.VITE_LLM_API_URL || '',
  apiKey: import.meta.env.VITE_LLM_API_KEY || '',
  model: import.meta.env.VITE_LLM_MODEL || 'gpt-4o-mini',
  serviceUrl: import.meta.env.VITE_SERVICE_URL || 'http://localhost:3000',
}

function withDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

export function getDefaultLLMConfig(): LLMConfig {
  return {
    apiUrl: normalizeLLMApiUrl(DEFAULT_CONFIG.apiUrl),
    apiKey: DEFAULT_CONFIG.apiKey,
    model: DEFAULT_CONFIG.model,
    serviceUrl: DEFAULT_CONFIG.serviceUrl,
  }
}

export function normalizeLLMApiUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (/\/chat\/completions\/?$/i.test(trimmed)) return trimmed.replace(/\/+$/, '')
  return `${trimmed.replace(/\/+$/, '')}/chat/completions`
}

export async function getLLMConfig(): Promise<LLMConfig> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiUrl', 'apiKey', 'model', 'serviceUrl'], (data: Record<string, string | undefined>) => {
      resolve({
        apiUrl: normalizeLLMApiUrl(withDefault(data.apiUrl, DEFAULT_CONFIG.apiUrl)),
        apiKey: withDefault(data.apiKey, DEFAULT_CONFIG.apiKey),
        model: withDefault(data.model, DEFAULT_CONFIG.model),
        serviceUrl: withDefault(data.serviceUrl, DEFAULT_CONFIG.serviceUrl),
      })
    })
  })
}

export async function saveLLMConfig(config: LLMConfig): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        apiUrl: normalizeLLMApiUrl(config.apiUrl),
        apiKey: config.apiKey.trim(),
        model: config.model.trim(),
        serviceUrl: config.serviceUrl.trim(),
      },
      resolve
    )
  })
}
