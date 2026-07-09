import {
  Archive,
  CalendarClock,
  Check,
  Clipboard,
  Database,
  Download,
  FileText,
  FolderLock,
  ListFilter,
  LogOut,
  Plus,
  Search,
  Settings,
  Shield,
  SquarePen,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import type { FormEvent, ReactNode } from 'react'
import type { AnswerRecord, AppData, AppUser, DocumentItem, GrantLead, GrantStatus, Priority, TaskItem } from './types'
import {
  createAccount as createLocalAccount,
  getCurrentUser,
  loadWorkspaceData,
  normalizeGrant,
  saveWorkspaceData as saveLocalWorkspaceData,
  signIn as signInLocal,
  signOut as signOutLocal,
} from './lib/localStore'
import {
  createSupabaseAccount,
  getSupabaseCurrentUser,
  isSupabaseConfigured,
  loadSupabaseData,
  saveSupabaseData,
  signInSupabase,
  signOutSupabase,
} from './lib/supabaseStore'

const statuses: GrantStatus[] = [
  'Prospect',
  'Researching',
  'Ready',
  'In progress',
  'Submitted',
  'Awarded',
  'Not a fit',
  'Watchlist',
  'Closed',
]

const priorities: Priority[] = ['High', 'Medium', 'Low']
const deadlineStatusOptions: GrantLead['deadlineStatus'][] = ['Open', 'Due soon', 'Rolling', 'Watch', 'Closed']

function App() {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<AppUser | null>(() => (isSupabaseConfigured() ? null : getCurrentUser()))
  const [data, setData] = useState<AppData | null>(() => {
    if (isSupabaseConfigured()) return null
    const currentUser = getCurrentUser()
    return currentUser ? loadWorkspaceData(currentUser.workspaceId) : null
  })
  const [activeView, setActiveView] = useState<'grants' | 'answers' | 'documents' | 'tasks' | 'settings'>('grants')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    let canceled = false

    async function boot() {
      if (isSupabaseConfigured()) {
        const remoteUser = await getSupabaseCurrentUser()
        if (!canceled && remoteUser) {
          setUser(remoteUser)
          setData(await loadSupabaseData(remoteUser.workspaceId))
        }
      }
      if (!canceled) setLoading(false)
    }

    void boot().catch((error) => {
      console.error(error)
      if (!canceled) setLoading(false)
    })

    return () => {
      canceled = true
    }
  }, [])

  useEffect(() => {
    let canceled = false

    async function loadData() {
      if (!user) {
        setData(null)
        return
      }

      if (user.mode === 'supabase') {
        const remoteData = await loadSupabaseData(user.workspaceId)
        if (!canceled) setData(remoteData)
      } else {
        setData(loadWorkspaceData(user.workspaceId))
      }
    }

    void loadData().catch((error) => {
      console.error(error)
      setSaveError(error instanceof Error ? error.message : 'Could not load workspace.')
    })

    return () => {
      canceled = true
    }
  }, [user])

  function commit(nextData: AppData) {
    setData(nextData)
    setSaveError('')
    if (user?.mode === 'supabase') {
      void saveSupabaseData(nextData).catch((error) => {
        console.error(error)
        setSaveError(error instanceof Error ? error.message : 'Could not save workspace.')
      })
    } else {
      saveLocalWorkspaceData(nextData)
    }
  }

  if (loading) {
    return <main className="loading-shell">Loading workspace...</main>
  }

  if (!user || !data) {
    return <AuthScreen onAuthenticated={setUser} />
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <FolderLock size={20} />
          </div>
          <div>
            <strong>Grant Dashboard</strong>
            <span>{data.workspace.name}</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Workspace sections">
          <NavButton
            active={activeView === 'grants'}
            icon={<Database size={18} />}
            label="Grants"
            onClick={() => setActiveView('grants')}
          />
          <NavButton
            active={activeView === 'answers'}
            icon={<Archive size={18} />}
            label="Answer Bank"
            onClick={() => setActiveView('answers')}
          />
          <NavButton
            active={activeView === 'documents'}
            icon={<FileText size={18} />}
            label="Documents"
            onClick={() => setActiveView('documents')}
          />
          <NavButton
            active={activeView === 'tasks'}
            icon={<CalendarClock size={18} />}
            label="Tasks"
            onClick={() => setActiveView('tasks')}
          />
          <NavButton
            active={activeView === 'settings'}
            icon={<Settings size={18} />}
            label="Settings"
            onClick={() => setActiveView('settings')}
          />
        </nav>

        <div className="sidebar-footer">
          <div>
            <span>Signed in</span>
            <strong>{user.email}</strong>
          </div>
          <button
            className="icon-button"
            title="Sign out"
            onClick={() => {
              void (user.mode === 'supabase' ? signOutSupabase() : Promise.resolve(signOutLocal())).finally(() => {
                setUser(null)
              })
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Grant prospecting workspace</p>
            <h1>{viewTitle(activeView)}</h1>
          </div>
          <div className="sync-pill">
            <Shield size={16} />
            <span>{user.mode === 'supabase' ? 'Shared Supabase account' : 'Local password account'}</span>
          </div>
        </header>

        {saveError && <div className="save-error">{saveError}</div>}

        {activeView === 'grants' && <GrantDashboard data={data} commit={commit} />}
        {activeView === 'answers' && <AnswerBank data={data} commit={commit} />}
        {activeView === 'documents' && <DocumentsView data={data} commit={commit} />}
        {activeView === 'tasks' && <TasksView data={data} commit={commit} />}
        {activeView === 'settings' && <SettingsView data={data} commit={commit} />}
      </section>
    </main>
  )
}

function viewTitle(view: string) {
  switch (view) {
    case 'answers':
      return 'Answer Bank'
    case 'documents':
      return 'Document Library'
    case 'tasks':
      return 'Task Queue'
    case 'settings':
      return 'Workspace Settings'
    default:
      return 'Grant Pipeline'
  }
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button className={active ? 'nav-button active' : 'nav-button'} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: AppUser) => void }) {
  const [mode, setMode] = useState<'signin' | 'create'>('create')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const nextUser =
        mode === 'create'
          ? isSupabaseConfigured()
            ? await createSupabaseAccount(email, password, displayName, workspaceName)
            : await createLocalAccount(email, password, displayName, workspaceName)
          : isSupabaseConfigured()
            ? await signInSupabase(email, password)
            : await signInLocal(email, password)
      onAuthenticated(nextUser)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.')
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand">
          <div className="brand-mark">
            <FolderLock size={22} />
          </div>
          <div>
            <h1>Grant Dashboard</h1>
            <p>{isSupabaseConfigured() ? 'Password-protected shared workspaces' : 'Password-protected local workspaces'}</p>
          </div>
        </div>

        <div className="segmented">
          <button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>
            Create
          </button>
          <button className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>
            Sign in
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
            />
          </label>
          {mode === 'create' && (
            <>
              <label>
                Name
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </label>
              <label>
                Workspace
                <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
              </label>
            </>
          )}
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" type="submit">
            <Shield size={18} />
            {mode === 'create' ? 'Create workspace' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}

function GrantDashboard({ data, commit }: { data: AppData; commit: (data: AppData) => void }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<GrantStatus | ''>('')
  const [priorityFilter, setPriorityFilter] = useState<Priority | ''>('')
  const [deadlineStatusFilter, setDeadlineStatusFilter] = useState<GrantLead['deadlineStatus'] | ''>('')
  const [selectedId, setSelectedId] = useState(data.grants[0]?.id || '')
  const [draftGrant, setDraftGrant] = useState<Partial<GrantLead>>({})
  const selectedGrant = data.grants.find((grant) => grant.id === selectedId) || data.grants[0]

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return data.grants
      .filter((grant) => {
        const haystack = [
          grant.funder,
          grant.grantName,
          grant.category,
          grant.geography,
          grant.fitReason,
          grant.eligibility,
          grant.tags.join(' '),
        ]
          .join(' ')
          .toLowerCase()
        return !needle || haystack.includes(needle)
      })
      .filter((grant) => !statusFilter || grant.status === statusFilter)
      .filter((grant) => !priorityFilter || grant.priority === priorityFilter)
      .filter((grant) => !deadlineStatusFilter || grant.deadlineStatus === deadlineStatusFilter)
      .sort((a, b) => b.fitScore - a.fitScore || priorityRank(a.priority) - priorityRank(b.priority))
  }, [data.grants, deadlineStatusFilter, priorityFilter, query, statusFilter])

  function upsertGrant(event: FormEvent) {
    event.preventDefault()
    const grant = normalizeGrant(draftGrant)
    if (!grant.funder || !grant.grantName) return
    const exists = data.grants.some((item) => item.id === grant.id)
    const nextGrants = exists ? data.grants.map((item) => (item.id === grant.id ? grant : item)) : [grant, ...data.grants]
    commit({ ...data, grants: nextGrants })
    setDraftGrant({})
    setSelectedId(grant.id)
  }

  function updateGrant(id: string, patch: Partial<GrantLead>) {
    commit({
      ...data,
      grants: data.grants.map((grant) =>
        grant.id === id ? { ...grant, ...patch, updatedAt: new Date().toISOString().slice(0, 10) } : grant,
      ),
    })
  }

  function toggleStatusFilter(status: GrantStatus) {
    setStatusFilter((current) => (current === status ? '' : status))
  }

  function togglePriorityFilter(priority: Priority) {
    setPriorityFilter((current) => (current === priority ? '' : priority))
  }

  function toggleDeadlineStatusFilter(statusOption: GrantLead['deadlineStatus']) {
    setDeadlineStatusFilter((current) => (current === statusOption ? '' : statusOption))
  }

  return (
    <div className="content-grid grants-grid">
      <section className="panel pipeline-panel">
        <div className="stats-row">
          <Metric label="Total" value={data.grants.length.toString()} />
          <Metric label="High priority" value={data.grants.filter((grant) => grant.priority === 'High').length.toString()} />
          <Metric label="Ready" value={data.grants.filter((grant) => grant.status === 'Ready').length.toString()} />
          <Metric label="Due soon" value={data.grants.filter((grant) => grant.deadlineStatus === 'Due soon').length.toString()} />
        </div>

        <div className="toolbar">
          <label className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search grants" />
          </label>
          <div className="filter-stack">
            <FilterGroup active={Boolean(statusFilter)} label="Status" onClear={() => setStatusFilter('')}>
              {statuses.map((status) => (
                <button
                  key={status}
                  className={statusFilter === status ? 'filter-chip active' : 'filter-chip'}
                  type="button"
                  onClick={() => toggleStatusFilter(status)}
                >
                  {status}
                </button>
              ))}
            </FilterGroup>
            <FilterGroup active={Boolean(priorityFilter)} label="Priority" onClear={() => setPriorityFilter('')}>
              {priorities.map((priority) => (
                <button
                  key={priority}
                  className={priorityFilter === priority ? 'filter-chip active' : 'filter-chip'}
                  type="button"
                  onClick={() => togglePriorityFilter(priority)}
                >
                  {priority}
                </button>
              ))}
            </FilterGroup>
            <FilterGroup active={Boolean(deadlineStatusFilter)} label="Deadline status" onClear={() => setDeadlineStatusFilter('')}>
              {deadlineStatusOptions.map((statusOption) => (
                <button
                  key={statusOption}
                  className={deadlineStatusFilter === statusOption ? 'filter-chip active' : 'filter-chip'}
                  type="button"
                  onClick={() => toggleDeadlineStatusFilter(statusOption)}
                >
                  {statusOption}
                </button>
              ))}
            </FilterGroup>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Funder</th>
                <th>Grant</th>
                <th>Deadline</th>
                <th>Priority</th>
                <th>Fit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((grant) => (
                <tr
                  key={grant.id}
                  className={selectedGrant?.id === grant.id ? 'selected' : ''}
                  onClick={() => setSelectedId(grant.id)}
                >
                  <td>{grant.funder}</td>
                  <td>
                    <strong>{grant.grantName}</strong>
                    <span>{grant.category}</span>
                  </td>
                  <td>
                    <strong>{formatDeadline(grant)}</strong>
                    <span>{grant.deadlineStatus}</span>
                  </td>
                  <td>
                    <PriorityBadge priority={grant.priority} />
                  </td>
                  <td>{grant.fitScore}</td>
                  <td>
                    <select
                      value={grant.status}
                      onChange={(event) => updateGrant(grant.id, { status: event.target.value as GrantStatus })}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {statuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    No grants match this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="panel detail-panel">
        {selectedGrant ? (
          <>
            <div className="detail-heading">
              <div>
                <p className="eyebrow">{selectedGrant.funder}</p>
                <h2>{selectedGrant.grantName}</h2>
              </div>
              <button className="icon-button" title="Edit grant" onClick={() => setDraftGrant(selectedGrant)}>
                <SquarePen size={18} />
              </button>
            </div>
            <div className="detail-stack">
              <Detail label="Amount" value={selectedGrant.amount} />
              <Detail label="Deadline" value={formatDeadline(selectedGrant)} />
              <Detail label="Deadline note" value={selectedGrant.deadlineLabel} />
              <Detail label="Deadline status" value={selectedGrant.deadlineStatus} />
              <Detail label="Geography" value={selectedGrant.geography} />
              <Detail label="Eligibility" value={selectedGrant.eligibility} />
              <Detail label="Why it fits" value={selectedGrant.fitReason} />
              <Detail label="Next action" value={selectedGrant.nextAction} />
              <Detail label="Notes" value={selectedGrant.notes} />
              {selectedGrant.sourceUrl && (
                <a className="source-link" href={selectedGrant.sourceUrl} target="_blank" rel="noreferrer">
                  {selectedGrant.sourceLabel || selectedGrant.sourceUrl}
                </a>
              )}
            </div>
          </>
        ) : (
          <p className="empty-state">Add or import grants to begin.</p>
        )}

        <form className="stacked-form" onSubmit={upsertGrant}>
          <h3>{draftGrant.id ? 'Edit grant' : 'Add grant'}</h3>
          <input
            placeholder="Funder"
            value={draftGrant.funder || ''}
            onChange={(event) => setDraftGrant({ ...draftGrant, funder: event.target.value })}
          />
          <input
            placeholder="Grant name"
            value={draftGrant.grantName || ''}
            onChange={(event) => setDraftGrant({ ...draftGrant, grantName: event.target.value })}
          />
          <div className="form-row">
            <input
              placeholder="Amount"
              value={draftGrant.amount || ''}
              onChange={(event) => setDraftGrant({ ...draftGrant, amount: event.target.value })}
            />
            <input
              aria-label="Deadline date and time"
              type="datetime-local"
              value={toDeadlineInputValue(draftGrant.deadline || '')}
              onChange={(event) => setDraftGrant({ ...draftGrant, deadline: event.target.value, deadlineLabel: '' })}
            />
          </div>
          <div className="form-row">
            <select
              aria-label="Deadline status"
              value={draftGrant.deadlineStatus || 'Watch'}
              onChange={(event) =>
                setDraftGrant({ ...draftGrant, deadlineStatus: event.target.value as GrantLead['deadlineStatus'] })
              }
            >
              {deadlineStatusOptions.map((statusOption) => (
                <option key={statusOption}>{statusOption}</option>
              ))}
            </select>
            <select
              aria-label="Priority"
              value={draftGrant.priority || 'Medium'}
              onChange={(event) => setDraftGrant({ ...draftGrant, priority: event.target.value as Priority })}
            >
              {priorities.map((priority) => (
                <option key={priority}>{priority}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <input
              type="number"
              min="0"
              max="100"
              placeholder="Fit score"
              value={draftGrant.fitScore ?? ''}
              onChange={(event) => setDraftGrant({ ...draftGrant, fitScore: Number(event.target.value) })}
            />
          </div>
          <textarea
            placeholder="Why it fits"
            value={draftGrant.fitReason || ''}
            onChange={(event) => setDraftGrant({ ...draftGrant, fitReason: event.target.value })}
          />
          <textarea
            placeholder="Next action"
            value={draftGrant.nextAction || ''}
            onChange={(event) => setDraftGrant({ ...draftGrant, nextAction: event.target.value })}
          />
          <button className="primary-button" type="submit">
            <Plus size={17} />
            Save grant
          </button>
        </form>
      </aside>
    </div>
  )
}

function FilterGroup({
  active,
  children,
  label,
  onClear,
}: {
  active: boolean
  children: ReactNode
  label: string
  onClear: () => void
}) {
  return (
    <div className="filter-group">
      <div className="filter-label">
        <ListFilter size={15} />
        <span>{label}</span>
      </div>
      <div className="filter-chips">{children}</div>
      <button className="clear-filter" disabled={!active} type="button" onClick={onClear}>
        Clear
      </button>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="detail-item">
      <span>{label}</span>
      <p>{value}</p>
    </div>
  )
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`priority ${priority.toLowerCase()}`}>{priority}</span>
}

function formatDeadline(grant: GrantLead) {
  const exactDeadline = formatDeadlineValue(grant.deadline)
  if (exactDeadline) return exactDeadline
  if (grant.deadlineStatus === 'Rolling') return 'Rolling'
  if (grant.deadlineStatus === 'Closed') return 'Closed; date not recorded'
  return 'Deadline not published'
}

function formatDeadlineValue(value: string) {
  if (!value) return ''
  const hasTime = /T\d{2}:\d{2}/.test(value)
  const date = new Date(hasTime ? value : `${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value

  const datePart = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)

  if (!hasTime) return `${datePart} (time not listed)`

  const timePart = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)

  return `${datePart}, ${timePart}`
}

function toDeadlineInputValue(value: string) {
  if (!value) return ''
  const date = new Date(/T\d{2}:\d{2}/.test(value) ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''

  const pad = (part: number) => part.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function priorityRank(priority: Priority) {
  return priority === 'High' ? 0 : priority === 'Medium' ? 1 : 2
}

function AnswerBank({ data, commit }: { data: AppData; commit: (data: AppData) => void }) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [draft, setDraft] = useState<Partial<AnswerRecord>>({})

  const questionTypes = useMemo(
    () => ['All', ...Array.from(new Set(data.answers.map((answer) => answer.questionType))).sort()],
    [data.answers],
  )

  const answers = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return data.answers
      .filter((answer) => typeFilter === 'All' || answer.questionType === typeFilter)
      .filter((answer) => {
        const haystack = [
          answer.questionType,
          answer.exactQuestion,
          answer.funder,
          answer.grantName,
          answer.finalAnswer,
          answer.tags.join(' '),
        ]
          .join(' ')
          .toLowerCase()
        return !needle || haystack.includes(needle)
      })
      .sort((a, b) => a.questionType.localeCompare(b.questionType) || a.funder.localeCompare(b.funder))
  }, [data.answers, query, typeFilter])

  function saveAnswer(event: FormEvent) {
    event.preventDefault()
    if (!draft.questionType || !draft.finalAnswer) return
    const answer: AnswerRecord = {
      id: draft.id || crypto.randomUUID(),
      questionType: draft.questionType,
      exactQuestion: draft.exactQuestion || '',
      funder: draft.funder || '',
      grantName: draft.grantName || '',
      wordLimit: draft.wordLimit || '',
      finalAnswer: draft.finalAnswer,
      tags: typeof draft.tags === 'string' ? [] : draft.tags || [],
      lastUsed: draft.lastUsed || '',
      quality: draft.quality || 'Draft',
      createdAt: draft.createdAt || new Date().toISOString().slice(0, 10),
    }
    const exists = data.answers.some((item) => item.id === answer.id)
    commit({
      ...data,
      answers: exists ? data.answers.map((item) => (item.id === answer.id ? answer : item)) : [answer, ...data.answers],
    })
    setDraft({})
  }

  return (
    <div className="content-grid answer-grid">
      <section className="panel">
        <div className="toolbar">
          <label className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search answers" />
          </label>
          <label className="select-control">
            <ListFilter size={17} />
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              {questionTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="answer-list">
          {answers.map((answer) => (
            <article className="answer-item" key={answer.id}>
              <div className="answer-meta">
                <strong>{answer.questionType}</strong>
                <span>{[answer.funder, answer.grantName, answer.wordLimit].filter(Boolean).join(' / ')}</span>
              </div>
              {answer.exactQuestion && <p className="question-text">{answer.exactQuestion}</p>}
              <pre>{answer.finalAnswer}</pre>
              <div className="answer-actions">
                <button className="secondary-button" onClick={() => void navigator.clipboard.writeText(answer.finalAnswer)}>
                  <Clipboard size={16} />
                  Copy
                </button>
                <button className="secondary-button" onClick={() => setDraft(answer)}>
                  <SquarePen size={16} />
                  Edit
                </button>
              </div>
            </article>
          ))}
          {!answers.length && <p className="empty-state">No saved answers yet.</p>}
        </div>
      </section>

      <aside className="panel">
        <form className="stacked-form" onSubmit={saveAnswer}>
          <h3>{draft.id ? 'Edit answer' : 'Add answer'}</h3>
          <input
            placeholder="Question type"
            value={draft.questionType || ''}
            onChange={(event) => setDraft({ ...draft, questionType: event.target.value })}
          />
          <input
            placeholder="Exact question"
            value={draft.exactQuestion || ''}
            onChange={(event) => setDraft({ ...draft, exactQuestion: event.target.value })}
          />
          <div className="form-row">
            <input
              placeholder="Funder"
              value={draft.funder || ''}
              onChange={(event) => setDraft({ ...draft, funder: event.target.value })}
            />
            <input
              placeholder="Grant"
              value={draft.grantName || ''}
              onChange={(event) => setDraft({ ...draft, grantName: event.target.value })}
            />
          </div>
          <input
            placeholder="Word limit"
            value={draft.wordLimit || ''}
            onChange={(event) => setDraft({ ...draft, wordLimit: event.target.value })}
          />
          <textarea
            className="large-textarea"
            placeholder="Verbatim final answer"
            value={draft.finalAnswer || ''}
            onChange={(event) => setDraft({ ...draft, finalAnswer: event.target.value })}
          />
          <button className="primary-button" type="submit">
            <Plus size={17} />
            Save answer
          </button>
        </form>
      </aside>
    </div>
  )
}

function DocumentsView({ data, commit }: { data: AppData; commit: (data: AppData) => void }) {
  function updateDocument(id: string, patch: Partial<DocumentItem>) {
    commit({ ...data, documents: data.documents.map((document) => (document.id === id ? { ...document, ...patch } : document)) })
  }

  function addDocument() {
    const document: DocumentItem = {
      id: crypto.randomUUID(),
      name: 'New document',
      category: 'General',
      status: 'Needed',
      owner: '',
      notes: '',
    }
    commit({ ...data, documents: [document, ...data.documents] })
  }

  return (
    <section className="panel full-panel">
      <div className="section-header">
        <h2>Documents</h2>
        <button className="primary-button" onClick={addDocument}>
          <Plus size={17} />
          Add
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Status</th>
              <th>Owner</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {data.documents.map((document) => (
              <tr key={document.id}>
                <td>
                  <input value={document.name} onChange={(event) => updateDocument(document.id, { name: event.target.value })} />
                </td>
                <td>
                  <input value={document.category} onChange={(event) => updateDocument(document.id, { category: event.target.value })} />
                </td>
                <td>
                  <select value={document.status} onChange={(event) => updateDocument(document.id, { status: event.target.value as DocumentItem['status'] })}>
                    <option>Ready</option>
                    <option>Needed</option>
                    <option>Drafting</option>
                    <option>Requested</option>
                  </select>
                </td>
                <td>
                  <input value={document.owner} onChange={(event) => updateDocument(document.id, { owner: event.target.value })} />
                </td>
                <td>
                  <input value={document.notes} onChange={(event) => updateDocument(document.id, { notes: event.target.value })} />
                </td>
              </tr>
            ))}
            {!data.documents.length && (
              <tr>
                <td colSpan={5} className="empty-cell">
                  No documents yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function TasksView({ data, commit }: { data: AppData; commit: (data: AppData) => void }) {
  const grantsById = new Map(data.grants.map((grant) => [grant.id, grant]))

  function updateTask(id: string, patch: Partial<TaskItem>) {
    commit({ ...data, tasks: data.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)) })
  }

  function addTask() {
    const task: TaskItem = {
      id: crypto.randomUUID(),
      title: 'New task',
      dueDate: new Date().toISOString().slice(0, 10),
      status: 'Open',
      owner: '',
    }
    commit({ ...data, tasks: [task, ...data.tasks] })
  }

  return (
    <section className="panel full-panel">
      <div className="section-header">
        <h2>Tasks</h2>
        <button className="primary-button" onClick={addTask}>
          <Plus size={17} />
          Add
        </button>
      </div>
      <div className="task-list">
        {data.tasks
          .slice()
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
          .map((task) => (
            <article className="task-item" key={task.id}>
              <button
                className={task.status === 'Done' ? 'check-button done' : 'check-button'}
                title="Toggle done"
                onClick={() => updateTask(task.id, { status: task.status === 'Done' ? 'Open' : 'Done' })}
              >
                <Check size={16} />
              </button>
              <input value={task.title} onChange={(event) => updateTask(task.id, { title: event.target.value })} />
              <span>{task.relatedGrantId ? grantsById.get(task.relatedGrantId)?.grantName : ''}</span>
              <input type="date" value={task.dueDate} onChange={(event) => updateTask(task.id, { dueDate: event.target.value })} />
              <input value={task.owner} placeholder="Owner" onChange={(event) => updateTask(task.id, { owner: event.target.value })} />
            </article>
          ))}
        {!data.tasks.length && <p className="empty-state">No tasks yet.</p>}
      </div>
    </section>
  )
}

function SettingsView({ data, commit }: { data: AppData; commit: (data: AppData) => void }) {
  const [importText, setImportText] = useState('')
  const [message, setMessage] = useState('')

  function updateWorkspace(patch: Partial<AppData['workspace']>) {
    commit({ ...data, workspace: { ...data.workspace, ...patch } })
  }

  function exportWorkspace() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${data.workspace.name || 'grant-dashboard'}-export.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function importWorkspace() {
    setMessage('')
    try {
      const parsed = JSON.parse(importText)
      const grants = Array.isArray(parsed) ? parsed : parsed.grants
      const answers = Array.isArray(parsed.answers) ? parsed.answers : []
      const documents = Array.isArray(parsed.documents) ? parsed.documents : []
      const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : []

      if (!Array.isArray(grants)) {
        throw new Error('Import JSON must be an array of grants or an object with a grants array.')
      }

      commit({
        ...data,
        grants: [...grants.map((grant) => normalizeGrant(grant)), ...data.grants],
        answers: [...answers, ...data.answers],
        documents: [...documents, ...data.documents],
        tasks: [...tasks, ...data.tasks],
      })
      setImportText('')
      setMessage(`Imported ${grants.length} grants${answers.length ? ` and ${answers.length} answers` : ''}.`)
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Import failed.')
    }
  }

  return (
    <div className="content-grid settings-grid">
      <section className="panel">
        <h2>Workspace</h2>
        <div className="stacked-form">
          <label>
            Name
            <input value={data.workspace.name} onChange={(event) => updateWorkspace({ name: event.target.value })} />
          </label>
          <label>
            Mission
            <textarea value={data.workspace.mission} onChange={(event) => updateWorkspace({ mission: event.target.value })} />
          </label>
          <label>
            Service area
            <input value={data.workspace.serviceArea} onChange={(event) => updateWorkspace({ serviceArea: event.target.value })} />
          </label>
          <label>
            Notes
            <textarea value={data.workspace.profileNotes} onChange={(event) => updateWorkspace({ profileNotes: event.target.value })} />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Import / Export</h2>
        <div className="stacked-form">
          <textarea
            className="large-textarea"
            value={importText}
            placeholder='Paste JSON: [{"funder":"...","grantName":"..."}]'
            onChange={(event) => setImportText(event.target.value)}
          />
          {message && <p className="form-note">{message}</p>}
          <div className="button-row">
            <button className="primary-button" onClick={importWorkspace}>
              <Upload size={17} />
              Import
            </button>
            <button className="secondary-button" onClick={exportWorkspace}>
              <Download size={17} />
              Export
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default App
