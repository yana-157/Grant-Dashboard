import assert from 'node:assert/strict'
import test from 'node:test'
import { countWords, suggestQuestionCategory } from '../src/lib/questionCategories.ts'

test('suggests stable grant-question categories without AI', () => {
  assert.equal(suggestQuestionCategory('Describe the community need and population you serve.'), 'Community need')
  assert.equal(suggestQuestionCategory('How will you measure program outcomes and collect data?'), 'Evaluation')
  assert.equal(suggestQuestionCategory('Explain how the project will continue after the grant.'), 'Sustainability')
  assert.equal(suggestQuestionCategory('Provide any other information.'), 'Other')
})

test('counts response words consistently', () => {
  assert.equal(countWords(''), 0)
  assert.equal(countWords('  one   two\nthree  '), 3)
})
