'use client'

import { ChatInterface } from '@/components/chat-interface'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.svg"
              alt="Research Agent logo"
              width={34}
              height={34}
              className="rounded-lg ring-1 ring-border/60 shadow-sm"
            />
            <div>
              <h1 className="text-lg font-semibold">Research Agent</h1>
              <p className="text-xs text-muted-foreground">Powered by Vercel AI SDK + LangGraph.js</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="px-2 py-1 bg-secondary rounded-full">v1.0.0</span>
          </div>
        </div>
      </header>
      <ChatInterface />
    </main>
  )
}