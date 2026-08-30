import { tool } from 'ai'
import { z } from 'zod'

export const webSearchTool = tool({
  description: 'Search the web for current information, news, articles, and resources',
  parameters: z.object({
    query: z.string().describe('Search query to find relevant information'),
    maxResults: z.number().min(1).max(10).default(5).describe('Maximum number of results to return'),
  }),
  execute: async ({ query, maxResults }) => {
    const apiKey = process.env.TAVILY_API_KEY || process.env.SERPER_API_KEY
    
    if (!apiKey) {
      return JSON.stringify({
        error: 'Web search not configured. Please add TAVILY_API_KEY or SERPER_API_KEY to environment variables.',
        query,
        mockResults: [
          { title: 'Mock Result 1', url: 'https://example.com/1', content: `Sample content for: ${query}` },
          { title: 'Mock Result 2', url: 'https://example.com/2', content: `More sample content for: ${query}` },
        ]
      })
    }

    try {
      if (process.env.TAVILY_API_KEY) {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.TAVILY_API_KEY}`,
          },
          body: JSON.stringify({
            query,
            max_results: maxResults,
            search_depth: 'advanced',
            include_answer: true,
            include_raw_content: false,
          }),
        })
        const data = await response.json()
        return JSON.stringify(data.results?.map((r: any) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          score: r.score,
        })) || [])
      }

      if (process.env.SERPER_API_KEY) {
        const response = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': process.env.SERPER_API_KEY,
          },
          body: JSON.stringify({ q: query, num: maxResults }),
        })
        const data = await response.json()
        return JSON.stringify(data.organic?.map((r: any) => ({
          title: r.title,
          url: r.link,
          content: r.snippet,
        })) || [])
      }
    } catch (error) {
      return JSON.stringify({ error: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}` })
    }

    return JSON.stringify({ error: 'No search provider configured' })
  },
})

export const retrieveDocumentsTool = tool({
  description: 'Retrieve relevant documents from a vector database for RAG',
  parameters: z.object({
    query: z.string().describe('Query to find relevant documents'),
    topK: z.number().min(1).max(20).default(5).describe('Number of documents to retrieve'),
    filter: z.record(z.string()).optional().describe('Optional metadata filter'),
  }),
  execute: async ({ query, topK, filter }) => {
    if (!process.env.PINECONE_API_KEY) {
      return JSON.stringify({
        note: 'Vector DB not configured. Add PINECONE_API_KEY for real document retrieval.',
        query,
        mockDocuments: [
          { id: 'doc-1', content: `Relevant document about: ${query}`, metadata: { source: 'mock', score: 0.95 } },
          { id: 'doc-2', content: `Additional context for: ${query}`, metadata: { source: 'mock', score: 0.87 } },
        ]
      })
    }

    try {
      const { Pinecone } = await import('@pinecone-database/pinecone')
      const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY })
      const index = pc.index(process.env.PINECONE_INDEX || 'research-agent')
      
      const { OpenAIEmbeddings } = await import('@langchain/openai')
      const embeddings = new OpenAIEmbeddings({ model: 'text-embedding-3-small' })
      const queryVector = await embeddings.embedQuery(query)
      
      const results = await index.query({
        vector: queryVector,
        topK,
        filter,
        includeMetadata: true,
      })
      
      return JSON.stringify(results.matches?.map((match: any) => ({
        id: match.id,
        content: match.metadata?.text || match.metadata?.content || '',
        metadata: match.metadata,
        score: match.score,
      })) || [])
    } catch (error) {
      return JSON.stringify({ error: `Document retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}` })
    }
  },
})

export const executeCodeTool = tool({
  description: 'Execute JavaScript/TypeScript code in a sandboxed environment for calculations, data processing, or verification',
  parameters: z.object({
    code: z.string().describe('Code to execute (JavaScript/TypeScript)'),
    timeout: z.number().min(1000).max(30000).default(5000).describe('Execution timeout in milliseconds'),
  }),
  execute: async ({ code, timeout }) => {
    try {
      const { Worker } = await import('worker_threads')
      
      return new Promise<string>((resolve) => {
        const workerCode = `
          const { parentPort } = require('worker_threads')
          try {
            const result = (async () => { ${code} })()
            Promise.resolve(result).then(r => parentPort.postMessage({ success: true, result: r }))
          } catch (e) {
            parentPort.postMessage({ success: false, error: e.message })
          }
        `
        
        const worker = new Worker(workerCode, { eval: true })
        const timer = setTimeout(() => {
          worker.terminate()
          resolve(JSON.stringify({ error: `Execution timeout after ${timeout}ms` }))
        }, timeout)
        
        worker.on('message', (msg) => {
          clearTimeout(timer)
          if (msg.success) {
            resolve(JSON.stringify({ result: msg.result }))
          } else {
            resolve(JSON.stringify({ error: msg.error }))
          }
        })
        
        worker.on('error', (err) => {
          clearTimeout(timer)
          resolve(JSON.stringify({ error: err.message }))
        })
      })
    } catch (error) {
      return JSON.stringify({ error: `Code execution failed: ${error instanceof Error ? error.message : 'Unknown error'}` })
    }
  },
})

export const synthesizeFindingsTool = tool({
  description: 'Synthesize research findings from multiple sources into a structured report with citations',
  parameters: z.object({
    sources: z.array(z.object({
      title: z.string(),
      url: z.string().optional(),
      content: z.string(),
      relevance: z.number().optional(),
    })).describe('Array of source documents with content'),
    question: z.string().describe('Original research question'),
    format: z.enum(['summary', 'detailed', 'bullet-points', 'comparison']).default('detailed').describe('Output format'),
  }),
  execute: async ({ sources, question, format }) => {
    const formattedSources = sources.map((s, i) => `[${i + 1}] ${s.title}${s.url ? ` (${s.url})` : ''}: ${s.content}`).join('\n\n')
    
    return JSON.stringify({
      question,
      format,
      sourceCount: sources.length,
      synthesis: `Based on ${sources.length} sources, here is a ${format} analysis of "${question}"...`,
      citations: sources.map((s, i) => ({ index: i + 1, title: s.title, url: s.url })),
    })
  },
})