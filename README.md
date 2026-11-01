# Astra AI — Central Backend & Intelligent Routing Engine (AIRE)

The central backend for Astra AI provides authentication, multi-provider credential security, model discovery, persistent conversation management, and **AIRE (Astra Intelligent Routing Engine)** — an intelligent failover and multi-provider gateway supporting 8 AI providers with real-time SSE streaming.

---

## Architecture & Features

- **Centralized Credential Security**: Private provider API keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, etc.) remain exclusively on the backend and are never sent to Windows or Android clients.
- **Simplified Single-User Authentication**: Single authorized access controlled by `AUTH_PASSWORD`. Validated using constant-time `crypto.timingSafeEqual` SHA-256 comparisons to prevent timing attacks. Supports dedicated `X-Astra-Password` and standard `Authorization: Bearer` headers.
- **Render Free Tier Ready**: Fully self-contained Node.js service that operates on Render's free tier without requiring external PostgreSQL database infrastructure. In-memory session tracking, cooldown management, and conversation storage.
- **8 Supported AI Providers**:
  1. **OpenAI**: `https://api.openai.com/v1` (GPT-4o, GPT-4o Mini)
  2. **Google Gemini**: `https://generativelanguage.googleapis.com/v1beta` (Gemini 2.5 Flash, Gemini 1.5 Pro)
  3. **OpenRouter**: `https://openrouter.ai/api/v1` (Auto Router, Llama 3.3 70B)
  4. **Groq**: `https://api.groq.com/openai/v1` (Ultra-low latency Llama 3.3 70B, Llama 3.2 11B Vision)
  5. **Hugging Face**: `https://router.huggingface.co/v1` (Qwen 2.5 72B Instruct, Llama 3.2 11B Vision)
  6. **NVIDIA NIM**: `https://integrate.api.nvidia.com/v1` (Meta Llama 3.1 70B Instruct, Vision Instruct)
  7. **Together AI**: `https://api.together.xyz/v1` (Llama 3.3 70B Turbo, Vision Turbo)
  8. **DeepInfra**: `https://api.deepinfra.com/v1/openai` (Llama 3.3 70B Instruct, Vision Instruct)
- **AIRE (Astra Intelligent Routing Engine)**:
  - Hybrid routing with user priority reordering and manual model pinning.
  - Automatic capability-based model selection (filtering out text-only models when image payloads are present).
  - Intelligent failover upon rate limits (429), quota exhaustion, server errors (5xx), and network timeouts.
  - Strict billing safety and refusal to bypass content safety policies.
  - Cooldown tracking with exponential backoff and jitter.
  - Response mode preservation (`FULL_EXPLANATION` vs `ANSWER_ONLY`).
  - First-token streaming safety guarantee.
- **Multi-Turn Conversations**:
  - In-memory conversation management with parent-child message tracking.
  - Conversation branching and conversation history.
  - Session isolation.

---

## Repository Structure

```text
├── src/
│   ├── server.ts
│   ├── app.ts
│   ├── config/
│   │   └── env.ts
│   ├── auth/
│   │   ├── simple-auth.ts
│   │   ├── password.ts
│   │   ├── tokens.ts
│   │   └── session-service.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── rate-limit.middleware.ts
│   │   ├── request-id.middleware.ts
│   │   └── validate.middleware.ts
│   ├── database/
│   │   ├── connection.ts
│   │   └── repositories/
│   ├── providers/
│   │   ├── adapters/
│   │   ├── registry/
│   │   ├── interfaces/
│   │   └── metadata/
│   ├── routing/
│   │   ├── AIRE/
│   │   ├── cooldown/
│   │   ├── fallback/
│   │   └── policies/
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── ai.routes.ts
│   │   ├── routing.routes.ts
│   │   ├── conversation.routes.ts
│   │   └── health.routes.ts
│   ├── validators/
│   ├── logging/
│   └── utils/
├── tests/
│   ├── auth.test.ts
│   ├── providers.test.ts
│   ├── aire.test.ts
│   ├── api.test.ts
│   └── conversations_and_streaming.test.ts
├── package.json
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
| `AUTH_PASSWORD` | **Yes (Prod)** | Single-user authentication password | `astra-dev-password` (Dev) |
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

### 2. Configure Environment
Copy `.env.example` to `.env` and set `AUTH_PASSWORD`:
```bash
AUTH_PASSWORD="your-secure-password"
```

### 3. Build & Run
```bash
# Build TypeScript
npm run build

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

## Deployment on Render (Free Tier)

This repository is pre-configured for automated deployment on Render's free tier via [`render.yaml`](./render.yaml).

1. In Render Dashboard, click **New +** -> **Blueprint**.
2. Select your repository: `https://github.com/DakshDagar001/astra-backend`.
3. Render automatically provisions:
   - Web Service `astra-ai-backend` (Node.js 22 LTS, free plan).
4. Configure required secrets in the Render Environment Dashboard:
   - `AUTH_PASSWORD`
   - Provider API keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, etc.).
5. Build and Start commands run automatically:
   - Build: `npm install && npm run build`
   - Start: `npm run start`
   - Health check: `/health`
