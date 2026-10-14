import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", "node_modules/**", "src/generated/**", "playwright-report/**", "test-results/**", "public/sw.js"] },
];
export default config;
