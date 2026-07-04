import type { MessageToBackground, MessageResponse } from '@/types'
import { startDevReloader } from '@/devReload'
import { SERVICE_URL } from '@/api/storage'

startDevReloader('background')

chrome.runtime.onMessage.addListener(
  (msg: MessageToBackground, _sender, sendResponse: (r: MessageResponse) => void) => {
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

    if (msg.type === 'quickAnalyze') {
      postQuickAnalyze(msg.payload)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => sendResponse({ ok: false, error: String(err), status: getErrorStatus(err) }))
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

    sendResponse({ ok: false, error: `Unknown message type: ${String((msg as { type?: unknown }).type)}` })
    return false
  }
)

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

async function postQuickAnalyze(payload: unknown): Promise<unknown> {
  const serviceUrl = SERVICE_URL.replace(/\/+$/, '')
  const response = await fetch(`${serviceUrl}/api/analyze/quick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw toStatusError(`Backend returned ${response.status}: ${text.slice(0, 300)}`, response.status)
  }

  return response.json()
}

function toStatusError(message: string, status: number): Error & { status?: number } {
  const error = new Error(message) as Error & { status?: number }
  error.status = status
  return error
}

function getErrorStatus(err: unknown): number | undefined {
  return err instanceof Error ? (err as Error & { status?: number }).status : undefined
}
