import { Client } from 'langsmith'

let langsmithClient: Client | null = null

export function getLangSmithClient(): Client | null {
  if (!process.env.LANGSMITH_API_KEY) return null
  
  if (!langsmithClient) {
    langsmithClient = new Client({
      apiKey: process.env.LANGSMITH_API_KEY,
    })
  }
  return langsmithClient
}

export async function traceRun(
  name: string,
  runType: 'chain' | 'llm' | 'tool' | 'retriever',
  inputs: Record<string, any>,
  outputs: Record<string, any>,
  metadata?: Record<string, any>
) {
  const client = getLangSmithClient()
  if (!client) return
  
  try {
    await client.createRun({
      name,
      run_type: runType,
      inputs,
      outputs,
      project_name: process.env.LANGSMITH_PROJECT || 'research-agent',
      extra: {
        ...metadata,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
      },
    })
  } catch (error) {
    console.error('LangSmith tracing error:', error)
  }
}

export function createTracer(name: string) {
  return {
    trace: async (inputs: any, fn: () => Promise<any>, metadata?: any) => {
      const startTime = Date.now()
      try {
        const result = await fn()
        await traceRun(name, 'chain', inputs, { result }, { ...metadata, duration: Date.now() - startTime })
        return result
      } catch (error) {
        await traceRun(name, 'chain', inputs, { error: error instanceof Error ? error.message : 'Error' }, { ...metadata, duration: Date.now() - startTime, error: true })
        throw error
      }
    },
    traceTool: async (toolName: string, inputs: any, fn: () => Promise<any>) => {
      const startTime = Date.now()
      try {
        const result = await fn()
        await traceRun(toolName, 'tool', inputs, { result }, { duration: Date.now() - startTime })
        return result
      } catch (error) {
        await traceRun(toolName, 'tool', inputs, { error: error instanceof Error ? error.message : 'Error' }, { duration: Date.now() - startTime, error: true })
        throw error
      }
    },
  }
}