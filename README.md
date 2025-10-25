# @vritti/api-sdk

A TypeScript SDK for interacting with Vritti APIs.

[![npm version](https://img.shields.io/npm/v/@vritti/api-sdk.svg)](https://www.npmjs.com/package/@vritti/api-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
# npm
npm install @vritti/api-sdk

# yarn
yarn add @vritti/api-sdk

# pnpm
pnpm add @vritti/api-sdk
```

## Usage

```typescript
import { getHello } from '@vritti/api-sdk';

const message = getHello();
console.log(message); // "Hello, World!"
```

## API Documentation

### `getHello()`

Returns a greeting message.

**Returns:** `string` - A hello world message

**Example:**
```typescript
const greeting = getHello();
// Returns: "Hello, World!"
```

## Development

### Prerequisites

- Node.js 18+
- Yarn

### Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/vritti-hub/api-sdk.git
cd api-sdk
yarn install
```

### Available Scripts

- `yarn dev` - Run the SDK in watch mode using tsx
- `yarn build` - Build the SDK for production (outputs CJS and ESM formats)
- `yarn type-check` - Run TypeScript type checking
- `yarn test` - Run tests
- `yarn test:watch` - Run tests in watch mode
- `yarn lint` - Lint source files with ESLint
- `yarn format` - Format code with Prettier
- `yarn format:check` - Check code formatting
- `yarn clean` - Remove build artifacts

### Project Structure

```
api-sdk/
├── src/
│   └── index.ts        # Main entry point
├── dist/               # Build output (generated)
├── .prettierrc         # Prettier configuration
├── eslint.config.js    # ESLint configuration
├── tsconfig.json       # TypeScript configuration
└── package.json        # Package configuration
```

## Building

The SDK is built using [tsup](https://tsup.egoist.dev/) which generates both CommonJS and ESM outputs with TypeScript declarations:

```bash
yarn build
```

This will create:
- `dist/index.js` - ESM build
- `dist/index.cjs` - CommonJS build
- `dist/index.d.ts` - TypeScript declarations for ESM
- `dist/index.d.cts` - TypeScript declarations for CJS

## Testing

Run the test suite:

```bash
yarn test
```

Run tests in watch mode during development:

```bash
yarn test:watch
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests and linting: `yarn test && yarn lint`
5. Commit your changes: `git commit -am 'Add new feature'`
6. Push to the branch: `git push origin feature/my-feature`
7. Submit a pull request

## License

MIT © [Shashank Raju](https://github.com/vritti-hub)

## Author

**Shashank Raju**
- Email: shashank@vrittiai.com
- GitHub: [@vritti-hub](https://github.com/vritti-hub)
