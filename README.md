# Quorum

Quorum is a council-style multi-model deliberation app. You provide a question, selected AI models respond independently, deliberate across rounds, and a judge model synthesizes a final verdict.

## Stack

- Next.js (App Router) + TypeScript
- OpenRouter API for model access
- LocalStorage for session persistence

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create local env file:

```bash
cp .env.local.example .env.local
```

3. Add your OpenRouter key to `.env.local`.

4. Run development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000).

## Current Features

- Session creation with question/context
- Model council selection (minimum 2)
- Judge selection and configurable deliberation rounds (0-3)
- Independent round, deliberation rounds, and final judgment
- Round-by-round transcript view
- LocalStorage session history with restore/delete

## Notes

- Responses are non-streaming in this version.
- If OpenRouter returns an error for a model, that model card shows the failure while the round continues.
