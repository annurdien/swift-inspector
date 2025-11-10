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
  'silRaw',
  'silCanonical',
  'ast',
  'parse',
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
    title: 'IR',
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

  const resetToSample = () => {
    setSource(DEFAULT_SOURCE)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>SIL Inspector Web</h1>
          <p>Explore how the Swift compiler transforms your code across every stage.</p>
        </div>
        <div className="header-actions">
          <button className="ghost" type="button" onClick={resetToSample} disabled={loading}>
            Load sample
          </button>
          <button className="primary" type="button" onClick={() => runCompile({ skipCache: true })} disabled={runDisabled}>
            {loading ? 'Running...' : 'Run compiler'}
          </button>
        </div>
      </header>

      <div className="toggle-row">
        <label className="toggle">
          <input
            type="checkbox"
            checked={autoRun}
            onChange={(event) => setAutoRun(event.target.checked)}
          />
          <span className="indicator" />
          <span className="label-text">Auto run on change</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={demangle}
            onChange={(event) => setDemangle(event.target.checked)}
          />
          <span className="indicator" />
          <span className="label-text">Demangle symbols</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={optimize}
            onChange={(event) => setOptimize(event.target.checked)}
          />
          <span className="indicator" />
          <span className="label-text">Enable -O</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={wholeModule}
            onChange={(event) => setWholeModule(event.target.checked)}
          />
          <span className="indicator" />
          <span className="label-text">Whole module optimization</span>
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

      {error && <div className="error-banner">{error}</div>}

      <main className="workspace">
        <section className="panel editor-panel">
          <div className="panel-header">
            <div>
              <h2>Swift source</h2>
              <p>Write Swift here. We stream it directly to swiftc on every run.</p>
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
              <h2>Compiler stages</h2>
              <p>Select a stage to inspect its output and underlying command.</p>
            </div>
            <div className="status-chip">{formatCommandStatus(loading, activeResult)}</div>
          </div>

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

          <div className="tab-description">{VIEW_LABELS[activeView].subtitle}</div>

          <div className="command-bar">
            <span className="command-label">Command</span>
            <code className="command-text">{activeResult?.command ?? 'swiftc - …'}</code>
          </div>

          <div className="output-scroll">
            <pre>{activeResult?.output ?? 'Run the compiler to view output.'}</pre>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
