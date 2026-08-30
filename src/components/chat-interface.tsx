'use client'

import { useChat } from 'ai/react'
import { useState, useRef, useEffect, useMemo } from 'react'
import { Send, Loader2, Search, FileText, Terminal, ChevronDown, ChevronUp, Copy, Check, AlertCircle, Brain, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolCall {
  name: string
  input: Record<string, unknown>
  output?: string
  status: 'running' | 'completed' | 'error'
  startTime: number
  endTime?: number
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  timestamp: Date
}

const toolIcons: Record<string, React.ReactNode> = {
  web_search: <Search className="w-4 h-4" />,
  retrieve_documents: <FileText className="w-4 h-4" />,
  execute_code: <Terminal className="w-4 h-4" />,
  synthesize_findings: <Brain className="w-4 h-4" />,
}

function formatToolName(name: string) {
  return (
    <span className="flex items-center gap-2 font-medium capitalize">
      {toolIcons[name] || <Zap className="w-4 h-4" />}
      {name.replace(/_/g, ' ')}
    </span>
  )
}

function getStatusIcon(status: ToolCall['status']) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-4 h-4 animate-spin text-primary" />
    case 'completed':
      return <Check className="w-4 h-4 text-green-500" />
    case 'error':
      return <AlertCircle className="w-4 h-4 text-red-500" />
  }
}

function extractToolCalls(parts: any[]): ToolCall[] {
  const toolCalls: ToolCall[] = []
  for (const part of parts || []) {
    if (part.type === 'tool-invocation') {
      const invocation = part.toolInvocation
      toolCalls.push({
        name: invocation.toolName,
        input: invocation.args,
        output: invocation.result ? JSON.stringify(invocation.result) : undefined,
        status: invocation.state === 'calling' ? 'running' : invocation.state === 'result' ? 'completed' : 'error',
        startTime: Date.now(),
        endTime: invocation.state === 'result' ? Date.now() : undefined,
      })
    }
  }
  return toolCalls
}

function extractContent(parts: any[]): string {
  let content = ''
  for (const part of parts || []) {
    if (part.type === 'text') {
      content += part.text
    }
  }
  return content
}

function convertUIMessage(uiMsg: any): Message {
  return {
    id: uiMsg.id,
    role: uiMsg.role,
    content: extractContent(uiMsg.parts),
    toolCalls: extractToolCalls(uiMsg.parts),
    timestamp: new Date(),
  }
}

export function ChatInterface() {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { messages: uiMessages, append, status, error } = useChat({
    api: '/api/chat',
    onFinish: () => {
      setIsLoading(false)
      scrollToBottom()
    },
    onError: (err) => {
      console.error('Chat error:', err)
      setIsLoading(false)
    },
  })

  const messages = useMemo(() => uiMessages.map(convertUIMessage), [uiMessages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    setIsLoading(true)
    await append({ role: 'user', content: input })
    setInput('')
  }

  const toggleTool = (toolId: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev)
      if (next.has(toolId)) next.delete(toolId)
      else next.add(toolId)
      return next
    })
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Brain className="w-12 h-12 mb-4 opacity-50" />
            <h2 className="text-xl font-semibold mb-2">Welcome to Research Agent</h2>
            <p className="max-w-md mb-6">
              Ask me anything — I'll break down your question, search the web, retrieve documents,
              execute code, and synthesize findings with citations.
            </p>
            <div className="flex flex-wrap gap-2 justify-center text-sm">
              <ExampleQuery query="Latest developments in AI agent architectures" onClick={() => append({ role: 'user', content: "Latest developments in AI agent architectures" })} />
              <ExampleQuery query="Compare LangGraph vs CrewAI for multi-agent systems" onClick={() => append({ role: 'user', content: "Compare LangGraph vs CrewAI for multi-agent systems" })} />
              <ExampleQuery query="How does RAG work with vector databases?" onClick={() => append({ role: 'user', content: "How does RAG work with vector databases?" })} />
              <ExampleQuery query="Build a research workflow for market analysis" onClick={() => append({ role: 'user', content: "Build a research workflow for market analysis" })} />
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            expandedTools={expandedTools}
            onToggleTool={toggleTool}
            onCopy={copyToClipboard}
            isLast={index === messages.length - 1}
          />
        ))}

        {status === 'streaming' && (
          <div className="flex items-start gap-3 animate-fade-in">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="bg-muted/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Research agent is thinking...</span>
                </div>
                <div className="h-4 bg-primary/10 rounded overflow-hidden">
                  <div className="h-full bg-primary animate-pulse" style={{ width: '60%' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="border-t border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span>Error: {error.message}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t p-4 bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto max-w-4xl">
          <div className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              placeholder="Ask a research question..."
              rows={1}
              className="flex-1 min-h-[48px] max-h-48 px-4 py-3 bg-background border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              aria-label="Send message"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Enter</kbd> to send, <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Shift+Enter</kbd> for new line
          </p>
        </div>
      </form>
    </div>
  )
}

function ExampleQuery({ query, onClick }: { query: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-full text-sm transition-colors"
    >
      {query}
    </button>
  )
}

function MessageBubble({
  message,
  expandedTools,
  onToggleTool,
  onCopy,
  isLast,
}: {
  message: Message
  expandedTools: Set<string>
  onToggleTool: (id: string) => void
  onCopy: (text: string) => void
  isLast: boolean
}) {
  const isUser = message.role === 'user'
  const toolCalls = message.toolCalls || []

  return (
    <div className={cn('flex gap-3 animate-fade-in', isUser && 'flex-row-reverse')}>
      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', isUser ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary')}>
        {isUser ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ) : (
          <Brain className="w-5 h-5" />
        )}
      </div>
      <div className={cn('flex-1 max-w-[85%]', isUser && 'text-right')}>
        <div className={cn('inline-block max-w-full', isUser ? 'text-left' : '')}>
          <div className={cn('rounded-2xl p-4', isUser ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted/50 rounded-bl-md')}>
            <div className="prose prose-sm max-w-none {isUser ? 'prose-invert' : ''} whitespace-pre-wrap">
              {message.content}
            </div>
          </div>

          {toolCalls.length > 0 && (
            <div className="mt-3 space-y-2" role="region" aria-label="Tool calls">
              {toolCalls.map((tool, idx) => {
                const toolId = `${message.id}-${idx}`
                const isExpanded = expandedTools.has(toolId)
                const duration = tool.endTime ? tool.endTime - tool.startTime : Date.now() - tool.startTime

                return (
                  <div key={toolId} className="bg-card border rounded-xl overflow-hidden">
                    <button
                      onClick={() => onToggleTool(toolId)}
                      className="w-full p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
                      aria-expanded={isExpanded}
                    >
                      <div className="flex items-center gap-2">
                        {getStatusIcon(tool.status)}
                        {formatToolName(tool.name)}
                      </div>
                      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{duration}ms</span>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="border-t p-3 space-y-3 bg-muted/30">
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Input</label>
                          <div className="relative">
                            <pre className="bg-background p-3 rounded-lg text-xs overflow-x-auto font-mono max-h-48 overflow-y-auto"><code>{JSON.stringify(tool.input, null, 2)}</code></pre>
                            <button
                              onClick={() => onCopy(JSON.stringify(tool.input, null, 2))}
                              className="absolute top-2 right-2 p-1 hover:bg-muted rounded opacity-0 hover:opacity-100 transition-opacity"
                              aria-label="Copy input"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {tool.output && (
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Output</label>
                            <div className="relative">
                              <pre className="bg-background p-3 rounded-lg text-xs overflow-x-auto font-mono max-h-64 overflow-y-auto whitespace-pre-wrap"><code>{tool.output}</code></pre>
                              <button
                                onClick={() => onCopy(tool.output!)}
                                className="absolute top-2 right-2 p-1 hover:bg-muted rounded opacity-0 hover:opacity-100 transition-opacity"
                                aria-label="Copy output"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <span>{message.timestamp.toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}