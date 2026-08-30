import { StateGraph, END, START, Annotation } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { tool } from 'ai'
import { z } from 'zod'

export interface ResearchState {
  question: string
  researchPlan: string[]
  currentStep: number
  findings: Array<{
    step: string
    tool: string
    input: any
    output: any
    timestamp: number
  }>
  finalAnswer: string
  citations: Array<{ index: number; title: string; url?: string }>
}

const ResearchStateAnnotation = Annotation.Root({
  question: Annotation<string>({
    default: () => '',
    reducer: (left, right) => right,
  }),
  researchPlan: Annotation<string[]>({
    default: () => [],
    reducer: (left, right) => right,
  }),
  currentStep: Annotation<number>({
    default: () => 0,
    reducer: (left, right) => right,
  }),
  findings: Annotation<Array<{
    step: string
    tool: string
    input: any
    output: any
    timestamp: number
  }>>({
    default: () => [],
    reducer: (left, right) => [...left, ...right],
  }),
  finalAnswer: Annotation<string>({
    default: () => '',
    reducer: (left, right) => right,
  }),
  citations: Annotation<Array<{ index: number; title: string; url?: string }>>({
    default: () => [],
    reducer: (left, right) => right,
  }),
})

const webSearch = tool({
  description: 'Search the web for current information',
  parameters: z.object({
    query: z.string(),
    maxResults: z.number().default(5),
  }),
  execute: async ({ query, maxResults }) => {
    if (!process.env.TAVILY_API_KEY && !process.env.SERPER_API_KEY) {
      return JSON.stringify({
        results: [
          { title: `Mock: ${query}`, url: 'https://example.com', content: `Sample content for ${query}`, score: 0.9 }
        ]
      })
    }
    return JSON.stringify({ results: [] })
  },
})

const retrieveDocs = tool({
  description: 'Retrieve documents from vector database',
  parameters: z.object({
    query: z.string(),
    topK: z.number().default(5),
  }),
  execute: async ({ query, topK }) => {
    return JSON.stringify({ documents: [] })
  },
})

const executeCode = tool({
  description: 'Execute code for calculations/verification',
  parameters: z.object({
    code: z.string(),
  }),
  execute: async ({ code }) => {
    try {
      const result = await eval(`(async () => { ${code} })()`)
      return JSON.stringify({ result })
    } catch (e) {
      return JSON.stringify({ error: e instanceof Error ? e.message : 'Error' })
    }
  },
})

const synthesize = tool({
  description: 'Synthesize findings into final answer',
  parameters: z.object({
    findings: z.array(z.any()),
    question: z.string(),
  }),
  execute: async ({ findings, question }) => {
    return JSON.stringify({
      answer: `Research complete for: ${question}`,
      citations: findings.map((f, i) => ({ index: i + 1, source: f.tool }))
    })
  },
})

const toolMap = {
  web_search: webSearch,
  retrieve_documents: retrieveDocs,
  execute_code: executeCode,
  synthesize_findings: synthesize,
}

const model = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
}).bindTools([webSearch, retrieveDocs, executeCode, synthesize] as any)

async function planner(state: typeof ResearchStateAnnotation.State): Promise<Partial<typeof ResearchStateAnnotation.State>> {
  const prompt = `You are a research planner. Given the question, create a step-by-step research plan.
  
  Question: ${state.question}
  
  Available tools: web_search, retrieve_documents, execute_code, synthesize_findings
  
  Create a JSON array of steps, each with: step (description), tool (which tool to use), reason (why this step).
  Return ONLY the JSON array.`
  
  const response = await model.invoke([new HumanMessage(prompt)])
  let plan: Array<{ step: string; tool: string; reason: string }> = []
  
  try {
    const content = response.content as string
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) plan = JSON.parse(jsonMatch[0])
  } catch {
    plan = [
      { step: 'Search for current information', tool: 'web_search', reason: 'Get latest data' },
      { step: 'Retrieve relevant documents', tool: 'retrieve_documents', reason: 'Find authoritative sources' },
      { step: 'Synthesize findings', tool: 'synthesize_findings', reason: 'Create final answer' },
    ]
  }
  
  return { researchPlan: plan.map(p => p.step), currentStep: 0, findings: [] }
}

async function researcher(state: typeof ResearchStateAnnotation.State): Promise<Partial<typeof ResearchStateAnnotation.State>> {
  const plan = state.researchPlan
  const stepIndex = state.currentStep
  
  if (stepIndex >= plan.length) {
    return { currentStep: plan.length }
  }
  
  const currentStep = plan[stepIndex]
  const toolName = currentStep.includes('search') ? 'web_search' :
                   currentStep.includes('retrieve') ? 'retrieve_documents' :
                   currentStep.includes('code') ? 'execute_code' :
                   'synthesize_findings'
  
  const tool = toolMap[toolName as keyof typeof toolMap]
  if (!tool) {
    return { currentStep: stepIndex + 1 }
  }
  
  let input: any = {}
  if (toolName === 'web_search' || toolName === 'retrieve_documents') {
    input = { query: state.question, maxResults: 5 }
  } else if (toolName === 'execute_code') {
    input = { code: `// Analysis for: ${state.question}\nconsole.log("Processing...")` }
  } else if (toolName === 'synthesize_findings') {
    input = { findings: state.findings, question: state.question }
  }
  
  const startTime = Date.now()
  const result = await (tool as any).execute(input)
  const endTime = Date.now()
  
  let output: any
  try {
    output = JSON.parse(result)
  } catch {
    output = { raw: result }
  }
  
  const newFinding = {
    step: currentStep,
    tool: toolName,
    input,
    output,
    timestamp: startTime,
  }
  
  return {
    findings: [newFinding],
    currentStep: stepIndex + 1,
  }
}

async function shouldContinue(state: typeof ResearchStateAnnotation.State): Promise<string> {
  return state.currentStep < state.researchPlan.length ? 'researcher' : 'synthesizer'
}

async function synthesizer(state: typeof ResearchStateAnnotation.State): Promise<Partial<typeof ResearchStateAnnotation.State>> {
  const tool = toolMap.synthesize_findings
  const result = await (tool as any).execute({ findings: state.findings, question: state.question })
  
  let output: any
  try {
    output = JSON.parse(result)
  } catch {
    output = { answer: result, citations: [] }
  }
  
  return {
    finalAnswer: output.answer || 'Research completed.',
    citations: output.citations || [],
  }
}

export const researchGraph = new StateGraph(ResearchStateAnnotation)
  .addNode('planner', planner)
  .addNode('researcher', researcher)
  .addNode('synthesizer', synthesizer)
  .addEdge(START, 'planner')
  .addEdge('planner', 'researcher')
  .addConditionalEdges('researcher', shouldContinue, {
    researcher: 'researcher',
    synthesizer: 'synthesizer',
  })
  .addEdge('synthesizer', END)

export const researchAgent = researchGraph.compile()