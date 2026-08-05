import React, { useState } from 'react'
import axios from 'axios'
import { FiPlay, FiSave, FiCode, FiTerminal, FiAlertCircle, FiRefreshCw, FiClock } from 'react-icons/fi'
import {
  PageHeader, Stack, Grid, Card, Table, Badge, Button, Input, Textarea, Field,
  Row, DefinitionList, EmptyState, Skeleton,
} from '@open-family/ui'
import { useApi } from '../hooks/useApi'
import { fmtNum } from '../theme/format'

const API = import.meta.env.VITE_API_URL || ''

// Prefer filters that match typical smoke / demo traffic so Example N → Run shows rows.
const EXAMPLES = [
  `SELECT count(), avg(duration_ms) FROM spans GROUP BY service SINCE 1h`,
  `SELECT count() FROM logs GROUP BY level, service SINCE 24h`,
  `SELECT count() FROM rum GROUP BY route SINCE 24h LIMIT 25`,
  `SELECT avg(value) FROM metrics WHERE metric_name = 'nodejs.eventloop.utilization' GROUP BY service SINCE 1h`,
]

const SIGNALS = ['spans', 'metrics', 'logs', 'rum']

export default function QueryExplorer() {
  const [q, setQ] = useState(EXAMPLES[0])
  const [result, setResult] = useState({ data: null, loading: false, error: null })
  const [saveName, setSaveName] = useState('')
  const saved = useApi('/api/tql/saved', {}, { noRange: true })
  const attrs = useApi('/api/tql/attrs', {}, { noRange: true })

  const run = async (asDry) => {
    setResult((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await axios.post(`${API}/api/tql/query`, { query: q, dry_run: !!asDry })
      setResult({ data: res.data, loading: false, error: null })
    } catch (e) {
      setResult({
        data: null,
        loading: false,
        error: e.response?.data || e.message || 'Request failed',
      })
    }
  }

  const save = async () => {
    if (!saveName.trim() || !q.trim()) return
    try {
      await axios.post(`${API}/api/tql/saved`, { name: saveName.trim(), query: q })
      setSaveName('')
      saved.reload?.()
    } catch { /* ignore */ }
  }

  const rows = result.data?.rows || []
  const cols = (result.data?.columns || Object.keys(rows[0] || {})).map((c) => ({
    key: c,
    header: c,
    mono: true,
    render: (r) => (r[c] == null ? '—' : String(r[c])),
  }))
  // Guard null/undefined: JSON.stringify(null) === "null" would fake an error state.
  const errText = result.error == null
    ? null
    : typeof result.error === 'string'
      ? result.error
      : (result.error?.error || JSON.stringify(result.error))

  // The table's state is explicit, so an in-flight run never renders as "no rows".
  const resultState = result.loading
    ? 'loading'
    : errText
      ? 'error'
      : rows.length
        ? 'ready'
        : 'empty'

  // Three distinct emptinesses: nothing run yet, a dry run that compiled but did
  // not execute, and a real run that matched nothing.
  const emptyResult = result.data?.dry_run ? (
    <EmptyState
      inline
      icon={<FiCode />}
      title="Dry run — nothing executed"
      description="The statement compiled. The SQL above is exactly what a real run would send to ClickHouse."
    />
  ) : result.data ? (
    <EmptyState
      inline
      icon={<FiClock />}
      title="No matching rows"
      description="The statement ran and matched nothing. Widening SINCE, or relaxing a WHERE clause, usually resolves this."
    />
  ) : (
    <EmptyState
      inline
      icon={<FiTerminal />}
      title="Nothing has run yet"
      description="SELECT … FROM spans | metrics | logs | rum WHERE … GROUP BY … SINCE 1h. Run the statement above, or start from one of the examples."
    />
  )

  const errorResult = (
    <EmptyState
      inline
      icon={<FiAlertCircle />}
      title="The query did not run"
      description={errText || 'The request did not complete.'}
      actions={<Button icon={<FiRefreshCw />} onClick={() => run(false)}>Run again</Button>}
    />
  )

  const savedList = saved.data?.queries || []

  return (
    <Stack gap="sections">
      <PageHeader
        title="Query explorer"
        description="Query traces, metrics, logs and browser sessions in one place. Every TQL statement compiles to parameterised ClickHouse SQL before it runs."
        meta={[
          { label: 'Signals', value: 'Spans, metrics, logs, browser' },
          { label: 'Saved queries', value: fmtNum(savedList.length) },
        ]}
      />

      <Card
        title="Editor"
        description="A dry run compiles the statement and returns the SQL without executing it."
      >
        <Stack>
          <Field label="TQL statement" htmlFor="opa-tql-editor">
            <Textarea
              id="opa-tql-editor"
              className="oui-mono"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              spellCheck={false}
              rows={5}
            />
          </Field>

          <Row>
            <Button icon={<FiCode />} onClick={() => run(true)}>Dry run</Button>
            <Button variant="primary" icon={<FiPlay />} loading={result.loading} onClick={() => run(false)}>
              Run
            </Button>
            <span className="oui-spacer" />
            <Input
              placeholder="Saved name"
              aria-label="Name for the saved query"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
            />
            <Button icon={<FiSave />} onClick={save} disabled={!saveName.trim() || !q.trim()}>
              Save
            </Button>
          </Row>

          <Row>
            <span className="oui-text-muted oui-text-sm">Start from an example</span>
            {EXAMPLES.map((ex, i) => (
              <Button key={i} size="sm" variant="ghost" onClick={() => setQ(ex)}>
                Example {i + 1}
              </Button>
            ))}
          </Row>
        </Stack>
      </Card>

      <Grid columns={2}>
        <Card
          title="Result"
          description="Rows from the last run, with the SQL the statement compiled to."
          actions={result.data?.dry_run ? <Badge tone="accent">Dry run</Badge> : null}
          footer={result.data?.elapsed_ms != null ? (
            <>
              <span>
                Showing <strong className="oui-num">{fmtNum(rows.length)}</strong> of{' '}
                <strong className="oui-num">{fmtNum(result.data.row_count || 0)}</strong> rows
              </span>
              <span className="oui-text-muted">
                {result.data.signal} · <span className="oui-num">{fmtNum(result.data.elapsed_ms)}</span> ms
              </span>
            </>
          ) : null}
        >
          <Stack>
            {result.data?.sql && (
              <pre className="oui-code" style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                {result.data.sql}
              </pre>
            )}

            {cols.length > 0 ? (
              <Table
                aria-label="Query result"
                state={resultState}
                columns={cols}
                rows={rows}
                getRowKey={(_, i) => String(i)}
                emptyState={emptyResult}
                errorState={errorResult}
              />
            ) : resultState === 'loading' ? (
              <Stack>
                <Skeleton />
                <Skeleton width="80%" />
                <Skeleton width="60%" />
              </Stack>
            ) : resultState === 'error' ? (
              errorResult
            ) : (
              emptyResult
            )}
          </Stack>
        </Card>

        <Stack>
          <Card title="Attributes" description="The label keys each signal reports, usable in WHERE and GROUP BY.">
            {attrs.loading ? (
              <Stack>
                <Skeleton width="40%" />
                <Skeleton />
                <Skeleton width="70%" />
              </Stack>
            ) : attrs.error ? (
              <EmptyState
                inline
                icon={<FiAlertCircle />}
                title="Attributes failed to load"
                description={String(attrs.error)}
                actions={<Button icon={<FiRefreshCw />} onClick={attrs.reload}>Retry</Button>}
              />
            ) : (
              <DefinitionList
                items={SIGNALS.map((sig) => {
                  const keys = attrs.data?.[sig] || []
                  return {
                    term: sig,
                    value: keys.length
                      ? <Row>{keys.map((a) => <Badge key={a} className="oui-mono">{a}</Badge>)}</Row>
                      : <span className="oui-text-muted oui-text-sm">None reported</span>,
                  }
                })}
              />
            )}
          </Card>

          <Card title="Saved queries" description="Statements saved on this project. Selecting one loads it into the editor.">
            {saved.loading ? (
              <Stack>
                <Skeleton width="60%" />
                <Skeleton width="45%" />
              </Stack>
            ) : savedList.length === 0 ? (
              <EmptyState
                inline
                icon={<FiSave />}
                title="No saved queries yet"
                description="Name a statement in the editor and save it to keep it here."
              />
            ) : (
              <Row>
                {savedList.map((s, i) => (
                  <Button
                    key={s.query_id ?? i}
                    variant="ghost"
                    size="sm"
                    onClick={() => setQ(s.query_text || s.query || '')}
                  >
                    {s.name || s.query_id}
                  </Button>
                ))}
              </Row>
            )}
          </Card>
        </Stack>
      </Grid>
    </Stack>
  )
}
