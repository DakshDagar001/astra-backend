# Astra AI — Central Backend & Intelligent Routing Engine (AIRE)

The central backend for Astra AI provides authentication, session management, multi-provider credential security, model discovery, persistent conversation management, and **AIRE (Astra Intelligent Routing Engine)** — an intelligent failover and multi-provider gateway supporting 8 AI providers with real-time SSE streaming.

---

## Architecture & Features

- **Centralized Credential Security**: Private provider API keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, etc.) remain exclusively on the backend and are never sent to Windows or Android clients.
- **Argon2id Authentication**: Single authorized application owner, brute-force protection, and IP-aware rate limiting.
- **Rotating Refresh Tokens & Reuse Detection**: Short-lived JWT access tokens with cryptographically random opaque refresh tokens stored as SHA-256 hashes in PostgreSQL. Any attempt to replay a revoked token revokes the entire token family.
- **8 Supported AI Providers**:
  1. **OpenAI**: GPT-4o, GPT-4o Mini
  2. **Google Gemini**: Gemini 2.5 Flash, Gemini 1.5 Pro
  3. **OpenRouter**: Unified model proxy & aggregator
  4. **Groq**: Ultra-low latency Llama 3.3 70B
  5. **Hugging Face**: Qwen 2.5 Coder
  6. **NVIDIA NIM**: Llama 3.1 70B
  7. **Together AI**: Vision and open-source models
  8. **DeepInfra**: DeepSeek and open-weight models
- **AIRE (Astra Intelligent Routing Engine)**:
  - Hybrid routing with user priority reordering and manual model pinning.
  - Automatic capability-based model selection (filtering out text-only models when image payloads are present).
  - Intelligent failover upon rate limits (429), quota exhaustion, server errors (5xx), and network timeouts.
  - Strict billing safety and refusal to bypass content safety policies.
  - Cooldown tracking with exponential backoff and jitter.
  - Response mode preservation (`FULL_EXPLANATION` vs `ANSWER_ONLY`).
  - First-token streaming safety guarantee.
- **Persistent Conversations**:
  - PostgreSQL multi-turn chat persistence with parent-child message tracking.
  - Conversation branching and conversation history.
  - Strict multi-session data isolation.

---

## Repository Structure

```text
├── src/
│   ├── server.ts
│   ├── app.ts
│   ├── config/
│   │   └── env.ts
│   ├── auth/
│   │   ├── tokens.ts
│   │   ├── argon2.ts
│   │   └── session.service.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── rate-limit.middleware.ts
│   │   ├── request-id.middleware.ts
│   │   └── validate.middleware.ts
│   ├── database/
│   │   ├── connection.ts
│   │   ├── migrate.ts
│   │   └── repositories/
│   ├── providers/
│   │   ├── adapters/
│   │   ├── registry/
│   │   └── interfaces/
│   ├── routing/
│   │   ├── AIRE/
│   │   └── cooldown/
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── ai.routes.ts
│   │   ├── routing.routes.ts
│   │   ├── conversation.routes.ts
│   │   └── health.routes.ts
│   ├── validators/
│   ├── logging/
│   └── utils/
├── migrations/
│   ├── 001_initial_schema.sql
│   └── 002_conversations.sql
├── tests/
│   ├── auth.test.ts
│   ├── providers.test.ts
│   ├── aire.test.ts
│   ├── api.test.ts
│   └── conversations_and_streaming.test.ts
├── scripts/
│   └── setup-db.sh
├── package.json
├── package-lock.json
├── tsconfig.json
├── render.yaml
├── .env.example
├── .gitignore
└── README.md
```

---

## Environment Variables

| Variable | Required | Description | Default |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | `development`, `test`, or `production` | `development` |
| `PORT` | No | HTTP port to listen on | `4000` |
| `DATABASE_URL` | **Yes (Prod)** | PostgreSQL connection string | In-memory (Dev) |
| `ASTRA_PASSWORD_HASH` | **Yes (Prod)** | Argon2id hash of owner password | Testing hash |
| `ASTRA_JWT_SECRET` | **Yes (Prod)** | JWT signing secret ($\ge 32$ chars) | Dev secret |
| `ACCESS_TOKEN_EXPIRY_SECONDS` | No | Access token lifespan in seconds | `900` (15m) |
| `REFRESH_TOKEN_EXPIRY_DAYS` | No | Refresh token lifespan in days | `30` |
| `OPENAI_API_KEY` | Optional | OpenAI API Key | None |
| `GEMINI_API_KEY` | Optional | Google Gemini API Key | None |
| `OPENROUTER_API_KEY` | Optional | OpenRouter API Key | None |
| `GROQ_API_KEY` | Optional | Groq API Key | None |
| `HUGGINGFACE_API_KEY` | Optional | Hugging Face API Token | None |
| `NVIDIA_NIM_API_KEY` | Optional | NVIDIA NIM API Key | None |
| `TOGETHER_API_KEY` | Optional | Together AI API Key | None |
| `DEEPINFRA_API_KEY` | Optional | DeepInfra API Key | None |

---

## Local Setup & Testing

### 1. Installation
```bash
npm install
```

### 2. Password Hash Generation
Generate an Argon2id hash for your owner password:
```bash
npm run hash-password -- "YourSecurePassword123"
```
Copy the generated hash into your `.env` as `ASTRA_PASSWORD_HASH`.

### 3. Build & Run
```bash
# Build TypeScript
npm run build

# Run database migrations
npm run migrate

# Start production server
npm start

# Or run with auto-reload (development)
npm run dev
```

### 4. Running Tests
```bash
npm test
```

---

## Deployment on Render

This repository is pre-configured for automated zero-downtime deployment on Render via [`render.yaml`](./render.yaml).

1. In Render Dashboard, click **New +** -> **Blueprint**.
2. Select your repository: `https://github.com/DakshDagar001/astra-backend`.
3. Render automatically provisions:
   - Web Service `astra-ai-backend` (Node.js 22 LTS).
   - PostgreSQL database `astra-ai-db`.
4. Configure required secrets in the Render Environment Dashboard:
   - `ASTRA_PASSWORD_HASH`
   - Provider API keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, etc.).
5. Build and Start commands run automatically:
   - Build: `npm install && npm run build && npm run migrate`
   - Start: `npm run start`
   - Health check: `/health`
