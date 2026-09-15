module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    // ここに並べた tsconfig が include していないファイルは、パーサが
    // 読む前に Parsing error で落ちる——つまり lint が1行も効かない。
    // `selftest/` の診断4本がその状態だったので、tsconfig.dev.json の
    // include に "selftest/**/*" を足してある。tsconfig.json（include は
    // src だけ）は本番の書き出しに使うので触らない。
    project: ["tsconfig.json", "tsconfig.dev.json"],
    sourceType: "module",
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files.
    "/generated/**/*", // Ignore generated files.
  ],
  plugins: ["@typescript-eslint", "import"],
  rules: {
    quotes: ["error", "double"],
    "import/no-unresolved": 0,
    indent: ["error", 2],
    "object-curly-spacing": "off",
    "quote-props": "off",
  },
};
