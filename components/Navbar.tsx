'use client'

import Link from 'next/link'
import { Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Navbar({ className }: { className?: string }) {
  return (
    <nav className={cn(
      'fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0d0d1a]/80 backdrop-blur-xl',
      className
    )}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 shadow-lg shadow-violet-500/30 transition-all group-hover:shadow-violet-500/50 group-hover:scale-105">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight">
            Drop<span className="text-violet-400">Zap</span>
          </span>
        </Link>

        {/* Nav links */}
        <div className="hidden sm:flex items-center gap-6 text-sm text-white/60">
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          <Link href="#how-it-works" className="hover:text-white transition-colors">How it works</Link>
        </div>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <Link
            id="nav-create-room"
            href="/#create"
            className="inline-flex h-9 items-center justify-center rounded-md bg-violet-600 px-4 text-sm font-medium text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-500"
          >
            Create Room
          </Link>
        </div>
      </div>
    </nav>
  )
}
