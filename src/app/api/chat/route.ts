import { streamText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const webSearchTool = tool({
  description: 'Search the web for current information',
  parameters: z.object({
    query: z.string(),
    maxResults: z.number().default(5),
  }),
  execute: async ({ query, maxResults }) => {
    if (!process.env.TAVILY_API_KEY && !process.env.SERPER_API_KEY) {
      return {
        results: [
          { title: `Research: ${query}`, url: 'https://example.com/1', content: `Key findings about ${query}...`, score: 0.92 },
          { title: `Analysis: ${query}`, url: 'https://example.com/2', content: `Detailed analysis of ${query}...`, score: 0.87 },
          { title: `Guide: ${query}`, url: 'https://example.com/3', content: `Comprehensive guide to ${query}...`, score: 0.83 },
        ]
      }
    }
    
    try {
      if (process.env.TAVILY_API_KEY) {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TAVILY_API_KEY}` },
          body: JSON.stringify({ query, max_results: maxResults, search_depth: 'advanced' }),
        })
        const data = await response.json()
        return { results: data.results?.map((r: any) => ({ title: r.title, url: r.url, content: r.content, score: r.score })) || [] }
      }
      
      if (process.env.SERPER_API_KEY) {
        const response = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-KEY': process.env.SERPER_API_KEY },
          body: JSON.stringify({ q: query, num: maxResults }),
        })
        const data = await response.json()
        return { results: data.organic?.map((r: any) => ({ title: r.title, url: r.link, content: r.snippet })) || [] }
      }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Search failed' }
    }
    return { error: 'No search provider configured' }
  },
})

const retrieveDocumentsTool = tool({
  description: 'Retrieve relevant documents from vector database',
  parameters: z.object({
    query: z.string(),
    topK: z.number().default(5),
  }),
  execute: async ({ query, topK }) => {
    if (!process.env.PINECONE_API_KEY) {
      return {
        documents: [
          { id: 'doc-1', content: `Relevant content about ${query} from knowledge base`, metadata: { source: 'internal', score: 0.95 } },
          { id: 'doc-2', content: `Additional context for ${query}`, metadata: { source: 'internal', score: 0.88 } },
        ]
      }
    }
    
    try {
      const { Pinecone } = await import('@pinecone-database/pinecone')
      const { OpenAIEmbeddings } = await import('@langchain/openai')
      
      const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY })
      const index = pc.index(process.env.PINECONE_INDEX || 'research-agent')
      const embeddings = new OpenAIEmbeddings({ model: 'text-embedding-3-small' })
      const vector = await embeddings.embedQuery(query)
      
      const results = await index.query({ vector, topK, includeMetadata: true })
      return { 
        documents: results.matches?.map((m: any) => ({ 
          id: m.id, 
          content: m.metadata?.text || m.metadata?.content || '', 
          metadata: m.metadata, 
          score: m.score 
        })) || [] 
      }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Retrieval failed' }
    }
  },
})

const executeCodeTool = tool({
  description: 'Execute JavaScript code for calculations and data processing',
  parameters: z.object({
    code: z.string(),
  }),
  execute: async ({ code }) => {
    try {
      // Simple eval for basic calculations (no worker_threads in Vercel)
      const result = await eval(`(async () => { ${code} })()`)
      return { result }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Execution failed' }
    }
  },
})

const synthesizeTool = tool({
  description: 'Synthesize research findings into a structured answer',
  parameters: z.object({
    sources: z.array(z.object({
      title: z.string(),
      url: z.string().optional(),
      content: z.string(),
    })),
    question: z.string(),
  }),
  execute: async ({ sources, question }) => {
    const citations = sources.map((s, i) => `[${i + 1}] ${s.title}${s.url ? ` (${s.url})` : ''}`)
    return {
      answer: `## Research Results for: ${question}\n\nBased on ${sources.length} sources, here are the key findings:\n\n${sources.map((s, i) => `**${i + 1}. ${s.title}**\n${s.content.substring(0, 300)}...`).join('\n\n')}\n\n### Citations\n${citations.join('\n')}`,
      citations: sources.map((s, i) => ({ index: i + 1, title: s.title, url: s.url })),
    }
  },
})

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    let messages: any[]
    try {
      const body = await req.text()
      console.log('Request body:', body)
      messages = JSON.parse(body).messages
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError)
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    const lastMessage = messages[messages.length - 1]
    const question = lastMessage?.content || ''
    
    const systemPrompt = `You are a research agent that helps users find, analyze, and synthesize information.

When given a research question:
1. Break it down into searchable sub-questions
2. Use web_search for current information, news, and general knowledge
3. Use retrieve_documents for authoritative/technical sources from knowledge base
4. Use execute_code for calculations, data analysis, or verification
5. Use synthesize_findings to create a comprehensive, well-cited answer

Always cite your sources. Be thorough but concise. Structure answers with clear headings.`

    const result = await streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
      tools: {
        web_search: webSearchTool,
        retrieve_documents: retrieveDocumentsTool,
        execute_code: executeCodeTool,
        synthesize_findings: synthesizeTool,
      },
      maxSteps: 5,
      temperature: 0.3,
    })
    
    return result.toDataStreamResponse()
  } catch (error) {
    console.error('Chat API error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}