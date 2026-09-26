# Counsel - AI-Powered Legal Understanding & Preparation Assistant

> **"Understand the law. Know your next step."**

[![Go Version](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go)](https://golang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org)
[![CI/CD](https://img.shields.io/badge/CI-GitHub%20Actions-brightgreen?style=flat&logo=githubactions)](.github/workflows/ci.yml)
[![Vercel Serverless](https://img.shields.io/badge/Vercel-Serverless%20Ready-000000?style=flat&logo=vercel)](https://vercel.com)
[![OWASP Compliant](https://img.shields.io/badge/Security-OWASP%20Top%2010-blue?style=flat&logo=shield)](pkg/api/security_test.go)
[![WCAG 2.1 AA](https://img.shields.io/badge/Accessibility-WCAG%202.1%20AA-success?style=flat)](web/src/styles/index.css)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

Counsel transforms complex, intimidating legal contracts, clauses, and disputes into clear, structured, plain-English guidance. Purpose-built for individuals and small businesses facing legal ambiguity, Counsel bridges the gap between confusing legal jargon and actionable preparation without pretending to replace a qualified lawyer.

---

## Chosen Vertical

### Selected Vertical: AI for Legal Assistance & Access

* **Problem Statement Alignment**: Legal information is often deliberately complex, expensive to decipher, and intimidating to navigate without formal legal representation. Counsel is built specifically for the **AI for Legal Assistance & Access** vertical to democratize legal comprehension, demystify obligations and liabilities, and assist self-represented litigants, tenants, employees, and small business owners in preparing effectively for consultations with licensed legal professionals.
* **Persona**: **Counsel** – An empathetic, editorially poised, and ethically bounded AI legal understanding and preparation assistant. Counsel operates with the bedside manner of a senior attorney briefing partner: calm, objective, analytical, and reassuring.
* **Smart, Dynamic Assistant**: Dynamically orchestrates 8 specialized legal modes (Contract Analysis, Criminal Rights, Civil Disputes, Clause Deep-Dive, Document Review, Agreement Comparison, Prepare for a Lawyer, General Guidance).
* **Logical Decision Making Based on User Context**:
  * **Jurisdiction Engine**: Contextually grounds guidance in statutory frameworks across **India** (Indian Contract Act 1872, BNSS, Consumer Protection Act), the **United States** (UCC, At-Will employment), the **United Kingdom** (Employment Rights Act, Consumer Rights Act), and the **European Union** (GDPR, Civil Code).
  * **Conversational Memory**: Dynamically remembers user context, facts, names, and prior conversational turns without prompting repetition.
  * **Document Intelligence**: Synthesizes uploaded contracts and anchors all findings with grounded page and clause citations.
* **Practical and Real-World Usability**:
  * Side-by-side contract variance analysis (Agreement Comparison).
  * One-click generation of professional attorney briefing memos (Prepare for a Lawyer).
  * Real-time clause risk matrices (High Attention, Worth Reviewing, Informational).
  * Grounded clause citations with exact page numbers (e.g. `[Source: Page 3, Section 7.2]`).
* **Clean and Maintainable Code**: Unified monorepo with modular Go micro-packages, React 19 + TypeScript frontend, sub-millisecond in-memory cache, and automated GitHub Actions CI pipeline.

---

## Approach and Logic

### The 4 Pillars of Ethical Distinction
Counsel is strictly an **understanding and preparation assistant**, never an unlicensed legal adviser. Every response is structured around 4 transparent boundaries:
1. **Plain-English Information**: *"What this clause appears to mean in everyday language."*
2. **Risk Interpretation**: *"This clause may create an obligation or liability worth reviewing."*
3. **Jurisdictional Possibility**: *"Depending on your jurisdiction and factual situation, this could potentially..."*
4. **Professional Advice**: *"A licensed lawyer should verify whether this provision is enforceable in your jurisdiction."*

### 8 Specialized Analytical Modes
* **Contract Analysis**: Audits parties, core obligations, payment terms, duration, termination triggers, restrictive covenants (non-compete/non-solicit), and governing law.
* **Criminal Law Information**: Clarifies terminology, high-level procedural rights (right to counsel, bail concepts, right to remain silent), and factual chronologies while strictly rejecting evasion assistance.
* **Civil Dispute Assistance**: Maps dispute fundamentals, breach allegations, damages, evidence checklists, and upcoming statutes of limitation.
* **Clause Deep-Dive**: Deconstructs individual clauses: plain-English meaning, who is affected, obligations vs. rights, traps, and clarifying questions.
* **Document Review**: Full-spectrum contract audit with an attention matrix (High attention, Worth reviewing, Informational).
* **Agreement Comparison**: Side-by-side variance analysis highlighting executive differences, newly introduced burdens, and removed protections.
* **Prepare for a Lawyer**: Synthesizes messy facts into professional attorney briefing dossiers (Executive Summary, Verified Chronology, Ambiguities, Key Questions, Evidence Checklist).
* **General Guidance**: Automatically classifies user situations into appropriate legal domains and outlines structured procedural roadmaps.

### Prompt Injection Defense Barrier
All uploaded contracts and external text are strictly encapsulated in `<untrusted_document>` XML containers. An automated sanitizer escapes XML breakout sequences (`</untrusted_document>`, `</chunk>`), ensuring malicious contract text cannot override system instructions or alter the assistant's ethical boundaries.

---

## How the Solution Works

### End-to-End Architectural Workflow

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    React 19 + TypeScript Frontend (web/)                    │
│   (Dual-Transport Client: WebSocket with Automatic HTTP SSE Fallback)       │
└───────────────────────┬─────────────────────────────▲───────────────────────┘
                        │                             │
          ┌─────────────┴─────────────────────────────┴─────────────┐
          │                                                         │
   [On Vercel Serverless]                                  [On Standalone Server]
          │                                                         │
          ▼                                                         ▼
HTTP Server-Sent Events (SSE)                             Persistent WebSocket
  POST /api/v1/chat/stream                                      /ws/chat
          │                                                         │
          ▼                                                         ▼
     api/index.go                                          cmd/server/main.go
(Vercel Serverless Function)                               (Go HTTP + WS Server)
          │                                                         │
          └───────────────────────────┬─────────────────────────────┘
                                      ▼
                           pkg/api/router.go
                                      │
          ┌───────────────────────────┼─────────────────────────────┐
          ▼                           ▼                             ▼
┌───────────────────┐       ┌───────────────────┐       ┌───────────────────┐
│ Auth & Canonical  │       │ High-Performance  │       │ OpenRouter Dual   │
│ Identity Verifier │       │ LRU / TTL Cache   │       │ AI Gateway Engine │
└───────────────────┘       └───────────────────┘       └───────────────────┘
```

1. **Document Ingestion & Injection Perimeter**:
   * Text and PDF files up to 20MB are parsed via pure Go parser (`pkg/documents`).
   * Chunks are tagged with page numbers and detected legal headings (e.g. `Section 4.1`, `Article VII`).
   * Content is sanitized of XML breakout tags and packaged inside `<untrusted_document>` containers.
2. **Context Resolution & Multi-Turn Assembly**:
   * `ContextManager` constructs layered prompts combining safety boundaries, persona, jurisdiction guidelines, mode output structures, prior conversation history, and untrusted document text.
3. **High-Performance LRU/TTL Response Cache**:
   * The server generates a deterministic SHA-256 cache key from the prompt, legal mode, jurisdiction, and referenced documents.
   * If a matching query was recently processed, Counsel delivers the response instantaneously (< 5ms) via SSE/WebSocket with zero token consumption and zero LLM latency.
4. **Resilient AI Gateway & Dual-Key Circuit Breaker**:
   * Routes completions through OpenRouter with automated key failover between primary and secondary API keys.
   * Cascades through fast and reasoning models: Google Gemma (26B Fast, 31B Thinking) and NVIDIA Nemotron (120B Super, 550B Ultra).
   * Suppresses internal chain-of-thought tokens, mapping them to reassuring user progress indicators (*"Reviewing relevant clauses..."*).
5. **Grounded Citations & Structured Deliverables**:
   * Outputs explicit citations anchored to document provisions: e.g. `[Source: Page 3, Section 7.2]`.
   * Formats structured Markdown with executive callouts, risk matrices, and actionable checklists.
6. **Dual-Transport Real-Time Delivery**:
   * **Vercel Serverless**: Streams tokens via HTTP Server-Sent Events (SSE) with `X-Accel-Buffering: no`.
   * **Container / VPS**: Uses full-duplex persistent Gorilla WebSockets with ping/pong heartbeats.

---

## Any Assumptions Made

1. **Informational & Educational Scope**: Counsel is designed to provide legal understanding, analysis, and preparation assistance. It is assumed that users understand that the system does not create an attorney-client relationship and does not replace a licensed attorney.
2. **Document Types & Privacy**: Uploaded documents are standard legal instruments (PDF, plain text, Markdown) up to 20MB and 100 pages. Document processing is ephemeral in demo mode or scoped strictly to authenticated tenant storage.
3. **Statutory Baseline**: Legal principles reference contemporary statutes current through 2024–2026 (including India's Bharatiya Nagarik Suraksha Sanhita [BNSS] and Indian Contract Act 1872; US UCC and At-Will doctrine; UK Employment Rights Act 2015; and EU GDPR).
4. **AI Platform & Network Availability**: It is assumed that external LLM endpoints via OpenRouter or fallback providers may experience intermittent latency or rate limits; Counsel assumes failover across dual API keys with an automatic in-memory fallback.
5. **Browser Capabilities**: Client runs in modern web browsers supporting ES2022, Server-Sent Events, WebSockets, and CSS custom properties.

---

## Evaluation Focus Areas

### 1. Code Quality – Structure, Readability & Maintainability
* **Modular Go Monorepo**: Decoupled packages with single-responsibility boundaries (`pkg/ai`, `pkg/api`, `pkg/auth`, `pkg/cache`, `pkg/documents`, `pkg/ratelimit`, `pkg/store`).
* **Strict TypeScript & React 19 Architecture**: Fully typed component hierarchy without `any` bypasses, custom hooks, and memoized components (`React.memo` on message bubbles).
* **Automated CI/CD Pipeline**: GitHub Actions workflow ([`.github/workflows/ci.yml`](file:///.github/workflows/ci.yml)) automatically verifies Go compilation, unit tests, benchmark suites, Vitest frontend tests, and Vite production bundle builds on every push.
* **Clean Code & Error Wrapping**: Comprehensive Go error wrapping with `%w`, context propagation, and explicit type checking. Zero `go vet` warnings.

### 2. Security – Safe & Responsible Implementation
* **Cryptographic JWT Signature Verification**: Eliminates unverified token parsing. All JWTs are strictly validated against HMAC secrets with explicit rejection of `alg: "none"` tokens.
* **Header-Only Authentication**: Enforces `Authorization: Bearer <token>` header transmission, eliminating token leakage via URL query parameters (CWE-598).
* **OWASP Top 10 Security Headers**:
  * `Content-Security-Policy`: Restricts scripts, styles, fonts, and frame ancestors.
  * `Strict-Transport-Security`: Enforces HTTPS (`max-age=31536000; includeSubDomains; preload`).
  * `Permissions-Policy`: Restricts camera, microphone, geolocation, and payment APIs.
  * `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`.
  * `Cross-Origin-Opener-Policy: same-origin-allow-popups` (allows OAuth popups safely).
  * `Cross-Origin-Resource-Policy: cross-origin` (permits authorized API consumption).
* **CORS Domain Whitelisting**: Strict origin matching; eliminates wildcard origin credential reflection attacks (`Access-Control-Allow-Credentials: true` with `*`).
* **Denial-of-Service (DoS) Payload Limiting**: Every HTTP endpoint enforces `http.MaxBytesReader` (64KB for auth/profile, 128KB for conversation metadata, 1MB for chat streaming, 20MB for multipart document uploads).
* **XML Breakout & Prompt Injection Defense**: Neutralizes XML tags (`</untrusted_document>`, `</chunk>`) embedded in uploaded contracts to prevent LLM prompt jailbreaks.
* **Strict Tenant Data Isolation**: All database queries are strictly scoped to the authenticated `user.ID`.

### 3. Efficiency – Optimal Use of Resources
* **In-Memory LRU/TTL Response Cache**:
  * Thread-safe cache (`pkg/cache`) with deterministic SHA-256 key generation.
  * **Benchmark Results**:
    * `BenchmarkMemoryCache_Get`: **14,910,925 ops/sec | 78.05 ns/op | 0 B/op | 0 allocs/op**
    * `BenchmarkMemoryCache_Set`: **6,861,164 ops/sec | 179.0 ns/op | 12 B/op | 1 allocs/op**
  * Eliminates redundant LLM API calls and slashes token consumption by 100% on repeated queries.
* **HTTP Connection Pooling & Keep-Alive**:
  * `OpenRouterClient` utilizes custom `http.Transport` with `MaxIdleConns: 100`, `MaxIdleConnsPerHost: 20`, and `IdleConnTimeout: 90s`, eliminating TCP/TLS handshake latency on repeat requests.
* **Frontend Code-Splitting & Manual Chunking**:
  * `vite.config.ts` breaks the application into dedicated vendor chunks (`vendor-react`, `vendor-icons`, `vendor-pdf`).
  * Slashes initial bundle size from **828 kB down to 311 kB** (gzip: 89 kB), eliminating all chunk size warnings and speeding up first contentful paint (FCP).
* **React Render Optimization**: `MessageBubble` memoized with `React.memo` to eliminate unnecessary component re-renders during streaming token arrival.
* **Bounded CI Resource Utilization**: Vitest configured with `pool: 'threads'`, `fileParallelism: false`, `maxWorkers: 1`, and `minWorkers: 1` to guarantee reliable test execution within constrained CI runner environments.

### 4. Testing – Validation of Functionality
* **Backend Unit & Security Test Suites**: Tests for API routing, SSE streaming with and without flushers, multi-turn context retention, JWT validation, security headers, CORS, and prompt injection defense.
* **Multi-Package Benchmark Suites**: Measures cache retrieval latency, chunking performance, and rate limit token costs across packages (`pkg/cache`, `pkg/documents`, `pkg/ratelimit`, `pkg/ai`).
* **Frontend Vitest Test Suite**: 28 automated tests across 5 test suites covering UI rendering, authentication synchronization, PDF processing, typewriter animations, and SSE streaming fallback.
* **Continuous Integration**: GitHub Actions pipeline runs on every commit, verifying dependencies, unit tests, benchmarks, and production builds.

### 5. Accessibility – Inclusive & Usable Design
* **WCAG 2.1 AA Compliance**: Color palettes carefully calibrated to guarantee a minimum contrast ratio of **4.5:1** for standard text and **3:1** for UI components across dark and light modes.
* **Screen Reader Accessibility**:
  * Dynamic chat stream wrapped in ARIA live regions (`aria-live="polite"`, `role="log"`).
  * Status updates announced clearly without interrupting screen reader flow.
* **Keyboard Navigation**: Complete tab indexing, focus visible outlines, and keyboard shortcuts (`Escape` to close modals, `Enter` to submit, `Shift+Enter` for newlines).
* **Reduced Motion Support**: Dedicated `@media (prefers-reduced-motion: reduce)` stylesheet disables non-essential animations.

---

## Repository Structure

```text
counsel/
├── .github/
│   └── workflows/
│       └── ci.yml              # GitHub Actions CI pipeline (Go + Vite test & build)
├── api/                        # Vercel Serverless entrypoints
│   ├── index.go                # Vercel Go Serverless Function Handler
│   └── index_test.go           # Tests for Vercel Serverless Handler
├── cmd/
│   └── server/                 # Standalone / Docker server entrypoint
│       ├── main.go             # Native HTTP & WebSocket server
│       └── main_test.go        # Server lifecycle tests
├── data/
│   └── sample_docs/            # Realistic sample legal contracts (Lease, NDA, Employment)
├── pkg/                        # Core shared packages
│   ├── ai/                     # OpenRouter client, circuit breaker, prompts, registry, benchmarks
│   ├── api/                    # REST routes, SSE chat streaming handler, middleware, security tests
│   ├── auth/                   # Canonical identity manager, Firebase & Supabase verifiers
│   ├── cache/                  # In-Memory LRU/TTL cache with benchmarks (78ns/op)
│   ├── config/                 # Environment configuration loader
│   ├── documents/              # PDF & plain text parser, XML injection sanitizer, benchmarks
│   ├── logger/                 # Structured JSON logger with secret redaction
│   ├── models/                 # Shared data models and type definitions
│   ├── ratelimit/              # Upstash Redis & in-memory weighted rate limiter, benchmarks
│   ├── store/                  # Store interface, Firestore & in-memory store
│   └── websocket/              # Gorilla WebSocket hub, client, and protocol
├── web/                        # React 19 + TypeScript frontend
│   ├── src/
│   │   ├── api/                # API client (REST + dual-transport ws.ts)
│   │   ├── auth/               # Auth modal, context, demo personas
│   │   ├── components/         # UI components (Composer, Messages, Sidebar, Modals)
│   │   ├── styles/             # Design tokens and WCAG 2.1 AA stylesheets
│   │   ├── types/              # TypeScript interfaces and envelope definitions
│   │   └── __tests__/          # Vitest test suite (UI, Auth, PDF, SSE streaming)
│   ├── package.json            # Frontend scripts and dependencies
│   ├── vite.config.ts          # Vite build with manual chunking (vendor-react, vendor-pdf)
│   └── vitest.config.ts        # Bounded thread pool Vitest config for reliable CI execution
├── .env.example                # Template for environment variables
├── .gitignore                  # Production exclusion rules (<10MB repo size maintained)
├── go.mod                      # Go module definition
├── package.json                # Monorepo root convenience scripts
└── vercel.json                 # Vercel unified monorepo configuration
```

---

## Deployment Guide

### Option 1: Vercel Serverless Monorepo (Recommended)
Counsel is pre-configured to deploy frontend and backend **together in a single Vercel project**.

1. **Push to GitHub**: Ensure repository is public and pushed to `main`.
2. **Import into Vercel**: Visit [vercel.com/new](https://vercel.com/new), select your repo, leave root directory as `./`.
3. **Environment Variables**: Configure `OPENROUTER_API_KEY_PRIMARY` (optional secondary key and database credentials).
4. Vercel automatically builds the React SPA and compiles the Go serverless function.

### Option 2: Standalone Container / VPS
```bash
# Build Go binary
go build -o server ./cmd/server

# Build Frontend
cd web && npm install && npm run build && cd ..

# Run standalone server
PORT=8080 ./server
```

---

## Local Development Setup

### Prerequisites
* **Go**: 1.22 or later
* **Node.js**: 20 or later, with npm

### 1. Run Backend
```bash
go run ./cmd/server
```
Server starts at `http://127.0.0.1:8080`.

### 2. Run Frontend
```bash
cd web
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## Testing & Verification

```bash
# Run all Go unit tests
go test -count=1 -short ./...

# Run Go benchmarks across all packages
go test -run=^$ -bench=. -benchmem ./...

# Run Frontend Vitest tests (28 tests)
cd web && npm run test

# Run Frontend production build
cd web && npm run build
```

---

## Legal Disclaimer

**Counsel provides automated legal document understanding and preparation assistance. It is NOT legal advice, legal representation, or a substitute for a licensed attorney.**

Laws and precedents vary significantly by jurisdiction and change frequently. No attorney-client relationship is formed through the use of Counsel. For critical legal matters, active disputes, criminal proceedings, or contractual execution, always consult a licensed attorney in the appropriate jurisdiction.
