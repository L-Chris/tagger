import { createRoot } from 'react-dom/client'
import { useState, useEffect } from 'react'
import { getDefaultLLMConfig, getLLMConfig, normalizeLLMApiUrl, saveLLMConfig } from '@/api/storage'
import type { LLMConfig } from '@/types'

const PRESETS = [
  { name: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  { name: 'DeepSeek', url: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
  { name: 'Moonshot', url: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k' },
  { name: 'SiliconFlow', url: 'https://api.siliconflow.cn/v1/chat/completions', model: 'deepseek-ai/DeepSeek-V3' },
]

const styles = {
  container: {
    padding: '20px',
    background: 'white',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '24px',
  },
  logo: {
    width: '40px',
    height: '40px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    color: 'white',
    fontWeight: 'bold',
  },
  title: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1a202c',
  },
  subtitle: {
    fontSize: '12px',
    color: '#718096',
    marginTop: '2px',
  },
  presetSection: {
    marginBottom: '20px',
  },
  presetLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#4a5568',
    marginBottom: '8px',
    display: 'block',
  },
  presetGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
  },
  presetBtn: {
    padding: '8px 12px',
    background: '#f7fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    color: '#2d3748',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  field: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#4a5568',
    marginBottom: '4px',
  },
  help: {
    fontSize: '11px',
    color: '#a0aec0',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#2d3748',
    background: '#f7fafc',
    outline: 'none',
  },
  saveBtn: {
    width: '100%',
    padding: '10px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    marginTop: '8px',
  },
  status: {
    marginTop: '12px',
    padding: '8px',
    background: '#c6f6d5',
    color: '#22543d',
    borderRadius: '6px',
    fontSize: '13px',
    textAlign: 'center' as const,
  },
}

const Popup = () => {
  const [config, setConfig] = useState<LLMConfig>({ apiUrl: '', apiKey: '', model: '', serviceUrl: '' })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getLLMConfig().then(setConfig)
  }, [])

  const handleSave = async () => {
    await saveLLMConfig(config)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setConfig((prev) => ({ ...prev, apiUrl: preset.url, model: preset.model }))
  }

  const applyEnvDefault = () => {
    setConfig(getDefaultLLMConfig())
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.logo}>分</div>
        <div>
          <div style={styles.title}>Dominator</div>
          <div style={styles.subtitle}>配置 LLM API 参数</div>
        </div>
      </div>

      <div style={styles.presetSection}>
        <span style={styles.presetLabel}>快捷预设</span>
        <div style={styles.presetGrid}>
          <button
            style={styles.presetBtn}
            onClick={applyEnvDefault}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#edf2f7'
              e.currentTarget.style.borderColor = '#cbd5e0'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f7fafc'
              e.currentTarget.style.borderColor = '#e2e8f0'
            }}
          >
            环境默认
          </button>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              style={styles.presetBtn}
              onClick={() => applyPreset(p)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#edf2f7'
                e.currentTarget.style.borderColor = '#cbd5e0'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f7fafc'
                e.currentTarget.style.borderColor = '#e2e8f0'
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.field}>
        <label style={styles.label}>后端服务地址</label>
        <div style={styles.help}>数据将发送到此地址进行存储和 AI 分析</div>
        <input
          style={styles.input}
          type="text"
          value={config.serviceUrl}
          onChange={(e) => setConfig((prev) => ({ ...prev, serviceUrl: e.target.value }))}
          placeholder="http://localhost:3000"
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>API 地址</label>
        <div style={styles.help}>本地 LLM 备用，可填 Base URL，会自动补 /chat/completions</div>
        <input
          style={styles.input}
          type="text"
          value={config.apiUrl}
          onChange={(e) => setConfig((prev) => ({ ...prev, apiUrl: e.target.value }))}
          onBlur={(e) => setConfig((prev) => ({ ...prev, apiUrl: normalizeLLMApiUrl(e.target.value) }))}
          placeholder="https://api.openai.com/v1"
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>API Key</label>
        <div style={styles.help}>仅存储在本地浏览器中</div>
        <input
          style={styles.input}
          type="password"
          value={config.apiKey}
          onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
          placeholder="sk-..."
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>模型名称</label>
        <div style={styles.help}>如 gpt-4o-mini, deepseek-chat</div>
        <input
          style={styles.input}
          type="text"
          value={config.model}
          onChange={(e) => setConfig((prev) => ({ ...prev, model: e.target.value }))}
          placeholder="gpt-4o-mini"
        />
      </div>

      <button
        style={styles.saveBtn}
        onClick={handleSave}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
      >
        保存设置
      </button>
      {saved && <div style={styles.status}>✓ 保存成功！</div>}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Popup />)
