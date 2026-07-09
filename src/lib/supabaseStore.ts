import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AppData, AppUser } from '../types'
import { createBlankData } from './localStore'

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const supabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl)
const supabaseBrowserKey = supabasePublishableKey || supabaseAnonKey

let client: SupabaseClient | null = null

function normalizeSupabaseUrl(url: string | undefined) {
  if (!url) return undefined
  return url.trim().replace(/\/rest\/v1\/?$/i, '')
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseBrowserKey)
}

function getClient() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.')
  }

  if (!client) {
    client = createClient(supabaseUrl!, supabaseBrowserKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  }

  return client
}

function toAppUser(userId: string, email: string, workspaceId: string): AppUser {
  return {
    id: userId,
    email,
    displayName: email,
    workspaceId,
    mode: 'supabase',
  }
}

export async function getSupabaseCurrentUser(): Promise<AppUser | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = getClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session
  if (!session?.user.email) return null

  const workspaceId = await getFirstWorkspaceId(session.user.id)
  if (!workspaceId) return null

  return toAppUser(session.user.id, session.user.email, workspaceId)
}

export async function signInSupabase(email: string, password: string): Promise<AppUser> {
  const supabase = getClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })

  if (error) throw error
  if (!data.user?.email) throw new Error('Sign-in did not return a user.')

  const workspaceId = await getFirstWorkspaceId(data.user.id)
  if (!workspaceId) {
    throw new Error('This account does not have a workspace yet. Use Create once, then sign in.')
  }

  return toAppUser(data.user.id, data.user.email, workspaceId)
}

export async function createSupabaseAccount(
  email: string,
  password: string,
  displayName: string,
  workspaceName: string,
): Promise<AppUser> {
  const supabase = getClient()
  const normalizedEmail = email.trim().toLowerCase()
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        display_name: displayName.trim() || normalizedEmail,
      },
    },
  })

  if (error) {
    if (isExistingUserError(error)) {
      return signInAndEnsureWorkspace(normalizedEmail, password, workspaceName)
    }
    throw error
  }
  if (!data.user?.email) throw new Error('Account was not created.')
  if (!data.session) {
    throw new Error('Account created, but email confirmation is required before workspace setup.')
  }

  const workspaceId = await ensureWorkspaceForUser(data.user.id, workspaceName.trim() || 'Grant Workspace')
  return toAppUser(data.user.id, data.user.email, workspaceId)
}

function isExistingUserError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() || ''
  return error.code === 'user_already_exists' || message.includes('already registered')
}

async function signInAndEnsureWorkspace(email: string, password: string, workspaceName: string) {
  const supabase = getClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  if (!data.user?.email) throw new Error('Sign-in did not return a user.')

  const workspaceId = await ensureWorkspaceForUser(data.user.id, workspaceName.trim() || 'Grant Workspace')
  return toAppUser(data.user.id, data.user.email, workspaceId)
}

export async function signOutSupabase() {
  if (!isSupabaseConfigured()) return
  await getClient().auth.signOut()
}

async function getFirstWorkspaceId(userId: string) {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .limit(1)

  if (error) throw error
  return data?.[0]?.workspace_id as string | undefined
}

async function createWorkspaceForUser(userId: string, workspaceName: string) {
  const supabase = getClient()
  const blank = createBlankData(workspaceName)

  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .insert({
      id: blank.workspace.id,
      name: blank.workspace.name,
      created_by: userId,
    })
    .select('id')
    .single()

  if (workspaceError) throw workspaceError

  const { error: memberError } = await supabase.from('workspace_members').insert({
    workspace_id: workspace.id,
    user_id: userId,
    role: 'owner',
  })

  if (memberError) throw memberError

  const { error: dataError } = await supabase.from('workspace_data').insert({
    workspace_id: workspace.id,
    data: {
      ...blank,
      workspace: {
        ...blank.workspace,
        id: workspace.id,
      },
    },
  })

  if (dataError) throw dataError

  return workspace.id as string
}

async function ensureWorkspaceForUser(userId: string, workspaceName: string) {
  const existingWorkspaceId = await getFirstWorkspaceId(userId)
  return existingWorkspaceId || createWorkspaceForUser(userId, workspaceName)
}

export async function loadSupabaseData(workspaceId: string): Promise<AppData> {
  const supabase = getClient()
  const { data, error } = await supabase.from('workspace_data').select('data').eq('workspace_id', workspaceId).single()

  if (error) throw error
  return data.data as AppData
}

export async function saveSupabaseData(appData: AppData) {
  const supabase = getClient()
  const { error } = await supabase
    .from('workspace_data')
    .upsert({
      workspace_id: appData.workspace.id,
      data: appData,
      updated_at: new Date().toISOString(),
    })

  if (error) throw error
}
