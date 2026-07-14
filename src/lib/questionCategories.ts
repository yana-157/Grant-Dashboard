import type { QuestionCategory } from '../types'

export const questionCategories: QuestionCategory[] = [
  'Organization overview',
  'Community need',
  'Program design',
  'Goals and outcomes',
  'Evaluation',
  'Budget',
  'Sustainability',
  'Equity and access',
  'Partnerships',
  'Other',
]

const categoryRules: Array<{ category: QuestionCategory; terms: string[] }> = [
  {
    category: 'Organization overview',
    terms: ['organization', 'mission', 'history', 'founded', 'leadership', 'capacity', 'experience'],
  },
  {
    category: 'Community need',
    terms: ['need', 'problem', 'challenge', 'population', 'community', 'demographic', 'disparit'],
  },
  {
    category: 'Program design',
    terms: ['program', 'project', 'activities', 'approach', 'method', 'implementation', 'timeline'],
  },
  {
    category: 'Goals and outcomes',
    terms: ['goal', 'objective', 'outcome', 'result', 'impact', 'success'],
  },
  {
    category: 'Evaluation',
    terms: ['evaluate', 'evaluation', 'measure', 'metric', 'data', 'track', 'assessment'],
  },
  {
    category: 'Budget',
    terms: ['budget', 'cost', 'expense', 'funding', 'amount', 'financial', 'funds'],
  },
  {
    category: 'Sustainability',
    terms: ['sustain', 'future', 'continue', 'long-term', 'ongoing', 'after the grant'],
  },
  {
    category: 'Equity and access',
    terms: ['equity', 'access', 'inclusive', 'underserved', 'barrier', 'diversity'],
  },
  {
    category: 'Partnerships',
    terms: ['partner', 'collaborat', 'coalition', 'stakeholder', 'referral'],
  },
]

export function suggestQuestionCategory(question: string): QuestionCategory {
  const normalized = question.toLowerCase()
  let best: { category: QuestionCategory; score: number } = { category: 'Other', score: 0 }

  for (const rule of categoryRules) {
    const score = rule.terms.reduce((total, term) => total + (normalized.includes(term) ? 1 : 0), 0)
    if (score > best.score) best = { category: rule.category, score }
  }

  return best.category
}

export function countWords(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}
