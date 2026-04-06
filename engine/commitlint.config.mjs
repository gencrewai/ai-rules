/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat', 'fix', 'docs', 'chore', 'refactor', 'test', 'style',
    ]],
    'subject-empty': [2, 'never'],
    'type-empty': [2, 'never'],
  },
}
