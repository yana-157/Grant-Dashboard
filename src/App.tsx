import {
  Archive,
  CalendarClock,
  Check,
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
import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import type { FormEvent, ReactNode } from 'react'
import type { AppData, AppUser, DocumentItem, GrantLead, GrantStatus, Priority, TaskItem } from './types'
import { AnswerBank } from './components/AnswerBank'
import { ApplicationWorkspace } from './components/ApplicationWorkspace'
import {
  createAccount as createLocalAccount,
  getCurrentUser,
  loadWorkspaceData,
  normalizeAppData,
  normalizeFolder,
  normalizeGrant,
  saveWorkspaceData as saveLocalWorkspaceData,
  signIn as signInLocal,
  signOut as signOutLocal,
} from './lib/localStore'
import {
  createSupabaseAccount,
  createWorkspaceInvite,
  getSupabaseCurrentUser,
  isSupabaseConfigured,
  loadSupabaseData,
  loadWorkspaceMembers,
  saveSupabaseData,
  signInSupabase,
  signOutSupabase,
} from './lib/supabaseStore'

const statuses: GrantStatus[] = ['Prospect', 'Working', 'Submitted', 'Awarded', 'Not a fit', 'Watchlist']

const priorities: Priority[] = ['High', 'Medium', 'Low']
const deadlineStatusOptions: GrantLead['deadlineStatus'][] = ['Open', 'Due soon', 'Rolling', 'Closed']
const deadlineModeOptions: GrantLead['deadlineStatus'][] = ['Open', 'Rolling', 'Closed']
const unfiledFolderFilter = '__unfiled'
type ActiveView = 'grants' | 'application' | 'answers' | 'documents' | 'tasks' | 'settings'

function App() {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<AppUser | null>(() => (isSupabaseConfigured() ? null : getCurrentUser()))
  const [data, setData] = useState<AppData | null>(() => {
    if (isSupabaseConfigured()) return null
    const currentUser = getCurrentUser()
    return currentUser ? loadWorkspaceData(currentUser.workspaceId) : null
  })
  const [activeView, setActiveView] = useState<ActiveView>('grants')
  const [applicationGrantId, setApplicationGrantId] = useState('')
  const [applicationId, setApplicationId] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved')
  const latestDataRef = useRef<AppData | null>(data)
  const persistedDataRef = useRef<AppData | null>(data)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const inviteToken = new URLSearchParams(window.location.search).get('invite') || ''

  useEffect(() => {
    let canceled = false

    async function boot() {
      if (isSupabaseConfigured()) {
        const remoteUser = await getSupabaseCurrentUser(inviteToken || undefined)
        if (!canceled && remoteUser) {
          setUser(remoteUser)
          if (inviteToken) window.history.replaceState({}, '', window.location.pathname)
        }
        if (!canceled && !remoteUser) setLoading(false)
      } else if (!canceled) {
        setLoading(false)
      }
    }

    void boot().catch((error) => {
      console.error(error)
      if (!canceled) setLoading(false)
    })

    return () => {
      canceled = true
    }
  }, [inviteToken])

  useEffect(() => {
    let canceled = false

    async function loadData() {
      if (!user) {
        setData(null)
        setLoading(false)
        return
      }

      if (user.mode === 'supabase') {
        const remoteData = await loadSupabaseData(user.workspaceId)
        if (!canceled) installLoadedData(remoteData)
      } else {
        const localData = loadWorkspaceData(user.workspaceId)
        if (localData) installLoadedData(localData)
      }
      if (!canceled) setLoading(false)
    }

    void loadData().catch((error) => {
      console.error(error)
      setSaveError(error instanceof Error ? error.message : 'Could not load workspace.')
    })

    return () => {
      canceled = true
    }
  }, [user])

  function installLoadedData(nextData: AppData) {
    latestDataRef.current = nextData
    persistedDataRef.current = nextData
    setData(nextData)
    setSaveState('saved')
  }

  function enqueueRemoteSave() {
    const target = latestDataRef.current
    if (!target) return saveQueueRef.current

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const baseline = persistedDataRef.current
        if (!baseline || baseline === target) return
        await saveSupabaseData(baseline, target)
        persistedDataRef.current = target
        if (latestDataRef.current === target) setSaveState('saved')
      })
      .catch((error) => {
        console.error(error)
        setSaveError(error instanceof Error ? error.message : 'Could not save workspace.')
      })
    return saveQueueRef.current
  }

  function commit(nextData: AppData) {
    latestDataRef.current = nextData
    setData(nextData)
    setSaveError('')
    if (user?.mode === 'supabase') {
      setSaveState('saving')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => void enqueueRemoteSave(), 350)
    } else {
      saveLocalWorkspaceData(nextData)
      persistedDataRef.current = nextData
    }
  }

  function openApplication(grantId: string, requestedApplicationId = '') {
    setApplicationGrantId(grantId)
    setApplicationId(requestedApplicationId)
    setActiveView('application')
  }

  async function signOut() {
    if (user?.mode === 'supabase') {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      await enqueueRemoteSave()
      await signOutSupabase()
    } else {
      signOutLocal()
    }
    setUser(null)
  }

  if (loading) {
    return <main className="loading-shell">Loading workspace...</main>
  }

  if (!user || !data) {
    return <AuthScreen inviteToken={inviteToken} onAuthenticated={setUser} />
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
            active={activeView === 'grants' || activeView === 'application'}
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
            onClick={() => void signOut()}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{viewTitle(activeView)}</h1>
          </div>
          <div className="sync-pill">
            <Shield size={16} />
            <span>
              {user.mode === 'supabase'
                ? saveState === 'saving'
                  ? 'Saving changes...'
                  : 'Saved to shared workspace'
                : 'Saved in this browser'}
            </span>
          </div>
        </header>

        {saveError && <div className="save-error">{saveError}</div>}

        {activeView === 'grants' && <GrantDashboard data={data} commit={commit} onOpenApplication={openApplication} />}
        {activeView === 'application' && (
          <ApplicationWorkspace
            data={data}
            commit={commit}
            grantId={applicationGrantId}
            initialApplicationId={applicationId}
            onBack={() => setActiveView('grants')}
          />
        )}
        {activeView === 'answers' && <AnswerBank data={data} onOpenApplication={openApplication} />}
        {activeView === 'documents' && <DocumentsView data={data} commit={commit} />}
        {activeView === 'tasks' && <TasksView data={data} commit={commit} />}
        {activeView === 'settings' && <SettingsView data={data} user={user} commit={commit} />}
      </section>
    </main>
  )
}

function viewTitle(view: string) {
  switch (view) {
    case 'application':
      return 'Application Workspace'
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
    <button className={active ? 'nav-button active' : 'nav-button'} aria-label={label} title={label} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

function AuthScreen({ inviteToken, onAuthenticated }: { inviteToken: string; onAuthenticated: (user: AppUser) => void }) {
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
            ? await createSupabaseAccount(email, password, displayName, workspaceName, inviteToken || undefined)
            : await createLocalAccount(email, password, displayName, workspaceName)
          : isSupabaseConfigured()
            ? await signInSupabase(email, password, inviteToken || undefined)
            : await signInLocal(email, password)
      if (inviteToken) window.history.replaceState({}, '', window.location.pathname)
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
            <h1>{inviteToken ? 'Join the workspace' : 'Grant Dashboard'}</h1>
            <p>
              {inviteToken
                ? 'Use your own account to collaborate in the shared workspace.'
                : isSupabaseConfigured()
                  ? 'Password-protected shared workspaces'
                  : 'Password-protected local workspaces'}
            </p>
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
              {!inviteToken && (
                <label>
                  Workspace
                  <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
                </label>
              )}
            </>
          )}
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" type="submit">
            <Shield size={18} />
            {inviteToken ? (mode === 'create' ? 'Create account and join' : 'Sign in and join') : mode === 'create' ? 'Create workspace' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}

function GrantDashboard({
  data,
  commit,
  onOpenApplication,
}: {
  data: AppData
  commit: (data: AppData) => void
  onOpenApplication: (grantId: string, applicationId?: string) => void
}) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<GrantStatus | ''>('')
  const [priorityFilter, setPriorityFilter] = useState<Priority | ''>('')
  const [deadlineStatusFilter, setDeadlineStatusFilter] = useState<GrantLead['deadlineStatus'] | ''>('')
  const [folderFilter, setFolderFilter] = useState('')
  const [newFolderLabel, setNewFolderLabel] = useState('')
  const [selectedId, setSelectedId] = useState(data.grants[0]?.id || '')
  const [draftGrant, setDraftGrant] = useState<Partial<GrantLead>>({})
  const selectedGrant = data.grants.find((grant) => grant.id === selectedId) || data.grants[0]
  const folders = data.folders
  const folderById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder.label])), [folders])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return data.grants
      .filter((grant) => {
        const folderLabel = folderById.get(grant.folderId) || ''
        const haystack = [
          grant.funder,
          grant.grantName,
          grant.category,
          folderLabel,
          grant.geography,
          grant.fitReason,
          grant.eligibility,
          grant.tags.join(' '),
        ]
          .join(' ')
          .toLowerCase()
        return !needle || haystack.includes(needle)
      })
      .filter((grant) => !folderFilter || (folderFilter === unfiledFolderFilter ? !grant.folderId : grant.folderId === folderFilter))
      .filter((grant) => !statusFilter || grant.status === statusFilter)
      .filter((grant) => !priorityFilter || grant.priority === priorityFilter)
      .filter((grant) => !deadlineStatusFilter || effectiveDeadlineStatus(grant) === deadlineStatusFilter)
      .sort((a, b) => b.fitScore - a.fitScore || priorityRank(a.priority) - priorityRank(b.priority))
  }, [data.grants, deadlineStatusFilter, folderById, folderFilter, priorityFilter, query, statusFilter])

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

  function createFolder(event: FormEvent) {
    event.preventDefault()
    const folder = normalizeFolder({ label: newFolderLabel })
    if (!folder) return
    const existing = folders.find((item) => item.label.toLowerCase() === folder.label.toLowerCase())
    if (existing) {
      setFolderFilter(existing.id)
      setNewFolderLabel('')
      return
    }

    commit({ ...data, folders: [...folders, folder] })
    setFolderFilter(folder.id)
    setNewFolderLabel('')
  }

  return (
    <div className="content-grid grants-grid">
      <section className="panel pipeline-panel">
        <div className="stats-row">
          <Metric label="Total" value={data.grants.length.toString()} />
          <Metric label="High priority" value={data.grants.filter((grant) => grant.priority === 'High').length.toString()} />
          <Metric label="Working" value={data.grants.filter((grant) => grant.status === 'Working').length.toString()} />
          <Metric label="Due soon" value={data.grants.filter((grant) => effectiveDeadlineStatus(grant) === 'Due soon').length.toString()} />
        </div>

        <div className="toolbar">
          <label className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search grants" />
          </label>
          <div className="filter-row">
            <label className="select-control">
              <ListFilter size={17} />
              <span className="filter-select-label">Progress</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as GrantStatus | '')}>
                <option value="">All progress</option>
                {statuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label className="select-control">
              <ListFilter size={17} />
              <span className="filter-select-label">Priority</span>
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as Priority | '')}>
                <option value="">All priorities</option>
                {priorities.map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </select>
            </label>
            <label className="select-control">
              <ListFilter size={17} />
              <span className="filter-select-label">Deadline</span>
              <select
                value={deadlineStatusFilter}
                onChange={(event) => setDeadlineStatusFilter(event.target.value as GrantLead['deadlineStatus'] | '')}
              >
                <option value="">All deadlines</option>
                {deadlineStatusOptions.map((statusOption) => (
                  <option key={statusOption}>{statusOption}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="folder-row">
            <label className="select-control folder-filter-control">
              <ListFilter size={17} />
              <span className="filter-select-label">Folder</span>
              <select value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)}>
                <option value="">All folders</option>
                <option value={unfiledFolderFilter}>Unfiled</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.label}
                  </option>
                ))}
              </select>
            </label>
            <form className="folder-create" onSubmit={createFolder}>
              <input value={newFolderLabel} onChange={(event) => setNewFolderLabel(event.target.value)} placeholder="New folder label" />
              <button className="secondary-button" type="submit">
                <Plus size={16} />
                Create folder
              </button>
            </form>
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
                <th>Progress</th>
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
                    <span>{[folderById.get(grant.folderId), grant.category].filter(Boolean).join(' / ')}</span>
                  </td>
                  <td>
                    <strong>{formatDeadline(grant)}</strong>
                    <span>{effectiveDeadlineStatus(grant)}</span>
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
              <div className="button-row">
                <button className="primary-button" onClick={() => onOpenApplication(selectedGrant.id, data.applications.find((item) => item.grantId === selectedGrant.id)?.id)}>
                  <FileText size={16} />
                  Work on application
                </button>
                <button className="icon-button" title="Edit grant" onClick={() => setDraftGrant(selectedGrant)}>
                  <SquarePen size={18} />
                </button>
              </div>
            </div>
            <div className="detail-stack">
              <Detail label="Amount" value={selectedGrant.amount} />
              <Detail label="Folder" value={folderById.get(selectedGrant.folderId) || 'Unfiled'} />
              <Detail label="Deadline" value={formatDeadline(selectedGrant)} />
              <Detail label="Deadline note" value={selectedGrant.deadlineLabel} />
              <Detail label="Deadline status" value={effectiveDeadlineStatus(selectedGrant)} />
              <Detail
                label="Applications"
                value={data.applications.filter((application) => application.grantId === selectedGrant.id).length.toString()}
              />
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
              onChange={(event) =>
                setDraftGrant({ ...draftGrant, deadline: event.target.value, deadlineLabel: '', deadlineStatus: 'Open' })
              }
            />
          </div>
          <div className="form-row">
            <select
              aria-label="Deadline status"
              value={draftGrant.deadlineStatus || 'Open'}
              onChange={(event) =>
                setDraftGrant({ ...draftGrant, deadlineStatus: event.target.value as GrantLead['deadlineStatus'] })
              }
            >
              {deadlineModeOptions.map((statusOption) => (
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
            <select
              aria-label="Folder"
              value={draftGrant.folderId || ''}
              onChange={(event) => setDraftGrant({ ...draftGrant, folderId: event.target.value })}
            >
              <option value="">No folder</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Progress"
              value={draftGrant.status || 'Prospect'}
              onChange={(event) => setDraftGrant({ ...draftGrant, status: event.target.value as GrantStatus })}
            >
              {statuses.map((status) => (
                <option key={status}>{status}</option>
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
            <input
              placeholder="Category"
              value={draftGrant.category || ''}
              onChange={(event) => setDraftGrant({ ...draftGrant, category: event.target.value })}
            />
          </div>
          <input
            placeholder="Geography"
            value={draftGrant.geography || ''}
            onChange={(event) => setDraftGrant({ ...draftGrant, geography: event.target.value })}
          />
          <textarea
            placeholder="Eligibility"
            value={draftGrant.eligibility || ''}
            onChange={(event) => setDraftGrant({ ...draftGrant, eligibility: event.target.value })}
          />
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
          <textarea
            placeholder="Notes"
            value={draftGrant.notes || ''}
            onChange={(event) => setDraftGrant({ ...draftGrant, notes: event.target.value })}
          />
          <div className="form-row">
            <input
              type="url"
              placeholder="Source URL"
              value={draftGrant.sourceUrl || ''}
              onChange={(event) => setDraftGrant({ ...draftGrant, sourceUrl: event.target.value })}
            />
            <input
              placeholder="Source label"
              value={draftGrant.sourceLabel || ''}
              onChange={(event) => setDraftGrant({ ...draftGrant, sourceLabel: event.target.value })}
            />
          </div>
          <input
            placeholder="Tags, separated by commas"
            value={(draftGrant.tags || []).join(', ')}
            onChange={(event) =>
              setDraftGrant({
                ...draftGrant,
                tags: event.target.value
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              })
            }
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
  const status = effectiveDeadlineStatus(grant)
  if (status === 'Rolling') return 'Rolling'
  if (status === 'Closed') return 'Closed; date not recorded'
  return 'Deadline not published'
}

function effectiveDeadlineStatus(grant: GrantLead): GrantLead['deadlineStatus'] {
  if (grant.deadlineStatus === 'Rolling' || grant.deadlineStatus === 'Closed') return grant.deadlineStatus
  if (!grant.deadline) return 'Open'

  const deadline = new Date(/T\d{2}:\d{2}/.test(grant.deadline) ? grant.deadline : `${grant.deadline}T23:59:59`)
  if (Number.isNaN(deadline.getTime())) return 'Open'
  const remainingDays = (deadline.getTime() - Date.now()) / 86_400_000
  if (remainingDays < 0) return 'Closed'
  if (remainingDays <= 14) return 'Due soon'
  return 'Open'
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

function DocumentsView({ data, commit }: { data: AppData; commit: (data: AppData) => void }) {
  const grantsById = new Map(data.grants.map((grant) => [grant.id, grant]))

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
        <table className="document-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Status</th>
              <th>Application</th>
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
                  <select
                    value={document.relatedApplicationId || ''}
                    onChange={(event) => {
                      const relatedApplication = data.applications.find((application) => application.id === event.target.value)
                      updateDocument(document.id, {
                        relatedApplicationId: relatedApplication?.id,
                        relatedGrantId: relatedApplication?.grantId,
                      })
                    }}
                  >
                    <option value="">Workspace-wide</option>
                    {data.applications.map((application) => (
                      <option key={application.id} value={application.id}>
                        {grantsById.get(application.grantId)?.grantName || 'Grant'} / {application.cycle}
                      </option>
                    ))}
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
                <td colSpan={6} className="empty-cell">
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
              <select
                aria-label="Related application"
                value={task.relatedApplicationId || ''}
                onChange={(event) => {
                  const relatedApplication = data.applications.find((application) => application.id === event.target.value)
                  updateTask(task.id, {
                    relatedApplicationId: relatedApplication?.id,
                    relatedGrantId: relatedApplication?.grantId,
                  })
                }}
              >
                <option value="">No application</option>
                {data.applications.map((application) => (
                  <option key={application.id} value={application.id}>
                    {grantsById.get(application.grantId)?.grantName || 'Grant'} / {application.cycle}
                  </option>
                ))}
              </select>
              <input type="date" value={task.dueDate} onChange={(event) => updateTask(task.id, { dueDate: event.target.value })} />
              <input value={task.owner} placeholder="Owner" onChange={(event) => updateTask(task.id, { owner: event.target.value })} />
            </article>
          ))}
        {!data.tasks.length && <p className="empty-state">No tasks yet.</p>}
      </div>
    </section>
  )
}

function SettingsView({ data, user, commit }: { data: AppData; user: AppUser; commit: (data: AppData) => void }) {
  const [importText, setImportText] = useState('')
  const [message, setMessage] = useState('')
  const [folderLabel, setFolderLabel] = useState('')
  const [members, setMembers] = useState<Awaited<ReturnType<typeof loadWorkspaceMembers>>>([])
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteExpiresAt, setInviteExpiresAt] = useState('')

  useEffect(() => {
    if (user.mode !== 'supabase') return
    void loadWorkspaceMembers(data.workspace.id)
      .then(setMembers)
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Could not load workspace members.'))
  }, [data.workspace.id, user.mode])

  function updateWorkspace(patch: Partial<AppData['workspace']>) {
    commit({ ...data, workspace: { ...data.workspace, ...patch } })
  }

  function addFolder(event: FormEvent) {
    event.preventDefault()
    const folder = normalizeFolder({ label: folderLabel })
    if (!folder) return
    const exists = data.folders.some((item) => item.label.toLowerCase() === folder.label.toLowerCase())
    if (exists) {
      setFolderLabel('')
      return
    }

    commit({ ...data, folders: [...data.folders, folder] })
    setFolderLabel('')
  }

  function renameFolder(id: string, label: string) {
    const folder = normalizeFolder({ id, label })
    if (!folder) return
    commit({ ...data, folders: data.folders.map((item) => (item.id === id ? folder : item)) })
  }

  function removeFolder(id: string) {
    commit({
      ...data,
      folders: data.folders.filter((folder) => folder.id !== id),
      grants: data.grants.map((grant) => (grant.folderId === id ? { ...grant, folderId: '' } : grant)),
    })
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
      const normalized = normalizeAppData(
        Array.isArray(parsed)
          ? { workspace: data.workspace, grants: parsed }
          : { ...parsed, workspace: parsed.workspace || data.workspace },
      )
      const grants = normalized.grants

      if (!Array.isArray(grants)) {
        throw new Error('Import JSON must be an array of grants or an object with a grants array.')
      }

      commit({
        ...data,
        folders: [...normalized.folders, ...data.folders],
        grants: [...grants, ...data.grants],
        applications: [...normalized.applications, ...data.applications],
        questions: [...normalized.questions, ...data.questions],
        answers: [...normalized.answers, ...data.answers],
        documents: [...normalized.documents, ...data.documents],
        tasks: [...normalized.tasks, ...data.tasks],
      })
      setImportText('')
      setMessage(`Imported ${grants.length} grants and ${normalized.applications.length} applications.`)
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Import failed.')
    }
  }

  async function createInvite() {
    setMessage('')
    try {
      const invite = await createWorkspaceInvite(data.workspace.id)
      setInviteUrl(invite.url)
      setInviteExpiresAt(invite.expiresAt)
      await navigator.clipboard.writeText(invite.url)
      setMessage('Invitation link copied. Each teammate can create and use their own account.')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not create an invitation.')
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
        <h2>Folders</h2>
        <div className="folder-list">
          {data.folders.map((folder) => (
            <div className="folder-item" key={folder.id}>
              <input value={folder.label} onChange={(event) => renameFolder(folder.id, event.target.value)} />
              <button className="secondary-button" type="button" onClick={() => removeFolder(folder.id)}>
                Remove
              </button>
            </div>
          ))}
          {!data.folders.length && <p className="empty-state">No folders yet.</p>}
        </div>
        <form className="folder-create settings-folder-create" onSubmit={addFolder}>
          <input value={folderLabel} onChange={(event) => setFolderLabel(event.target.value)} placeholder="New folder label" />
          <button className="primary-button" type="submit">
            <Plus size={17} />
            Add folder
          </button>
        </form>
      </section>

      <section className="panel collaboration-panel">
        <h2>Workspace access</h2>
        {user.mode === 'supabase' ? (
          <>
            <div className="member-list">
              {members.map((member) => (
                <div className="member-item" key={member.userId}>
                  <div>
                    <strong>{member.displayName || member.email}</strong>
                    <span>{member.email}</span>
                  </div>
                  <span className="member-role">{member.role}</span>
                </div>
              ))}
            </div>
            <button className="primary-button" onClick={() => void createInvite()}>
              <Plus size={17} />
              Create teammate invite
            </button>
            {inviteUrl && (
              <label className="invite-link-field">
                Share this link
                <input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} />
                <span>Expires {new Date(inviteExpiresAt).toLocaleString()}</span>
              </label>
            )}
          </>
        ) : (
          <p className="empty-state">Teammate accounts are available in the shared Supabase deployment.</p>
        )}
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
