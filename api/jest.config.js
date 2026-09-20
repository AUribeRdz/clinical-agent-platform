// Jest configuration for the acceptance tests in ../tests and the pattern tests in ../patterns.
// Run from this folder:  npm test
module.exports = {
  rootDir: '..',
  roots: ['<rootDir>/tests', '<rootDir>/patterns'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.js', '**/test.ts'],
  transform: {
    // ts-jest also compiles the ES-module syntax used in tests/*.test.js
    '^.+\\.(ts|js)$': [require.resolve('ts-jest'), {
      tsconfig: { allowJs: true, esModuleInterop: true, module: 'commonjs', target: 'ES2020' },
      diagnostics: false,
    }],
  },
  moduleDirectories: ['node_modules', '<rootDir>/api/node_modules'],
}
