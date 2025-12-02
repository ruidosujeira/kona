process.env.FUSEBOX_DIST_ROOT = __dirname;
process.env.KONA_DIST_ROOT = __dirname;
process.env.JEST_TEST = 'true';
module.exports = {
  globals: {
    'ts-jest': {
      diagnostics: false,
      tsconfig: 'src/tsconfig.json',
    },
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      diagnostics: false,
      tsconfig: 'src/tsconfig.json',
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(open|get-port)/)',
  ],
  coveragePathIgnorePatterns: ['test_utils.ts', 'logging/logging.ts', 'logging/spinner.ts'],
  maxConcurrency: 1,
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  modulePathIgnorePatterns: ['/modules', '/_modules'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^open$': '<rootDir>/src/__mocks__/open.ts',
  },
  testPathIgnorePatterns: [
    '<rootDir>/.fusebox/',
    '<rootDir>/.kona/',
    '<rootDir>/lib/',
    '<rootDir>/__refactor/',
    '<rootDir>/____production/',
    '<rootDir>/node_modules/',
    '<rootDir>/_playground/',
    '<rootDir>/playground/',
    '<rootDir>/dist/',
    '<rootDir>/.dev/',
    '<rootDir>/website/',
    '<rootDir>/packages/',
  ],
  testRegex: '(/(__tests__|tests)/.*|(\\.|/))\\.test\\.tsx?$',
  watchPathIgnorePatterns: ['.tmp', 'dist'],
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
};
