type ReloadTarget = 'content' | 'background'

const enabled = import.meta.env.VITE_EXTENSION_DEV_RELOAD === 'true'
const port = import.meta.env.VITE_DEV_RELOAD_PORT

export function startDevReloader(target: ReloadTarget) {
  if (!enabled || !port) return

  let closedByReload = false

  const connect = () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`)

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string }
        if (message.type !== 'reload') return

        closedByReload = true
        if (target === 'background') {
          chrome.runtime.reload()
        } else {
          location.reload()
        }
      } catch {
        // Ignore malformed dev-server messages.
      }
    })

    socket.addEventListener('close', () => {
      if (!closedByReload) globalThis.setTimeout(connect, 1000)
    })
  }

  connect()
}
