import { Clipboard, ExternalLink, ListFilter, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { questionCategories } from '../lib/questionCategories'
import type { AppData, QuestionCategory } from '../types'

interface AnswerBankProps {
  data: AppData
  onOpenApplication: (grantId: string, applicationId: string) => void
}

type BankState = 'All states' | 'Draft' | 'Final' | 'Submitted' | 'Legacy'

interface BankEntry {
  id: string
  grantId: string
  applicationId: string
  category: QuestionCategory
  exactQuestion: string
  answer: string
  wordLimit: number
  state: Exclude<BankState, 'All states'>
  funder: string
  grantName: string
  cycle: string
  date: string
  isCurrent: boolean
}

export function AnswerBank({ data, onOpenApplication }: AnswerBankProps) {
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'All types' | QuestionCategory>('All types')
  const [stateFilter, setStateFilter] = useState<BankState>('All states')

  const entries = useMemo(() => buildEntries(data), [data])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return entries
      .filter((entry) => categoryFilter === 'All types' || entry.category === categoryFilter)
      .filter((entry) => stateFilter === 'All states' || entry.state === stateFilter)
      .filter((entry) => {
        const haystack = [entry.category, entry.exactQuestion, entry.answer, entry.funder, entry.grantName, entry.cycle]
          .join(' ')
          .toLowerCase()
        return !needle || haystack.includes(needle)
      })
  }, [categoryFilter, entries, query, stateFilter])

  return (
    <section className="panel full-panel answer-bank-panel">
      <div className="answer-bank-summary">
        <div>
          <strong>{entries.length}</strong>
          <span>responses indexed from applications</span>
        </div>
        <p>Drafts update automatically. Final and submitted versions remain preserved verbatim.</p>
      </div>

      <div className="toolbar answer-toolbar">
        <label className="search-box">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions and answers" />
        </label>
        <label className="select-control">
          <ListFilter size={17} />
          <span className="filter-select-label">Question type</span>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as 'All types' | QuestionCategory)}
          >
            <option>All types</option>
            {questionCategories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label className="select-control">
          <ListFilter size={17} />
          <span className="filter-select-label">State</span>
          <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value as BankState)}>
            <option>All states</option>
            <option>Draft</option>
            <option>Final</option>
            <option>Submitted</option>
            <option>Legacy</option>
          </select>
        </label>
      </div>

      <div className="answer-list">
        {filtered.map((entry) => (
          <article className="answer-item" key={entry.id}>
            <div className="answer-meta">
              <div>
                <strong>{entry.category}</strong>
                <span>{[entry.funder, entry.grantName, entry.cycle].filter(Boolean).join(' / ')}</span>
              </div>
              <div className="answer-state-block">
                <span className={`answer-state ${entry.state.toLowerCase()}`}>{entry.isCurrent ? `Current ${entry.state}` : entry.state}</span>
                {entry.date && <time>{formatDate(entry.date)}</time>}
              </div>
            </div>
            {entry.exactQuestion && <p className="question-text">{entry.exactQuestion}</p>}
            <pre>{entry.answer}</pre>
            <div className="answer-actions">
              {entry.wordLimit > 0 && <span>{entry.wordLimit}-word limit</span>}
              <button className="secondary-button" onClick={() => void navigator.clipboard.writeText(entry.answer)}>
                <Clipboard size={16} />
                Copy verbatim
              </button>
              {entry.grantId && entry.applicationId && (
                <button
                  className="secondary-button"
                  onClick={() => onOpenApplication(entry.grantId, entry.applicationId)}
                >
                  <ExternalLink size={16} />
                  Open application
                </button>
              )}
            </div>
          </article>
        ))}
        {!filtered.length && (
          <p className="empty-state">
            {entries.length
              ? 'No application responses match these filters.'
              : 'Application responses will appear here automatically as your team drafts them.'}
          </p>
        )}
      </div>
    </section>
  )
}

function buildEntries(data: AppData): BankEntry[] {
  const applicationsById = new Map(data.applications.map((application) => [application.id, application]))
  const grantsById = new Map(data.grants.map((grant) => [grant.id, grant]))
  const questionsById = new Map(data.questions.map((question) => [question.id, question]))
  const live: BankEntry[] = data.questions
    .filter((question) => question.response.trim())
    .map((question) => {
      const application = applicationsById.get(question.applicationId)
      const grant = grantsById.get(application?.grantId || '')
      return {
        id: `live:${question.id}`,
        grantId: grant?.id || '',
        applicationId: application?.id || '',
        category: question.category,
        exactQuestion: question.exactQuestion,
        answer: question.response,
        wordLimit: question.wordLimit,
        state: question.responseStatus,
        funder: grant?.funder || '',
        grantName: grant?.grantName || '',
        cycle: application?.cycle || '',
        date: question.updatedAt,
        isCurrent: true,
      }
    })

  const history: BankEntry[] = data.answers
    .filter((answer) => {
      if (!answer.finalAnswer.trim()) return false
      const current = questionsById.get(answer.questionId)
      return !(
        answer.sourceStatus === 'Final' &&
        current?.responseStatus === 'Final' &&
        current.response === answer.finalAnswer
      )
    })
    .map((answer) => {
      const application = applicationsById.get(answer.applicationId)
      const grant = grantsById.get(answer.grantId || application?.grantId || '')
      return {
        id: `history:${answer.id}`,
        grantId: grant?.id || '',
        applicationId: application?.id || '',
        category: answer.questionType,
        exactQuestion: answer.exactQuestion,
        answer: answer.finalAnswer,
        wordLimit: answer.wordLimit,
        state: answer.sourceStatus,
        funder: grant?.funder || answer.legacyFunder,
        grantName: grant?.grantName || answer.legacyGrantName,
        cycle: application?.cycle || '',
        date: answer.createdAt,
        isCurrent: false,
      }
    })

  return [...live, ...history].sort(
    (a, b) => a.category.localeCompare(b.category) || dateValue(b.date) - dateValue(a.date),
  )
}

function dateValue(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}
