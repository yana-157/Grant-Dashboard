import { questionCategories } from './questionCategories'
import type {
  AnswerRecord,
  AppData,
  ApplicationQuestion,
  AppUser,
  DeadlineStatus,
  GrantApplication,
  GrantLead,
  GrantStatus,
  QuestionCategory,
  Workspace,
  WorkspaceFolder,
} from '../types'

const accountKey = 'grant-dashboard:accounts:v1'
const sessionKey = 'grant-dashboard:session:v1'
const dataPrefix = 'grant-dashboard:data:v1:'

interface StoredAccount {
  id: string
  email: string
  displayName: string
  workspaceId: string
  passwordHash: string
  createdAt: string
}

export function createBlankData(workspaceName: string): AppData {
  const workspace: Workspace = {
    id: crypto.randomUUID(),
    name: workspaceName,
    mission: '',
    serviceArea: '',
    profileNotes: '',
  }

  return {
    workspace,
    folders: [],
    grants: [],
    applications: [],
    questions: [],
    answers: [],
    documents: [],
    tasks: [],
  }
}

function getAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(accountKey)
    return raw ? (JSON.parse(raw) as StoredAccount[]) : []
  } catch {
    return []
  }
}

function saveAccounts(accounts: StoredAccount[]) {
  localStorage.setItem(accountKey, JSON.stringify(accounts))
}

async function hashPassword(email: string, password: string) {
  const payload = new TextEncoder().encode(`${email.trim().toLowerCase()}::${password}`)
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function toUser(account: StoredAccount): AppUser {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    workspaceId: account.workspaceId,
    mode: 'local',
  }
}

export async function createAccount(
  email: string,
  password: string,
  displayName: string,
  workspaceName: string,
) {
  const normalizedEmail = email.trim().toLowerCase()
  const accounts = getAccounts()

  if (!normalizedEmail || !password || !workspaceName.trim()) {
    throw new Error('Email, password, and workspace name are required.')
  }

  if (accounts.some((account) => account.email === normalizedEmail)) {
    throw new Error('An account already exists for this email.')
  }

  const data = createBlankData(workspaceName.trim())
  const account: StoredAccount = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    displayName: displayName.trim() || normalizedEmail,
    workspaceId: data.workspace.id,
    passwordHash: await hashPassword(normalizedEmail, password),
    createdAt: new Date().toISOString(),
  }

  accounts.push(account)
  saveAccounts(accounts)
  saveWorkspaceData(data)
  setCurrentUser(toUser(account))

  return toUser(account)
}

export async function signIn(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase()
  const account = getAccounts().find((item) => item.email === normalizedEmail)

  if (!account) {
    throw new Error('No account found for that email.')
  }

  const passwordHash = await hashPassword(normalizedEmail, password)
  if (passwordHash !== account.passwordHash) {
    throw new Error('Incorrect password.')
  }

  const user = toUser(account)
  setCurrentUser(user)
  return user
}

export function getCurrentUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(sessionKey)
    return raw ? (JSON.parse(raw) as AppUser) : null
  } catch {
    return null
  }
}

export function setCurrentUser(user: AppUser) {
  localStorage.setItem(sessionKey, JSON.stringify(user))
}

export function signOut() {
  localStorage.removeItem(sessionKey)
}

export function loadWorkspaceData(workspaceId: string): AppData | null {
  try {
    const raw = localStorage.getItem(`${dataPrefix}${workspaceId}`)
    return raw ? normalizeAppData(JSON.parse(raw) as Partial<AppData>) : null
  } catch {
    return null
  }
}

export function saveWorkspaceData(data: AppData) {
  localStorage.setItem(`${dataPrefix}${data.workspace.id}`, JSON.stringify(normalizeAppData(data)))
}

export function normalizeGrant(partial: Partial<GrantLead>): GrantLead {
  const now = new Date().toISOString().slice(0, 10)
  return {
    id: partial.id || crypto.randomUUID(),
    funder: partial.funder || '',
    grantName: partial.grantName || '',
    category: partial.category || 'General',
    amount: partial.amount || '',
    deadline: partial.deadline || '',
    deadlineLabel: partial.deadlineLabel || partial.deadline || '',
    deadlineStatus: normalizeDeadlineStatus(partial.deadlineStatus),
    geography: partial.geography || '',
    folderId: partial.folderId || '',
    priority: partial.priority || 'Medium',
    fitScore: Number(partial.fitScore ?? 50),
    status: normalizeGrantStatus(partial.status),
    sourceUrl: partial.sourceUrl || '',
    sourceLabel: partial.sourceLabel || '',
    eligibility: partial.eligibility || '',
    fitReason: partial.fitReason || '',
    nextAction: partial.nextAction || '',
    notes: partial.notes || '',
    tags: Array.isArray(partial.tags) ? partial.tags : [],
    updatedAt: partial.updatedAt || now,
  }
}

export function normalizeApplication(partial: Partial<GrantApplication>): GrantApplication {
  const now = new Date().toISOString()
  return {
    id: partial.id || crypto.randomUUID(),
    grantId: partial.grantId || '',
    name: partial.name || 'Grant application',
    cycle: partial.cycle || `${new Date().getFullYear()} cycle`,
    status: normalizeApplicationStatus(partial.status),
    owner: partial.owner || '',
    portalUrl: partial.portalUrl || '',
    deadline: partial.deadline || '',
    submittedAt: partial.submittedAt || '',
    notes: partial.notes || '',
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || now,
  }
}

export function normalizeQuestion(partial: Partial<ApplicationQuestion>): ApplicationQuestion {
  const now = new Date().toISOString()
  return {
    id: partial.id || crypto.randomUUID(),
    applicationId: partial.applicationId || '',
    position: Number.isFinite(Number(partial.position)) ? Number(partial.position) : 0,
    exactQuestion: partial.exactQuestion || '',
    category: normalizeQuestionCategory(partial.category),
    wordLimit: Math.max(0, Number(partial.wordLimit) || 0),
    response: partial.response || '',
    responseStatus: partial.responseStatus === 'Final' ? 'Final' : 'Draft',
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || now,
  }
}

type LegacyAnswer = Partial<AnswerRecord> & {
  funder?: string
  grantName?: string
  wordLimit?: number | string
  quality?: string
}

export function normalizeAnswerRecord(partial: LegacyAnswer): AnswerRecord {
  return {
    id: partial.id || crypto.randomUUID(),
    grantId: partial.grantId || '',
    applicationId: partial.applicationId || '',
    questionId: partial.questionId || '',
    questionType: normalizeQuestionCategory(partial.questionType),
    exactQuestion: partial.exactQuestion || '',
    wordLimit: Math.max(0, Number(partial.wordLimit) || 0),
    finalAnswer: partial.finalAnswer || '',
    sourceStatus:
      partial.sourceStatus === 'Final' || partial.sourceStatus === 'Submitted' ? partial.sourceStatus : 'Legacy',
    createdAt: partial.createdAt || new Date().toISOString(),
    createdBy: partial.createdBy || '',
    legacyFunder: partial.legacyFunder || partial.funder || '',
    legacyGrantName: partial.legacyGrantName || partial.grantName || '',
  }
}

export function normalizeAppData(partial: Partial<AppData>): AppData {
  const workspace: Workspace = {
    id: partial.workspace?.id || crypto.randomUUID(),
    name: partial.workspace?.name || 'Grant Workspace',
    mission: partial.workspace?.mission || '',
    serviceArea: partial.workspace?.serviceArea || '',
    profileNotes: partial.workspace?.profileNotes || '',
  }
  const folders = Array.isArray(partial.folders)
    ? partial.folders.map(normalizeFolder).filter((folder): folder is WorkspaceFolder => Boolean(folder))
    : []
  const folderIds = new Set(folders.map((folder) => folder.id))

  const grants = Array.isArray(partial.grants)
    ? partial.grants.map((grant) => {
        const normalized = normalizeGrant(grant)
        return folderIds.has(normalized.folderId) ? normalized : { ...normalized, folderId: '' }
      })
    : []
  const grantIds = new Set(grants.map((grant) => grant.id))
  const applications = Array.isArray(partial.applications)
    ? partial.applications.map(normalizeApplication).filter((application) => grantIds.has(application.grantId))
    : []
  const applicationIds = new Set(applications.map((application) => application.id))
  const questions = Array.isArray(partial.questions)
    ? partial.questions.map(normalizeQuestion).filter((question) => applicationIds.has(question.applicationId))
    : []

  return {
    workspace,
    folders,
    grants,
    applications,
    questions,
    answers: Array.isArray(partial.answers) ? partial.answers.map((answer) => normalizeAnswerRecord(answer)) : [],
    documents: Array.isArray(partial.documents) ? partial.documents : [],
    tasks: Array.isArray(partial.tasks) ? partial.tasks : [],
  }
}

export function normalizeFolder(partial: Partial<WorkspaceFolder>): WorkspaceFolder | null {
  const label = partial.label?.trim()
  if (!label) return null
  return {
    id: partial.id || crypto.randomUUID(),
    label,
  }
}

function normalizeGrantStatus(status: GrantStatus | string | undefined): GrantStatus {
  if (status === 'Submitted' || status === 'Awarded' || status === 'Not a fit' || status === 'Watchlist') return status
  if (status === 'Researching' || status === 'Ready' || status === 'In progress' || status === 'Working') return 'Working'
  if (status === 'Closed') return 'Watchlist'
  return 'Prospect'
}

function normalizeDeadlineStatus(status: DeadlineStatus | string | undefined): DeadlineStatus {
  if (status === 'Due soon' || status === 'Rolling' || status === 'Closed') return status
  return 'Open'
}

function normalizeApplicationStatus(status: GrantApplication['status'] | string | undefined): GrantApplication['status'] {
  if (
    status === 'Planning' ||
    status === 'Internal review' ||
    status === 'Ready to submit' ||
    status === 'Submitted' ||
    status === 'Awarded' ||
    status === 'Declined'
  ) {
    return status
  }
  return 'Drafting'
}

function normalizeQuestionCategory(category: QuestionCategory | string | undefined): QuestionCategory {
  return questionCategories.includes(category as QuestionCategory) ? (category as QuestionCategory) : 'Other'
}
