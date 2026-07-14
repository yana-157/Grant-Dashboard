import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type {
  AnswerRecord,
  AppData,
  ApplicationQuestion,
  AppUser,
  DocumentItem,
  GrantApplication,
  GrantLead,
  TaskItem,
  WorkspaceFolder,
  WorkspaceMember,
} from '../types'
import {
  createBlankData,
  normalizeAnswerRecord,
  normalizeAppData,
  normalizeApplication,
  normalizeGrant,
  normalizeQuestion,
} from './localStore'

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const supabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl)
const supabaseBrowserKey = supabasePublishableKey || supabaseAnonKey
const activeWorkspaceKey = 'grant-dashboard:active-workspace:v1'

let client: SupabaseClient | null = null

function normalizeSupabaseUrl(url: string | undefined) {
  if (!url) return undefined
  return url.trim().replace(/\/rest\/v1\/?$/i, '')
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseBrowserKey)
}

function getClient() {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.')
  if (!client) {
    client = createClient(supabaseUrl!, supabaseBrowserKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }
  return client
}

function toAppUser(user: User, workspaceId: string): AppUser {
  const email = user.email || ''
  return {
    id: user.id,
    email,
    displayName: String(user.user_metadata?.display_name || email),
    workspaceId,
    mode: 'supabase',
  }
}

export async function getSupabaseCurrentUser(inviteToken?: string): Promise<AppUser | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = getClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const user = sessionData.session?.user
  if (!user?.email) return null

  const workspaceId = inviteToken ? await acceptWorkspaceInvite(inviteToken) : await getWorkspaceIdForUser(user.id)
  if (!workspaceId) return null
  rememberWorkspace(workspaceId)
  return toAppUser(user, workspaceId)
}

export async function signInSupabase(email: string, password: string, inviteToken?: string): Promise<AppUser> {
  const supabase = getClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })
  if (error) throw error
  if (!data.user?.email) throw new Error('Sign-in did not return a user.')

  const workspaceId = inviteToken ? await acceptWorkspaceInvite(inviteToken) : await getWorkspaceIdForUser(data.user.id)
  if (!workspaceId) throw new Error('This account does not have a workspace yet.')
  rememberWorkspace(workspaceId)
  return toAppUser(data.user, workspaceId)
}

export async function createSupabaseAccount(
  email: string,
  password: string,
  displayName: string,
  workspaceName: string,
  inviteToken?: string,
): Promise<AppUser> {
  const supabase = getClient()
  const normalizedEmail = email.trim().toLowerCase()
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: { data: { display_name: displayName.trim() || normalizedEmail } },
  })

  if (error) {
    if (isExistingUserError(error)) {
      return signInAndResolveWorkspace(normalizedEmail, password, workspaceName, inviteToken)
    }
    throw error
  }
  if (!data.user?.email) throw new Error('Account was not created.')
  if (!data.session) {
    try {
      return await signInAndResolveWorkspace(normalizedEmail, password, workspaceName, inviteToken)
    } catch {
      // Supabase may require email confirmation before creating or joining a workspace.
    }
    throw new Error('Account created, but email confirmation is required before workspace setup.')
  }

  const workspaceId = inviteToken
    ? await acceptWorkspaceInvite(inviteToken)
    : await ensureWorkspaceForUser(data.user, workspaceName.trim() || 'Grant Workspace')
  rememberWorkspace(workspaceId)
  return toAppUser(data.user, workspaceId)
}

function isExistingUserError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() || ''
  return error.code === 'user_already_exists' || message.includes('already registered')
}

async function signInAndResolveWorkspace(email: string, password: string, workspaceName: string, inviteToken?: string) {
  const supabase = getClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  if (!data.user?.email) throw new Error('Sign-in did not return a user.')

  const workspaceId = inviteToken
    ? await acceptWorkspaceInvite(inviteToken)
    : await ensureWorkspaceForUser(data.user, workspaceName.trim() || 'Grant Workspace')
  rememberWorkspace(workspaceId)
  return toAppUser(data.user, workspaceId)
}

export async function signOutSupabase() {
  if (!isSupabaseConfigured()) return
  await getClient().auth.signOut()
}

async function getWorkspaceIdForUser(userId: string) {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
  if (error) throw error

  const rows = (data || []) as Array<{ workspace_id: string }>
  const preferred = localStorage.getItem(activeWorkspaceKey)
  return rows.find((row) => row.workspace_id === preferred)?.workspace_id || rows[0]?.workspace_id
}

async function createWorkspaceForUser(user: User, workspaceName: string) {
  const supabase = getClient()
  const blank = createBlankData(workspaceName)
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .insert({
      id: blank.workspace.id,
      name: blank.workspace.name,
      mission: '',
      service_area: '',
      profile_notes: '',
      created_by: user.id,
    })
    .select('id')
    .single()
  if (workspaceError) throw workspaceError

  const { error: memberError } = await supabase.from('workspace_members').insert({
    workspace_id: workspace.id,
    user_id: user.id,
    role: 'owner',
    email: user.email || '',
    display_name: String(user.user_metadata?.display_name || user.email || ''),
  })
  if (memberError) throw memberError
  return workspace.id as string
}

async function ensureWorkspaceForUser(user: User, workspaceName: string) {
  const existingWorkspaceId = await getWorkspaceIdForUser(user.id)
  return existingWorkspaceId || createWorkspaceForUser(user, workspaceName)
}

function rememberWorkspace(workspaceId: string) {
  localStorage.setItem(activeWorkspaceKey, workspaceId)
}

export async function acceptWorkspaceInvite(inviteToken: string) {
  const { data, error } = await getClient().rpc('accept_workspace_invite', { invite_token: inviteToken })
  if (error) throw error
  if (!data) throw new Error('This workspace invitation is invalid or expired.')
  rememberWorkspace(String(data))
  return String(data)
}

export async function createWorkspaceInvite(workspaceId: string) {
  const { data, error } = await getClient()
    .from('workspace_invites')
    .insert({ workspace_id: workspaceId, role: 'member' })
    .select('token, expires_at')
    .single()
  if (error) throw error

  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('invite', String(data.token))
  return { url: url.toString(), expiresAt: String(data.expires_at) }
}

export async function loadWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const { data, error } = await getClient()
    .from('workspace_members')
    .select('user_id, email, display_name, role, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at')
  if (error) throw error
  return (data || []).map((row) => ({
    userId: String(row.user_id),
    email: String(row.email || ''),
    displayName: String(row.display_name || ''),
    role: row.role as WorkspaceMember['role'],
    createdAt: String(row.created_at || ''),
  }))
}

export async function loadSupabaseData(workspaceId: string): Promise<AppData> {
  const supabase = getClient()
  const [workspaceResult, foldersResult, grantsResult, applicationsResult, questionsResult, answersResult, documentsResult, tasksResult] =
    await Promise.all([
      supabase.from('workspaces').select('id, name, mission, service_area, profile_notes').eq('id', workspaceId).single(),
      supabase.from('folders').select('*').eq('workspace_id', workspaceId).order('label'),
      supabase.from('grants').select('*').eq('workspace_id', workspaceId),
      supabase.from('grant_applications').select('*').eq('workspace_id', workspaceId),
      supabase.from('application_questions').select('*').eq('workspace_id', workspaceId).order('position'),
      supabase.from('answer_history').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      supabase.from('documents').select('*').eq('workspace_id', workspaceId),
      supabase.from('tasks').select('*').eq('workspace_id', workspaceId),
    ])

  const error = [
    workspaceResult.error,
    foldersResult.error,
    grantsResult.error,
    applicationsResult.error,
    questionsResult.error,
    answersResult.error,
    documentsResult.error,
    tasksResult.error,
  ].find(Boolean)
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      throw new Error('The workspace database needs the latest schema migration before this version can load.')
    }
    throw error
  }

  const workspace = workspaceResult.data
  if (!workspace) throw new Error('Workspace not found.')
  return normalizeAppData({
    workspace: {
      id: String(workspace.id),
      name: String(workspace.name || 'Grant Workspace'),
      mission: String(workspace.mission || ''),
      serviceArea: String(workspace.service_area || ''),
      profileNotes: String(workspace.profile_notes || ''),
    },
    folders: (foldersResult.data || []).map((row) => ({ id: String(row.id), label: String(row.label || '') })),
    grants: (grantsResult.data || []).map(fromGrantRow),
    applications: (applicationsResult.data || []).map(fromApplicationRow),
    questions: (questionsResult.data || []).map(fromQuestionRow),
    answers: (answersResult.data || []).map(fromAnswerRow),
    documents: (documentsResult.data || []).map(fromDocumentRow),
    tasks: (tasksResult.data || []).map(fromTaskRow),
  })
}

export async function saveSupabaseData(previousData: AppData, nextData: AppData) {
  const supabase = getClient()
  const workspaceId = nextData.workspace.id

  if (JSON.stringify(previousData.workspace) !== JSON.stringify(nextData.workspace)) {
    const { error } = await supabase
      .from('workspaces')
      .update({
        name: nextData.workspace.name,
        mission: nextData.workspace.mission,
        service_area: nextData.workspace.serviceArea,
        profile_notes: nextData.workspace.profileNotes,
      })
      .eq('id', workspaceId)
    if (error) throw error
  }

  await upsertChanged(supabase, 'folders', workspaceId, previousData.folders, nextData.folders, toFolderRow)
  await upsertChanged(supabase, 'grants', workspaceId, previousData.grants, nextData.grants, toGrantRow)
  await upsertChanged(
    supabase,
    'grant_applications',
    workspaceId,
    previousData.applications,
    nextData.applications,
    toApplicationRow,
  )
  await upsertChanged(
    supabase,
    'application_questions',
    workspaceId,
    previousData.questions,
    nextData.questions,
    toQuestionRow,
  )
  await upsertChanged(supabase, 'answer_history', workspaceId, previousData.answers, nextData.answers, toAnswerRow)
  await upsertChanged(supabase, 'documents', workspaceId, previousData.documents, nextData.documents, toDocumentRow)
  await upsertChanged(supabase, 'tasks', workspaceId, previousData.tasks, nextData.tasks, toTaskRow)

  await deleteRemoved(supabase, 'tasks', previousData.tasks, nextData.tasks)
  await deleteRemoved(supabase, 'documents', previousData.documents, nextData.documents)
  await deleteRemoved(supabase, 'application_questions', previousData.questions, nextData.questions)
  await deleteRemoved(supabase, 'grant_applications', previousData.applications, nextData.applications)
  await deleteRemoved(supabase, 'grants', previousData.grants, nextData.grants)
  await deleteRemoved(supabase, 'folders', previousData.folders, nextData.folders)
}

interface Identifiable {
  id: string
}

async function upsertChanged<T extends Identifiable>(
  supabase: SupabaseClient,
  table: string,
  workspaceId: string,
  previous: T[],
  next: T[],
  toRow: (item: T, workspaceId: string) => Record<string, unknown>,
) {
  const previousById = new Map(previous.map((item) => [item.id, item]))
  const changed = next.filter((item) => JSON.stringify(previousById.get(item.id)) !== JSON.stringify(item))
  if (!changed.length) return
  const { error } = await supabase.from(table).upsert(changed.map((item) => toRow(item, workspaceId)))
  if (error) throw error
}

async function deleteRemoved<T extends Identifiable>(supabase: SupabaseClient, table: string, previous: T[], next: T[]) {
  const nextIds = new Set(next.map((item) => item.id))
  const removedIds = previous.filter((item) => !nextIds.has(item.id)).map((item) => item.id)
  if (!removedIds.length) return
  const { error } = await supabase.from(table).delete().in('id', removedIds)
  if (error) throw error
}

function fromGrantRow(row: Record<string, unknown>): GrantLead {
  return normalizeGrant({
    id: String(row.id),
    funder: String(row.funder || ''),
    grantName: String(row.grant_name || ''),
    category: String(row.category || ''),
    amount: String(row.amount || ''),
    deadline: String(row.deadline || ''),
    deadlineLabel: String(row.deadline_label || ''),
    deadlineStatus: String(row.deadline_status || 'Open') as GrantLead['deadlineStatus'],
    geography: String(row.geography || ''),
    folderId: String(row.folder_id || ''),
    priority: String(row.priority || 'Medium') as GrantLead['priority'],
    fitScore: Number(row.fit_score || 0),
    status: String(row.status || 'Prospect') as GrantLead['status'],
    sourceUrl: String(row.source_url || ''),
    sourceLabel: String(row.source_label || ''),
    eligibility: String(row.eligibility || ''),
    fitReason: String(row.fit_reason || ''),
    nextAction: String(row.next_action || ''),
    notes: String(row.notes || ''),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    updatedAt: String(row.updated_at || ''),
  })
}

function fromApplicationRow(row: Record<string, unknown>): GrantApplication {
  return normalizeApplication({
    id: String(row.id),
    grantId: String(row.grant_id || ''),
    name: String(row.name || ''),
    cycle: String(row.cycle || ''),
    status: String(row.status || 'Drafting') as GrantApplication['status'],
    owner: String(row.owner || ''),
    portalUrl: String(row.portal_url || ''),
    deadline: String(row.deadline || ''),
    submittedAt: String(row.submitted_at || ''),
    notes: String(row.notes || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  })
}

function fromQuestionRow(row: Record<string, unknown>): ApplicationQuestion {
  return normalizeQuestion({
    id: String(row.id),
    applicationId: String(row.application_id || ''),
    position: Number(row.position || 0),
    exactQuestion: String(row.exact_question || ''),
    category: String(row.category || 'Other') as ApplicationQuestion['category'],
    wordLimit: Number(row.word_limit || 0),
    response: String(row.response || ''),
    responseStatus: String(row.response_status || 'Draft') as ApplicationQuestion['responseStatus'],
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  })
}

function fromAnswerRow(row: Record<string, unknown>): AnswerRecord {
  return normalizeAnswerRecord({
    id: String(row.id),
    grantId: String(row.grant_id || ''),
    applicationId: String(row.application_id || ''),
    questionId: String(row.question_id || ''),
    questionType: String(row.question_type || 'Other') as AnswerRecord['questionType'],
    exactQuestion: String(row.exact_question || ''),
    wordLimit: Number(row.word_limit || 0),
    finalAnswer: String(row.final_answer || ''),
    sourceStatus: String(row.source_status || 'Legacy') as AnswerRecord['sourceStatus'],
    createdAt: String(row.created_at || ''),
    createdBy: String(row.created_by || ''),
    legacyFunder: String(row.legacy_funder || ''),
    legacyGrantName: String(row.legacy_grant_name || ''),
  })
}

function fromDocumentRow(row: Record<string, unknown>): DocumentItem {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    category: String(row.category || ''),
    status: String(row.status || 'Needed') as DocumentItem['status'],
    owner: String(row.owner || ''),
    notes: String(row.notes || ''),
    relatedGrantId: String(row.related_grant_id || '') || undefined,
    relatedApplicationId: String(row.related_application_id || '') || undefined,
  }
}

function fromTaskRow(row: Record<string, unknown>): TaskItem {
  return {
    id: String(row.id),
    title: String(row.title || ''),
    relatedGrantId: String(row.related_grant_id || '') || undefined,
    relatedApplicationId: String(row.related_application_id || '') || undefined,
    dueDate: String(row.due_date || ''),
    status: String(row.status || 'Open') as TaskItem['status'],
    owner: String(row.owner || ''),
  }
}

function toFolderRow(folder: WorkspaceFolder, workspaceId: string) {
  return { id: folder.id, workspace_id: workspaceId, label: folder.label }
}

function toGrantRow(grant: GrantLead, workspaceId: string) {
  return {
    id: grant.id,
    workspace_id: workspaceId,
    funder: grant.funder,
    grant_name: grant.grantName,
    category: grant.category,
    amount: grant.amount,
    deadline: grant.deadline,
    deadline_label: grant.deadlineLabel,
    deadline_status: grant.deadlineStatus,
    geography: grant.geography,
    folder_id: grant.folderId || null,
    priority: grant.priority,
    fit_score: grant.fitScore,
    status: grant.status,
    source_url: grant.sourceUrl,
    source_label: grant.sourceLabel,
    eligibility: grant.eligibility,
    fit_reason: grant.fitReason,
    next_action: grant.nextAction,
    notes: grant.notes,
    tags: grant.tags,
    updated_at: new Date().toISOString(),
  }
}

function toApplicationRow(application: GrantApplication, workspaceId: string) {
  return {
    id: application.id,
    workspace_id: workspaceId,
    grant_id: application.grantId,
    name: application.name,
    cycle: application.cycle,
    status: application.status,
    owner: application.owner,
    portal_url: application.portalUrl,
    deadline: application.deadline,
    submitted_at: application.submittedAt || null,
    notes: application.notes,
    created_at: application.createdAt,
    updated_at: application.updatedAt,
  }
}

function toQuestionRow(question: ApplicationQuestion, workspaceId: string) {
  return {
    id: question.id,
    workspace_id: workspaceId,
    application_id: question.applicationId,
    position: question.position,
    exact_question: question.exactQuestion,
    category: question.category,
    word_limit: question.wordLimit,
    response: question.response,
    response_status: question.responseStatus,
    created_at: question.createdAt,
    updated_at: question.updatedAt,
  }
}

function toAnswerRow(answer: AnswerRecord, workspaceId: string) {
  return {
    id: answer.id,
    workspace_id: workspaceId,
    grant_id: answer.grantId || null,
    application_id: answer.applicationId || null,
    question_id: answer.questionId || null,
    question_type: answer.questionType,
    exact_question: answer.exactQuestion,
    word_limit: answer.wordLimit,
    final_answer: answer.finalAnswer,
    source_status: answer.sourceStatus,
    created_at: answer.createdAt,
    legacy_funder: answer.legacyFunder,
    legacy_grant_name: answer.legacyGrantName,
  }
}

function toDocumentRow(document: DocumentItem, workspaceId: string) {
  return {
    id: document.id,
    workspace_id: workspaceId,
    name: document.name,
    category: document.category,
    status: document.status,
    owner: document.owner,
    notes: document.notes,
    related_grant_id: document.relatedGrantId || null,
    related_application_id: document.relatedApplicationId || null,
  }
}

function toTaskRow(task: TaskItem, workspaceId: string) {
  return {
    id: task.id,
    workspace_id: workspaceId,
    title: task.title,
    related_grant_id: task.relatedGrantId || null,
    related_application_id: task.relatedApplicationId || null,
    due_date: task.dueDate || null,
    status: task.status,
    owner: task.owner,
  }
}
