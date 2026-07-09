export type BackendMode = 'local' | 'supabase'

export type GrantStatus =
  | 'Prospect'
  | 'Working'
  | 'Submitted'
  | 'Awarded'
  | 'Not a fit'
  | 'Watchlist'

export type DeadlineStatus = 'Open' | 'Due soon' | 'Rolling' | 'Closed'

export type Priority = 'High' | 'Medium' | 'Low'

export interface WorkspaceFolder {
  id: string
  label: string
}

export interface Workspace {
  id: string
  name: string
  mission: string
  serviceArea: string
  profileNotes: string
}

export interface GrantLead {
  id: string
  funder: string
  grantName: string
  category: string
  amount: string
  deadline: string
  deadlineLabel: string
  deadlineStatus: DeadlineStatus
  geography: string
  folderId: string
  priority: Priority
  fitScore: number
  status: GrantStatus
  sourceUrl: string
  sourceLabel: string
  eligibility: string
  fitReason: string
  nextAction: string
  notes: string
  tags: string[]
  updatedAt: string
}

export interface AnswerRecord {
  id: string
  questionType: string
  exactQuestion: string
  funder: string
  grantName: string
  wordLimit: string
  finalAnswer: string
  tags: string[]
  lastUsed: string
  quality: 'Strong' | 'Needs review' | 'Draft'
  createdAt: string
}

export interface DocumentItem {
  id: string
  name: string
  category: string
  status: 'Ready' | 'Needed' | 'Drafting' | 'Requested'
  owner: string
  notes: string
}

export interface TaskItem {
  id: string
  title: string
  relatedGrantId?: string
  dueDate: string
  status: 'Open' | 'Done'
  owner: string
}

export interface AppData {
  workspace: Workspace
  folders: WorkspaceFolder[]
  grants: GrantLead[]
  answers: AnswerRecord[]
  documents: DocumentItem[]
  tasks: TaskItem[]
}

export interface AppUser {
  id: string
  email: string
  displayName: string
  workspaceId: string
  mode: BackendMode
}
