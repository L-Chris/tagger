import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, jsonSchema, Output, streamText } from 'ai'
import type { ChatMessage, LLMResponseFormat, MessageToBackground, MessageResponse, SidePanelAnalysisRequest, StreamRequest } from '@/types'
import { startDevReloader } from '@/devReload'

startDevReloader('background')

let sidePanelRequest: SidePanelAnalysisRequest | null = null
let sidePanelRequestSeq = 0
const SIDE_PANEL_PATH = 'sidepanel.html'

syncSidePanelAvailability()
chrome.runtime.onInstalled.addListener(() => syncSidePanelAvailability())
chrome.runtime.onStartup.addListener(() => syncSidePanelAvailability())

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId)
    .then((tab) => setSidePanelAvailability(tabId, tab.url))
    .catch(() => undefined)
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'loading' || tab.url) {
    setSidePanelAvailability(tabId, changeInfo.url || tab.url)
  }
})

chrome.runtime.onMessage.addListener(
  (msg: MessageToBackground, sender, sendResponse: (r: MessageResponse) => void) => {
    if (msg.type === 'fetchZhihu') {
      fetchZhihu(msg.url, msg.referer)
        .then((r) => {
          if (!r.ok) {
            throw new Error(`HTTP ${r.status}: ${r.statusText}`)
          }
          return r.json()
        })
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }))
      return true
    }

    if (msg.type === 'fetchZhihuFromTab') {
      const tabId = msg.tabId
      if (tabId === undefined) {
        fetchZhihu(msg.url, msg.referer)
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`)
            return r.json()
          })
          .then((data) => sendResponse({ ok: true, data }))
          .catch((err) => sendResponse({ ok: false, error: String(err) }))
        return true
      }

      chrome.tabs.sendMessage(tabId, { type: 'fetchZhihuInPage', url: msg.url, referer: msg.referer })
        .then((res) => sendResponse(res ?? { ok: false, error: '知乎页面没有响应数据请求' }))
        .catch(() => {
          fetchZhihu(msg.url, msg.referer)
            .then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`)
              return r.json()
            })
            .then((data) => sendResponse({ ok: true, data }))
            .catch((err) => sendResponse({ ok: false, error: String(err) }))
        })
      return true
    }

    if (msg.type === 'generateLLM') {
      generateLLMText(msg)
        .then((text) => sendResponse({ ok: true, data: text }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }))
      return true
    }

    if (msg.type === 'enableSidePanelForCurrentTab') {
      enableSidePanelForTab(sender.tab?.id).catch(() => undefined)
      sendResponse({ ok: true, data: null })
      return false
    }

    if (msg.type === 'openSidePanel') {
      const tabId = sender.tab?.id
      sidePanelRequest = {
        requestId: `${Date.now()}-${++sidePanelRequestSeq}`,
        target: msg.target,
        maxPages: msg.maxPages,
        tabId,
      }

      if (!chrome.sidePanel) {
        sendResponse({ ok: false, error: '当前浏览器不支持 chrome.sidePanel API' })
        return false
      }

      const openOptions = getSidePanelOpenOptions(tabId, sender.tab?.windowId)
      if (!openOptions) {
        sendResponse({ ok: false, error: '无法确定当前标签页，不能打开侧边栏' })
        return false
      }

      chrome.sidePanel.open(openOptions)
        .then(() => {
          chrome.runtime.sendMessage({ type: 'sidePanelTargetUpdated' }).catch(() => undefined)
          sendResponse({ ok: true, data: sidePanelRequest })
        })
        .catch((err) => sendResponse({ ok: false, error: String(err) }))
      return true
    }

    if (msg.type === 'getSidePanelTarget') {
      const request = sidePanelRequest
      sidePanelRequest = null
      sendResponse({ ok: true, data: request })
      return false
    }

    if (msg.type === 'sidePanelAnalysisComplete' || msg.type === 'sidePanelAnalysisError') {
      const tabId = msg.tabId
      if (tabId !== undefined) {
        chrome.tabs.sendMessage(tabId, msg).catch(() => undefined)
      }
      sendResponse({ ok: true, data: null })
      return false
    }
  }
)

function getSidePanelOpenOptions(tabId?: number, windowId?: number): chrome.sidePanel.OpenOptions | null {
  if (tabId !== undefined) return { tabId }
  if (windowId !== undefined) return { windowId }
  return null
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'streamLLM') return

  port.onMessage.addListener(async (msg: StreamRequest) => {
    const { apiUrl, apiKey, model, messages, responseFormat } = msg
    const abortController = new AbortController()
    port.onDisconnect.addListener(() => abortController.abort())

    try {
      const provider = createOpenAICompatible({
        name: 'configured-openai-compatible',
        baseURL: toOpenAICompatibleBaseURL(apiUrl),
        apiKey,
        supportsStructuredOutputs: true,
      })
      const outputSpec = getOutputSpec(responseFormat)

      const callOptions = {
        model: provider.chatModel(model),
        instructions: getSystemInstructions(messages),
        messages: getModelMessages(messages),
        abortSignal: abortController.signal,
      }

      await streamToPort(
        outputSpec
          ? { ...callOptions, output: outputSpec }
          : callOptions,
        port
      )
    } catch (err) {
      if (responseFormat && isStructuredOutputCompatibilityError(err)) {
        try {
          const provider = createOpenAICompatible({
            name: 'configured-openai-compatible',
            baseURL: toOpenAICompatibleBaseURL(apiUrl),
            apiKey,
          })

          await streamToPort({
            model: provider.chatModel(model),
            instructions: getSystemInstructions(messages),
            messages: getModelMessages(messages),
            abortSignal: abortController.signal,
          }, port)
          return
        } catch (fallbackErr) {
          port.postMessage({ type: 'error', error: String(fallbackErr) })
          return
        }
      }

      port.postMessage({ type: 'error', error: String(err) })
    }
  })
})

function toOpenAICompatibleBaseURL(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/+$/, '')
  return trimmed.replace(/\/chat\/completions$/i, '')
}

function getSystemInstructions(messages: ChatMessage[]): string | undefined {
  const instructions = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n')
  return instructions || undefined
}

function getModelMessages(messages: ChatMessage[]): Exclude<ChatMessage, { role: 'system' }>[] {
  return messages.filter((message): message is Exclude<ChatMessage, { role: 'system' }> => message.role !== 'system')
}

function getOutputSpec(responseFormat?: LLMResponseFormat) {
  if (!responseFormat) return undefined
  const schema = jsonSchema(responseFormat.schema)

  if (responseFormat.type === 'array') {
    return Output.array({
      element: schema,
      name: responseFormat.name,
      description: responseFormat.description,
    })
  }

  return Output.object({
    schema,
    name: responseFormat.name,
    description: responseFormat.description,
  })
}

async function generateLLMText(msg: Extract<MessageToBackground, { type: 'generateLLM' }>): Promise<string> {
  const { apiUrl, apiKey, model, messages, responseFormat } = msg
  const provider = createOpenAICompatible({
    name: 'configured-openai-compatible',
    baseURL: toOpenAICompatibleBaseURL(apiUrl),
    apiKey,
    supportsStructuredOutputs: true,
  })
  const outputSpec = getOutputSpec(responseFormat)
  const callOptions = {
    model: provider.chatModel(model),
    instructions: getSystemInstructions(messages),
    messages: getModelMessages(messages),
  }

  try {
    const result = await generateText(outputSpec ? { ...callOptions, output: outputSpec } : callOptions)
    return result.text.trim()
  } catch (err) {
    if (!responseFormat || !isStructuredOutputCompatibilityError(err)) throw err

    const fallbackProvider = createOpenAICompatible({
      name: 'configured-openai-compatible',
      baseURL: toOpenAICompatibleBaseURL(apiUrl),
      apiKey,
    })
    const fallbackResult = await generateText({
      model: fallbackProvider.chatModel(model),
      instructions: getSystemInstructions(messages),
      messages: getModelMessages(messages),
    })
    return fallbackResult.text.trim()
  }
}

async function streamToPort(options: Parameters<typeof streamText>[0], port: chrome.runtime.Port) {
  const result = streamText(options)

  for await (const text of result.textStream) {
    if (text) {
      port.postMessage({ type: 'delta', text })
    }
  }

  port.postMessage({ type: 'done' })
}

function isStructuredOutputCompatibilityError(err: unknown): boolean {
  const message = String(err).toLowerCase()
  return message.includes('404')
    || message.includes('400')
    || message.includes('responseformat')
    || message.includes('response_format')
    || message.includes('json_schema')
    || message.includes('structured')
    || message.includes('unsupported')
}

function fetchZhihu(url: string, referer?: string): Promise<Response> {
  return fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      Referer: referer || 'https://www.zhihu.com/',
      'x-requested-with': 'fetch',
    },
  })
}

async function syncSidePanelAvailability() {
  if (!chrome.sidePanel) return
  try {
    const tabs = await chrome.tabs.query({})
    await Promise.all(
      tabs
        .filter((tab): tab is chrome.tabs.Tab & { id: number } => tab.id !== undefined)
        .map((tab) => setSidePanelAvailability(tab.id, tab.url))
    )
  } catch {
    // Best effort only; tab URL access can be restricted by the browser.
  }
}

async function setSidePanelAvailability(tabId?: number, url?: string) {
  if (!chrome.sidePanel || tabId === undefined) return
  try {
    await chrome.sidePanel.setOptions({ tabId, path: SIDE_PANEL_PATH, enabled: isZhihuUrl(url) })
  } catch {
    // This is only a UI availability hint; do not break analysis if it fails.
  }
}

async function enableSidePanelForTab(tabId?: number) {
  if (!chrome.sidePanel || tabId === undefined) return
  await chrome.sidePanel.setOptions({ tabId, path: SIDE_PANEL_PATH, enabled: true })
}

function isZhihuUrl(url?: string): boolean {
  if (!url) return false
  try {
    const { hostname, protocol } = new URL(url)
    return protocol === 'https:' && (hostname === 'www.zhihu.com' || hostname.endsWith('.zhihu.com'))
  } catch {
    return false
  }
}
