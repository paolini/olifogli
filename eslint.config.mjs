import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
];

eslintConfig.push({
  rules: {
    '@typescript-eslint/no-unused-vars': 'off',
  },
});

eslintConfig.push({
  files: ['app/graphql/generated.ts'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-empty-object-type': 'off',
  },
});

eslintConfig.push({
  files: ['app/lib/schema/CompetitionWithVariants.ts'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
  },
});

// Next.js 16 adds React Compiler diagnostics. Keep existing patterns visible
// while migrating the framework without refactoring the table/editor lifecycle.
// React Compiler is not enabled; other files retain the preset's error level.
eslintConfig.push({
  files: [
    'app/components/LoadingWrapper.tsx',
    'app/components/OlimanagerLoginButton.tsx',
    'app/components/Sheet.tsx',
    'app/components/Table.tsx',
  ],
  rules: { 'react-hooks/set-state-in-effect': 'warn' },
}, {
  files: ['app/components/Table.tsx'],
  rules: { 'react-hooks/refs': 'warn' },
}, {
  files: ['app/components/ScansImport.tsx'],
  rules: { 'react-hooks/purity': 'warn' },
}, {
  files: ['app/components/Users.tsx'],
  rules: { 'react-hooks/static-components': 'warn' },
});

export default eslintConfig;
