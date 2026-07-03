// ─── Supabase Realtime Signaling for WebRTC ──────────────────────
// Used to exchange WebRTC offers, answers, and ICE candidates
// between peers inside a room.

import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type SignalType =
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'peer-join'
  | 'peer-leave'
  | 'file-meta'
  | 'transfer-complete'
  | 'ping'
  | 'chat-msg'
  | 'chat-typing'
  | 'kick'

export type SignalPayload = {
  type: SignalType
  from: string        // sender peer ID
  to?: string         // target peer ID (undefined = broadcast to all)
  data: unknown
}

type SignalHandler = (payload: SignalPayload) => void

export class SignalingService {
  private channel: RealtimeChannel | null = null
  private ws: WebSocket | null = null
  private handlers: Map<SignalType, SignalHandler[]> = new Map()
  private roomId: string = ''
  private peerId: string = ''
  private useLocalWs: boolean = false

  /**
   * Join a signaling room channel
   */
  async join(roomId: string, peerId: string): Promise<void> {
    this.roomId = roomId
    this.peerId = peerId

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const hasSupabase = !!supabaseUrl && 
                        (!!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    
    // Check if Supabase keys are invalid or not configured properly
    if (!hasSupabase || !supabaseUrl || !supabaseUrl.startsWith('https://') || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.includes('your-')) {
      this.useLocalWs = true
    }

    if (this.useLocalWs) {
      console.log('[DropZap] Initializing local WebSocket signaling server fallback')
      const wsUrl = `ws://${window.location.hostname}:3002`
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        this.ws?.send(JSON.stringify({ type: 'join', roomId, peerId }))
      }

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.to && payload.to !== peerId) return
          const handlers = this.handlers.get(payload.type) ?? []
          handlers.forEach((h) => h(payload))
        } catch (err) {
          console.error('[WebSocket Signaling Parse Error]', err)
        }
      }

      this.ws.onclose = () => {
        console.log('[WebSocket Signaling] Connection closed')
      }
      return
    }

    this.channel = supabase.channel(`room:${roomId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: peerId },
      },
    })

    this.channel
      .on('broadcast', { event: 'signal' }, ({ payload }: { payload: SignalPayload }) => {
        // Only process messages directed to us or broadcast
        if (payload.to && payload.to !== peerId) return
        const handlers = this.handlers.get(payload.type) ?? []
        handlers.forEach((h) => h(payload))
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Announce presence
          this.send({ type: 'peer-join', from: peerId, data: { peerId } })
        }
      })
  }

  /**
   * Send a signal to the room (or a specific peer)
   */
  send(payload: SignalPayload): void {
    if (this.useLocalWs && this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({
        type: 'signal',
        roomId: this.roomId,
        peerId: this.peerId,
        to: payload.to,
        data: payload
      }))
      return
    }

    if (!this.channel) return
    this.channel.send({ type: 'broadcast', event: 'signal', payload })
  }

  /**
   * Register a handler for a specific signal type
   */
  on(type: SignalType, handler: SignalHandler): () => void {
    const list = this.handlers.get(type) ?? []
    list.push(handler)
    this.handlers.set(type, list)
    // Return unsubscribe function
    return () => {
      const updated = (this.handlers.get(type) ?? []).filter((h) => h !== handler)
      this.handlers.set(type, updated)
    }
  }

  /**
   * Leave the signaling channel
   */
  async leave(): Promise<void> {
    if (this.useLocalWs) {
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }
      this.handlers.clear()
      return
    }

    if (!this.channel) return
    this.send({ type: 'peer-leave', from: this.peerId, data: { peerId: this.peerId } })
    await supabase.removeChannel(this.channel)
    this.channel = null
    this.handlers.clear()
  }
}
