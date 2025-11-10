import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import './App.css'

type ViewKey = 'silRaw' | 'silCanonical' | 'ast' | 'parse' | 'ir' | 'assembly'

type CompileResult = {
  label: string
  command: string
  exitCode: number
  output: string
}

type CompileResponse = {
  results: Record<ViewKey, CompileResult>
}

const VIEW_ORDER: ViewKey[] = [
  'ast',
  'parse',
  'silRaw',
  'silCanonical',
  'ir',
  'assembly',
]

const VIEW_LABELS: Record<ViewKey, { title: string; subtitle: string }> = {
  silRaw: {
    title: 'SIL Raw',
    subtitle: 'Swift Intermediate Language before canonicalization',
  },
  silCanonical: {
    title: 'SIL Canonical',
    subtitle: 'Canonical SIL after guaranteed optimizations',
  },
  ast: {
    title: 'AST',
    subtitle: 'Swift compiler abstract syntax tree dump',
  },
  parse: {
    title: 'Parse',
    subtitle: 'Parser diagnostics and structure',
  },
  ir: {
    title: 'LLVM IR',
    subtitle: 'LLVM intermediate representation',
  },
  assembly: {
    title: 'Assembly',
    subtitle: 'Target assembly emitted by the compiler',
  },
}

const DEFAULT_SOURCE = `import Foundation

struct Greeter {
    func greet(name: String) -> String {
        "Hello, \(name)!"
    }
}

print(Greeter().greet(name: "Swift"))
`

const formatCommandStatus = (isLoading: boolean, result?: CompileResult) => {
  if (isLoading) {
    return 'Running...'
  }
  if (!result) {
    return 'Command pending'
  }
  return result.exitCode === 0 ? 'Success' : `Exit code ${result.exitCode}`
}

const getLanguageForView = (view: ViewKey) => {
  if (view === 'silRaw' || view === 'silCanonical') {
    return 'swift'
  }
  if (view === 'ir') {
    return 'text' // Using text for LLVM IR for now
  }
  if (view === 'assembly') {
    return 'text' // Using text for assembly for now
  }
  return 'text'
}

function App() {
  const [source, setSource] = useState(DEFAULT_SOURCE)
  const [activeView, setActiveView] = useState<ViewKey>('silRaw')
  const [demangle, setDemangle] = useState(false)
  const [optimize, setOptimize] = useState(false)
  const [wholeModule, setWholeModule] = useState(false)
  const [parseAsLibrary, setParseAsLibrary] = useState(false)
  const [autoRun, setAutoRun] = useState(true)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Record<ViewKey, CompileResult> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastRunSignature = useRef<string | null>(null)
  const hasBootstrapped = useRef(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  const runDisabled = loading || source.trim().length === 0

  const activeResult = useMemo(() => {
    if (!results) {
      return undefined
    }
    return results[activeView]
  }, [activeView, results])

  const runCompile = useCallback(
    async ({ skipCache = false }: { skipCache?: boolean } = {}) => {
      const trimmedSource = source.trim()
      if (!trimmedSource) {
        lastRunSignature.current = null
        setResults(null)
        setError('Source is required')
        return
      }

      const signature = JSON.stringify({
        source: trimmedSource,
        demangle,
        optimize,
        moduleOptimize: wholeModule,
        parseAsLibrary,
      })

      if (!skipCache && lastRunSignature.current === signature) {
        return
      }

      lastRunSignature.current = signature
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/compile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            source: trimmedSource,
            demangle,
            optimize,
            moduleOptimize: wholeModule,
            parseAsLibrary,
          }),
        })

        if (!response.ok) {
          const message = await response.text()
          throw new Error(message || `Request failed with ${response.status}`)
        }

        const payload = (await response.json()) as CompileResponse
        setResults(payload.results)
      } catch (err) {
        lastRunSignature.current = null
        const message = err instanceof Error ? err.message : 'Unexpected error'
        setError(message)
      } finally {
        setLoading(false)
      }
    },
    [source, demangle, optimize, wholeModule, parseAsLibrary],
  )

  useEffect(() => {
    if (!autoRun) {
      return
    }
    if (source.trim().length === 0) {
      return
    }
    const handle = window.setTimeout(() => {
      runCompile()
    }, 600)

    return () => window.clearTimeout(handle)
  }, [autoRun, source, demangle, optimize, wholeModule, parseAsLibrary, runCompile])

  useEffect(() => {
    if (hasBootstrapped.current) {
      return
    }
    hasBootstrapped.current = true
    runCompile({ skipCache: true })
  }, [runCompile])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const resetToSample = () => {
    setSource(DEFAULT_SOURCE)
  }

  return (
    <div className="app-shell">
      <div className="controls-bar">
        <div className="app-title">Swift Inspector</div>
        <div className="tabs">
          {VIEW_ORDER.map((view) => {
            const result = results?.[view]
            const isActive = view === activeView
            return (
              <button
                key={view}
                type="button"
                className={`tab ${isActive ? 'active' : ''}`}
                onClick={() => setActiveView(view)}
              >
                <span>{VIEW_LABELS[view].title}</span>
                {result && result.exitCode !== 0 && <span className="tab-alert">!</span>}
              </button>
            )
          })}
        </div>
        <div className="control-actions">
          <label className="toggle">
            <input
              type="checkbox"
              checked={autoRun}
              onChange={(event) => setAutoRun(event.target.checked)}
            />
            <span className="indicator" />
            <span className="label-text">Auto</span>
          </label>
          <button
            className="icon-button"
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label="Help"
          >
            <i className="fa-solid fa-circle-question"></i>
          </button>
          <div className="settings-dropdown" ref={settingsRef}>
            <button
              className="icon-button"
              type="button"
              onClick={() => setSettingsOpen(!settingsOpen)}
              aria-label="Settings"
            >
              <i className="fa-solid fa-gear"></i>
            </button>
            {settingsOpen && (
              <div className="settings-panel">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={demangle}
                    onChange={(event) => setDemangle(event.target.checked)}
                  />
                  <span className="indicator" />
                  <span className="label-text">Demangle</span>
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={optimize}
                    onChange={(event) => setOptimize(event.target.checked)}
                  />
                  <span className="indicator" />
                  <span className="label-text">Optimize (-O)</span>
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={wholeModule}
                    onChange={(event) => setWholeModule(event.target.checked)}
                  />
                  <span className="indicator" />
                  <span className="label-text">Whole module</span>
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={parseAsLibrary}
                    onChange={(event) => setParseAsLibrary(event.target.checked)}
                  />
                  <span className="indicator" />
                  <span className="label-text">Parse as library</span>
                </label>
              </div>
            )}
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={resetToSample}
            disabled={loading}
            aria-label="Load sample"
          >
            <i className="fa-solid fa-file-code"></i>
          </button>
          <button
            className="icon-button primary"
            type="button"
            onClick={() => runCompile({ skipCache: true })}
            disabled={runDisabled}
            aria-label="Run compiler"
          >
            {loading ? <div className="spinner" /> : <i className="fa-solid fa-play"></i>}
          </button>
        </div>
      </div>

      {helpOpen && (
        <div className="help-modal-overlay" onClick={() => setHelpOpen(false)}>
          <div className="help-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setHelpOpen(false)}>
              &times;
            </button>
            <h2>About Swift Inspector</h2>
            <p>
              This tool allows you to inspect the various compilation stages of the Swift compiler,
              providing insight into how your Swift code is transformed into machine-readable
              instructions.
            </p>
            <h3>How to Use</h3>
            <ul>
              <li>
                Write your Swift code in the <strong>Swift Source</strong> panel on the left.
              </li>
              <li>
                The compiler will automatically run if <strong>Auto</strong> is enabled. You can
                also trigger it manually with the Play button.
              </li>
              <li>
                Select the different compiler outputs using the tabs at the top (e.g., AST, SIL
                Raw, LLVM IR).
              </li>
              <li>
                Use the <strong>Settings</strong> (gear icon) to toggle compiler flags like
                optimizations (`-O`) and demangling.
              </li>
              <li>
                Click <strong>Load Sample</strong> to reset the editor to the default example
                code.
              </li>
            </ul>
            <h3>What is SIL?</h3>
            <p>
              SIL (Swift Intermediate Language) is a high-level, Swift-specific intermediate
              language that is used by the Swift compiler for flow-sensitive diagnostics, and for
              performing high-level, language-specific optimizations.
            </p>
          </div>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      <main className="workspace">
        <section className="panel editor-panel">
          <div className="panel-header">
            <div>
              <h2>Swift source</h2>
            </div>
          </div>
          <div className="editor-container">
            <Editor
              language="swift"
              theme="vs-dark"
              value={source}
              onChange={(value) => setSource(value ?? '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        </section>

        <section className="panel output-panel">
          <div className="panel-header">
            <div>
              <h2>{VIEW_LABELS[activeView].title}</h2>
              <p className="tab-description">{VIEW_LABELS[activeView].subtitle}</p>
            </div>
            <div className="status-chip">{formatCommandStatus(loading, activeResult)}</div>
          </div>

          <div className="editor-container">
            <Editor
              language={getLanguageForView(activeView)}
              theme="vs-dark"
              value={activeResult?.output ?? 'Run the compiler to view output.'}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                readOnly: true,
                wordWrap: 'off',
              }}
            />
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>
          <a href="https://rasyid.codes" target="_blank" rel="noopener noreferrer">
            Made with ♥ by Me
          </a>{' '}
          &bull;{' '}
          <a href="https://github.com/annurdien/swift-inspector" target="_blank" rel="noopener noreferrer">
            Source Code
          </a>
        </p>
      </footer>
    </div>
  )
}

export default App
