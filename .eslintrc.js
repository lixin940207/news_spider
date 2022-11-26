module.exports = {
    "env": {
        "node": true,
        "es6": true
    },
    "extends": [
        "eslint:recommended",
    ],
    "rules": {
        "import/extensions": "off",
        "no-undef": "off",
    },
    "parserOptions": {
        // Required for certain syntax usages
        "ecmaVersion": 2022
    },
}
