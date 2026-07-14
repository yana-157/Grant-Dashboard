import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  ClipboardPaste,
  ExternalLink,
  Plus,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type {
  AnswerRecord,
  AppData,
  ApplicationQuestion,
  ApplicationStatus,
  GrantApplication,
  QuestionCategory,
  ResponseStatus,
} from '../types'
import { countWords, questionCategories, suggestQuestionCategory } from '../lib/questionCategories'
import { normalizeApplication, normalizeQuestion } from '../lib/localStore'

const applicationStatuses: ApplicationStatus[] = [
  'Planning',
  'Drafting',
  'Internal review',
  'Ready to submit',
  'Submitted',
  'Awarded',
  'Declined',
]

interface ApplicationWorkspaceProps {
  data: AppData
  commit: (data: AppData) => void
  grantId: string
  initialApplicationId?: string
  onBack: () => void
}

export function ApplicationWorkspace({
  data,
  commit,
  grantId,
  initialApplicationId,
  onBack,
}: ApplicationWorkspaceProps) {
  const grant = data.grants.find((item) => item.id === grantId)
  const applications = useMemo(
    () => data.applications.filter((application) => application.grantId === grantId),
    [data.applications, grantId],
  )
  const [selectedApplicationId, setSelectedApplicationId] = useState(
    initialApplicationId || applications[0]?.id || '',
  )
  const application = applications.find((item) => item.id === selectedApplicationId) || applications[0]
  const questions = useMemo(
    () =>
      data.questions
        .filter((question) => question.applicationId === application?.id)
        .slice()
        .sort((a, b) => a.position - b.position),
    [application?.id, data.questions],
  )

  useEffect(() => {
    if (initialApplicationId && applications.some((item) => item.id === initialApplicationId)) {
      setSelectedApplicationId(initialApplicationId)
    } else if (!applications.some((item) => item.id === selectedApplicationId)) {
      setSelectedApplicationId(applications[0]?.id || '')
    }
  }, [applications, initialApplicationId, selectedApplicationId])

  if (!grant) {
    return (
      <section className="panel full-panel">
        <button className="secondary-button" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to grants
        </button>
        <p className="empty-state">This grant is no longer available.</p>
      </section>
    )
  }

  function createApplication() {
    const next = normalizeApplication({
      grantId,
      name: `${grant!.grantName} application`,
      cycle: `${new Date().getFullYear()} cycle`,
      deadline: grant!.deadline,
      status: 'Planning',
    })
    commit({ ...data, applications: [next, ...data.applications] })
    setSelectedApplicationId(next.id)
  }

  function updateApplication(patch: Partial<GrantApplication>) {
    if (!application) return
    const now = new Date().toISOString()
    const normalizedPatch =
      patch.status === 'Submitted' && !patch.submittedAt ? { ...patch, submittedAt: now } : patch
    const updated = { ...application, ...normalizedPatch, updatedAt: now }
    let answers = data.answers
    let grants = data.grants

    if (patch.status === 'Submitted' && application.status !== 'Submitted') {
      answers = [
        ...questions
          .filter((question) => question.response.trim())
          .map((question) => createAnswerSnapshot(question, application, 'Submitted')),
        ...answers,
      ]
      grants = grants.map((item) => (item.id === grantId ? { ...item, status: 'Submitted' } : item))
    } else if (patch.status === 'Awarded') {
      grants = grants.map((item) => (item.id === grantId ? { ...item, status: 'Awarded' } : item))
    }

    commit({
      ...data,
      applications: data.applications.map((item) => (item.id === application.id ? updated : item)),
      answers,
      grants,
    })
  }

  function addQuestion() {
    if (!application) return
    const question = normalizeQuestion({
      applicationId: application.id,
      position: questions.length,
      category: 'Other',
    })
    commit({ ...data, questions: [...data.questions, question] })
  }

  function updateQuestion(id: string, patch: Partial<ApplicationQuestion>) {
    const current = data.questions.find((question) => question.id === id)
    if (!current || !application) return

    const updated: ApplicationQuestion = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    let answers = data.answers

    if (patch.responseStatus === 'Final' && current.responseStatus !== 'Final' && updated.response.trim()) {
      answers = [createAnswerSnapshot(updated, application, 'Final'), ...answers]
    }

    commit({
      ...data,
      questions: data.questions.map((question) => (question.id === id ? updated : question)),
      answers,
    })
  }

  function updateQuestionText(question: ApplicationQuestion, value: string) {
    const suggested = suggestQuestionCategory(value)
    updateQuestion(question.id, {
      exactQuestion: value,
      category: question.category === 'Other' ? suggested : question.category,
    })
  }

  function moveQuestion(question: ApplicationQuestion, direction: -1 | 1) {
    const currentIndex = questions.findIndex((item) => item.id === question.id)
    const target = questions[currentIndex + direction]
    if (!target) return

    commit({
      ...data,
      questions: data.questions.map((item) => {
        if (item.id === question.id) return { ...item, position: target.position }
        if (item.id === target.id) return { ...item, position: question.position }
        return item
      }),
    })
  }

  function removeQuestion(questionId: string) {
    if (!window.confirm('Remove this question from the application? Saved final answer versions will remain in the Answer Bank.')) {
      return
    }
    commit({ ...data, questions: data.questions.filter((question) => question.id !== questionId) })
  }

  const answeredCount = questions.filter((question) => question.response.trim()).length
  const finalCount = questions.filter((question) => question.responseStatus === 'Final' && question.response.trim()).length
  const completion = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0

  return (
    <div className="application-shell">
      <header className="application-header">
        <div className="application-heading">
          <button className="icon-button" title="Back to grants" onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="eyebrow">{grant.funder}</p>
            <h2>{grant.grantName}</h2>
          </div>
        </div>
        <button className="primary-button" onClick={createApplication}>
          <Plus size={16} />
          New cycle
        </button>
      </header>

      {application ? (
        <>
          <section className="panel application-control-panel">
            <div className="application-picker-row">
              <label>
                Application
                <select value={application.id} onChange={(event) => setSelectedApplicationId(event.target.value)}>
                  {applications.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.cycle} / {item.status}
                    </option>
                  ))}
                </select>
              </label>
              <div className="application-progress" aria-label={`${completion}% complete`}>
                <div>
                  <strong>{completion}% complete</strong>
                  <span>
                    {answeredCount}/{questions.length} answered / {finalCount} final
                  </span>
                </div>
                <div className="progress-track">
                  <span style={{ width: `${completion}%` }} />
                </div>
              </div>
            </div>

            <div className="application-fields">
              <label>
                Application name
                <input value={application.name} onChange={(event) => updateApplication({ name: event.target.value })} />
              </label>
              <label>
                Cycle
                <input value={application.cycle} onChange={(event) => updateApplication({ cycle: event.target.value })} />
              </label>
              <label>
                Progress
                <select
                  value={application.status}
                  onChange={(event) => updateApplication({ status: event.target.value as ApplicationStatus })}
                >
                  {applicationStatuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>
                Owner
                <input value={application.owner} onChange={(event) => updateApplication({ owner: event.target.value })} />
              </label>
              <label>
                Deadline
                <input
                  type="datetime-local"
                  value={toDateTimeInput(application.deadline)}
                  onChange={(event) => updateApplication({ deadline: event.target.value })}
                />
              </label>
              <label>
                Portal URL
                <div className="input-with-action">
                  <input
                    type="url"
                    value={application.portalUrl}
                    onChange={(event) => updateApplication({ portalUrl: event.target.value })}
                  />
                  {application.portalUrl && (
                    <a className="icon-button" href={application.portalUrl} target="_blank" rel="noreferrer" title="Open portal">
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              </label>
            </div>
            <label className="application-notes">
              Internal notes
              <textarea value={application.notes} onChange={(event) => updateApplication({ notes: event.target.value })} />
            </label>
          </section>

          <section className="questions-section">
            <div className="section-header">
              <div>
                <h2>Application questions</h2>
                <p className="section-note">Responses are automatically indexed in the Answer Bank.</p>
              </div>
              <button className="primary-button" onClick={addQuestion}>
                <Plus size={16} />
                Add question
              </button>
            </div>

            <div className="question-list">
              {questions.map((question, index) => (
                <QuestionEditor
                  key={question.id}
                  question={question}
                  index={index}
                  total={questions.length}
                  previousAnswers={getPreviousAnswers(data, question)}
                  onChange={(patch) => updateQuestion(question.id, patch)}
                  onQuestionTextChange={(value) => updateQuestionText(question, value)}
                  onMove={(direction) => moveQuestion(question, direction)}
                  onRemove={() => removeQuestion(question.id)}
                />
              ))}
              {!questions.length && (
                <div className="empty-application">
                  <CircleCheck size={24} />
                  <p>Add the funder&apos;s exact questions here, then draft the application directly in the dashboard.</p>
                </div>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="panel empty-application">
          <p>No application cycle exists for this grant yet.</p>
          <button className="primary-button" onClick={createApplication}>
            <Plus size={16} />
            Create application
          </button>
        </section>
      )}
    </div>
  )
}

interface QuestionEditorProps {
  question: ApplicationQuestion
  index: number
  total: number
  previousAnswers: Array<{ id: string; label: string; answer: string }>
  onChange: (patch: Partial<ApplicationQuestion>) => void
  onQuestionTextChange: (value: string) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}

function QuestionEditor({
  question,
  index,
  total,
  previousAnswers,
  onChange,
  onQuestionTextChange,
  onMove,
  onRemove,
}: QuestionEditorProps) {
  const words = countWords(question.response)
  const overLimit = question.wordLimit > 0 && words > question.wordLimit

  return (
    <article className="question-card">
      <div className="question-card-header">
        <span className="question-number">{index + 1}</span>
        <div className="question-tools">
          <button className="icon-button" title="Move question up" disabled={index === 0} onClick={() => onMove(-1)}>
            <ChevronUp size={16} />
          </button>
          <button
            className="icon-button"
            title="Move question down"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ChevronDown size={16} />
          </button>
          <button className="icon-button danger-button" title="Remove question" onClick={onRemove}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <label>
        Exact funder question
        <textarea
          className="question-prompt-input"
          value={question.exactQuestion}
          onChange={(event) => onQuestionTextChange(event.target.value)}
          placeholder="Paste the exact question from the application portal"
        />
      </label>

      <div className="question-settings">
        <label>
          Question type
          <select
            value={question.category}
            onChange={(event) => onChange({ category: event.target.value as QuestionCategory })}
          >
            {questionCategories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label>
          Word limit
          <input
            type="number"
            min="0"
            value={question.wordLimit || ''}
            placeholder="No limit"
            onChange={(event) => onChange({ wordLimit: Math.max(0, Number(event.target.value) || 0) })}
          />
        </label>
        <label>
          Answer state
          <select
            value={question.responseStatus}
            onChange={(event) => onChange({ responseStatus: event.target.value as ResponseStatus })}
          >
            <option>Draft</option>
            <option>Final</option>
          </select>
        </label>
      </div>

      {previousAnswers.length > 0 && (
        <label className="previous-answer-control">
          <ClipboardPaste size={16} />
          Reuse a previous {question.category.toLowerCase()} answer
          <select
            value=""
            onChange={(event) => {
              const selected = previousAnswers.find((answer) => answer.id === event.target.value)
              if (selected) onChange({ response: selected.answer, responseStatus: 'Draft' })
            }}
          >
            <option value="">Choose an answer to insert verbatim</option>
            {previousAnswers.map((answer) => (
              <option key={answer.id} value={answer.id}>
                {answer.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label>
        Response
        <textarea
          className="response-editor"
          value={question.response}
          onChange={(event) => onChange({ response: event.target.value, responseStatus: 'Draft' })}
          placeholder="Draft the response here"
        />
      </label>
      <div className={overLimit ? 'word-count over-limit' : 'word-count'}>
        {words} words{question.wordLimit ? ` / ${question.wordLimit}` : ''}
      </div>
    </article>
  )
}

function createAnswerSnapshot(
  question: ApplicationQuestion,
  application: GrantApplication,
  sourceStatus: AnswerRecord['sourceStatus'],
): AnswerRecord {
  return {
    id: crypto.randomUUID(),
    grantId: application.grantId,
    applicationId: application.id,
    questionId: question.id,
    questionType: question.category,
    exactQuestion: question.exactQuestion,
    wordLimit: question.wordLimit,
    finalAnswer: question.response,
    sourceStatus,
    createdAt: new Date().toISOString(),
    createdBy: '',
    legacyFunder: '',
    legacyGrantName: '',
  }
}

function getPreviousAnswers(data: AppData, currentQuestion: ApplicationQuestion) {
  const applicationsById = new Map(data.applications.map((application) => [application.id, application]))
  const grantsById = new Map(data.grants.map((grant) => [grant.id, grant]))
  const snapshots = data.answers
    .filter(
      (answer) =>
        answer.questionId !== currentQuestion.id &&
        answer.questionType === currentQuestion.category &&
        answer.finalAnswer.trim(),
    )
    .map((answer) => {
      const application = applicationsById.get(answer.applicationId)
      const grant = grantsById.get(answer.grantId || application?.grantId || '')
      return {
        id: `snapshot:${answer.id}`,
        label: [grant?.funder || answer.legacyFunder, grant?.grantName || answer.legacyGrantName, formatDate(answer.createdAt)]
          .filter(Boolean)
          .join(' / '),
        answer: answer.finalAnswer,
      }
    })
  const live = data.questions
    .filter(
      (question) =>
        question.id !== currentQuestion.id &&
        question.category === currentQuestion.category &&
        question.response.trim(),
    )
    .map((question) => {
      const application = applicationsById.get(question.applicationId)
      const grant = grantsById.get(application?.grantId || '')
      return {
        id: `live:${question.id}`,
        label: [grant?.funder, grant?.grantName, question.responseStatus].filter(Boolean).join(' / '),
        answer: question.response,
      }
    })

  const seen = new Set<string>()
  return [...snapshots, ...live].filter((item) => {
    if (seen.has(item.answer)) return false
    seen.add(item.answer)
    return true
  })
}

function toDateTimeInput(value: string) {
  if (!value) return ''
  const date = new Date(/T\d{2}:\d{2}/.test(value) ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => part.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}
