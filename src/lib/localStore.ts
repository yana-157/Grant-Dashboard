import type { AppData, AppUser, GrantLead, Workspace } from '../types'

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
    grants: [],
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
    return raw ? (JSON.parse(raw) as AppData) : null
  } catch {
    return null
  }
}

export function saveWorkspaceData(data: AppData) {
  localStorage.setItem(`${dataPrefix}${data.workspace.id}`, JSON.stringify(data))
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
    deadlineStatus: partial.deadlineStatus || 'Watch',
    geography: partial.geography || '',
    priority: partial.priority || 'Medium',
    fitScore: Number(partial.fitScore ?? 50),
    status: partial.status || 'Prospect',
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
