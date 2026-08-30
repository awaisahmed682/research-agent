# Research Agent

A production-ready multi-step research agent built with **Next.js 15**, **Vercel AI SDK**, and **LangGraph.js**. Features tool-calling, streaming responses, web search, document retrieval (RAG), code execution, and LangSmith observability.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User Query                             │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Planner (LLM)                              │
│  • Decomposes question into research steps                 │
│  • Selects appropriate tools per step                      │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Researcher (LangGraph Loop)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Web Search  │  │   Retrieve  │  │ Execute     │         │
│  │  (Tavily)   │  │  Documents  │  │  Code       │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│         │               │               │                   │
│         └───────────────┼───────────────┘                   │
│                         ▼                                   │
│              ┌─────────────────────┐                        │
│              │   Synthesizer       │                        │
│              │  (Final Answer)     │                        │
│              └─────────────────────┘                        │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Streaming UI (Vercel AI SDK)                   │
│  • Real-time token streaming                                │
│  • Tool call visualization                                  │
│  • Citations & sources                                      │
└─────────────────────────────────────────────────────────────┘
```

## Features

- **Multi-step Research**: Automatic query decomposition → tool execution → synthesis
- **Tool Calling**: Web search (Tavily/Serper), RAG (Pinecone), Code execution
- **Streaming UI**: Real-time responses with `useChat` hook, tool visualization
- **Observability**: LangSmith tracing for all runs and tool calls
- **TypeScript**: Full type safety with Zod schemas
- **Deploy Ready**: Vercel configuration included

## Quick Start

### 1. Clone & Install

```bash
cd research-agent
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Add your API keys:
```env
# Required: At least one LLM provider
OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...

# Optional: Web search (choose one)
TAVILY_API_KEY=tvly-...        # Recommended
SERPER_API_KEY=...             # Alternative

# Optional: Vector DB for RAG
PINECONE_API_KEY=...
PINECONE_INDEX=research-agent

# Optional: Observability
LANGSMITH_API_KEY=...
LANGSMITH_PROJECT=research-agent
```

### 3. Run Development

```bash
npm run dev
```

Open http://localhost:3000

### 4. Deploy to Vercel

```bash
npx vercel
```

Add environment variables in Vercel dashboard.

## Project Structure

```
research-agent/
├── src/
│   ├── app/
│   │   ├── api/chat/route.ts      # Streaming chat endpoint
│   │   ├── globals.css            # Tailwind + CSS variables
│   │   ├── layout.tsx             # Root layout
│   │   └── page.tsx               # Main page
│   ├── components/
│   │   └── chat-interface.tsx     # Chat UI with tool visualization
│   └── lib/
│       ├── tools.ts               # AI SDK tool definitions
│       ├── research-agent.ts      # LangGraph workflow
│       ├── observability.ts       # LangSmith integration
│       └── utils.ts               # Helpers
├── vercel.json                    # Vercel deployment config
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── .env.example
```

## Key Implementation Details

### Streaming with Tool Visualization

The chat interface uses Vercel AI SDK's `useChat` hook with `maxSteps: 5` for multi-step tool calling:

```typescript
const result = await streamText({
  model: openai('gpt-4o-mini'),
  tools: { web_search, retrieve_documents, execute_code, synthesize_findings },
  maxSteps: 5,  // Allow up to 5 tool-calling rounds
})
```

### LangGraph Workflow

The research agent uses a compiled LangGraph state machine:

```typescript
const researchGraph = new StateGraph<ResearchState>({...})
  .addNode('planner', planner)
  .addNode('researcher', researcher)
  .addNode('synthesizer', synthesizer)
  .addEdge(START, 'planner')
  .addConditionalEdges('researcher', shouldContinue)
  .addEdge('synthesizer', END)

export const researchAgent = researchGraph.compile()
```

### Observability

Every run and tool call is traced to LangSmith:

```typescript
await traceRun('web_search', 'tool', { query }, { results }, { duration: 1200ms })
```

## Customization

### Add New Tools

1. Define in `src/lib/tools.ts` using `tool()` from `ai`
2. Add to `tools` object in `src/app/api/chat/route.ts`
3. Update system prompt if needed

### Modify Research Flow

Edit `src/lib/research-agent.ts`:
- `planner`: Change decomposition logic
- `researcher`: Modify tool selection
- `synthesizer`: Customize final answer format

### UI Theming

Modify CSS variables in `src/app/globals.css` for custom colors.

## Evaluation Checklist (Vikara AI Alignment)

- [x] **Multi-agent orchestration** (LangGraph state machine)
- [x] **Tool calling** (web search, RAG, code execution)
- [x] **Memory/state management** (ResearchState with findings array)
- [x] **Streaming UI** (Vercel AI SDK useChat)
- [x] **Observability** (LangSmith tracing)
- [x] **Production deployment** (Vercel config)
- [x] **TypeScript strict mode**
- [x] **Error handling & fallbacks**
- [x] **Citations & source attribution**

## License

MIT