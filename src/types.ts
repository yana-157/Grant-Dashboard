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

export type ApplicationStatus =
  | 'Planning'
  | 'Drafting'
  | 'Internal review'
  | 'Ready to submit'
  | 'Submitted'
  | 'Awarded'
  | 'Declined'

export type QuestionCategory =
  | 'Organization overview'
  | 'Community need'
  | 'Program design'
  | 'Goals and outcomes'
  | 'Evaluation'
  | 'Budget'
  | 'Sustainability'
  | 'Equity and access'
  | 'Partnerships'
  | 'Other'

export type ResponseStatus = 'Draft' | 'Final'

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

export interface WorkspaceMember {
  userId: string
  email: string
  displayName: string
  role: 'owner' | 'admin' | 'member'
  createdAt: string
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

export interface GrantApplication {
  id: string
  grantId: string
  name: string
  cycle: string
  status: ApplicationStatus
  owner: string
  portalUrl: string
  deadline: string
  submittedAt: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface ApplicationQuestion {
  id: string
  applicationId: string
  position: number
  exactQuestion: string
  category: QuestionCategory
  wordLimit: number
  response: string
  responseStatus: ResponseStatus
  createdAt: string
  updatedAt: string
}

export interface AnswerRecord {
  id: string
  grantId: string
  applicationId: string
  questionId: string
  questionType: QuestionCategory
  exactQuestion: string
  wordLimit: number
  finalAnswer: string
  sourceStatus: 'Final' | 'Submitted' | 'Legacy'
  createdAt: string
  createdBy: string
  legacyFunder: string
  legacyGrantName: string
}

export interface DocumentItem {
  id: string
  name: string
  category: string
  status: 'Ready' | 'Needed' | 'Drafting' | 'Requested'
  owner: string
  notes: string
  relatedGrantId?: string
  relatedApplicationId?: string
}

export interface TaskItem {
  id: string
  title: string
  relatedGrantId?: string
  relatedApplicationId?: string
  dueDate: string
  status: 'Open' | 'Done'
  owner: string
}

export interface AppData {
  workspace: Workspace
  folders: WorkspaceFolder[]
  grants: GrantLead[]
  applications: GrantApplication[]
  questions: ApplicationQuestion[]
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
