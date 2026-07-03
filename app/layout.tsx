import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/Navbar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'DropZap — Instant File Sharing',
  description:
    'Share files instantly. Blazing-fast WebRTC P2P transfer on LAN (up to 1 GB). Secure cloud links for external sharing (up to 50 MB). No accounts required.',
  keywords: ['file sharing', 'P2P', 'WebRTC', 'LAN transfer', 'secure file transfer', 'instant share'],
  openGraph: {
    title: 'DropZap — Instant File Sharing',
    description: 'Drop. Share. Done. Blazing P2P on LAN, secure cloud links for external.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-[#0d0d1a] text-white min-h-screen`}>
        <TooltipProvider>
          <Navbar />
          <main className="pt-16">
            {children}
          </main>
          <Toaster richColors position="bottom-right" />
        </TooltipProvider>
      </body>
    </html>
  )
}
