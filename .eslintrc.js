module.exports = {
  extends: ["standard", "prettier"],
  plugins: ["prettier"],
  rules: {
    "prettier/prettier": "error",
  },
  env: {
    node: true,
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
};
