// ─── WebRTC P2P File Transfer Engine ────────────────────────────
// Handles:
//  - Multiple simultaneous peer connections (full mesh)
//  - Chunked file sending with backpressure (no memory blowup)
//  - File reassembly on receiver side
//  - Progress / speed callbacks

import { CHUNK_SIZE, MAX_BUFFER, downloadBlob } from './fileUtils'
import type { SignalingService } from './signaling'

export type TransferProgress = {
  peerId: string
  fileName: string
  fileSize: number
  transferred: number
  speed: number       // bytes/ms
  direction: 'send' | 'receive'
}

export type PeerInfo = {
  id: string
  connection: RTCPeerConnection
  channel?: RTCDataChannel
  polite: boolean    // polite/impolite for perfect negotiation
}

type ProgressCallback = (progress: TransferProgress) => void
type PeerCallback = (peerId: string) => void

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // TURN server – add yours here for fallback through NAT
  // { urls: 'turn:your-turn-server.com', username: 'user', credential: 'pass' },
]

export class WebRTCManager {
  private peers: Map<string, PeerInfo> = new Map()
  private localPeerId: string
  private signaling: SignalingService
  private unsubscribers: (() => void)[] = []

  // Callbacks
  onProgress: ProgressCallback = () => {}
  onPeerJoin: PeerCallback = () => {}
  onPeerLeave: PeerCallback = () => {}
  onFileReceived: (fileName: string, blob: Blob) => void = (name, blob) => downloadBlob(blob, name)

  constructor(localPeerId: string, signaling: SignalingService) {
    this.localPeerId = localPeerId
    this.signaling = signaling
    this.setupSignalingHandlers()
  }

  // ─── Signaling Handlers ─────────────────────────────────────────

  private setupSignalingHandlers() {
    this.unsubscribers.push(
      this.signaling.on('peer-join', async ({ from }) => {
        if (from === this.localPeerId) return
        if (this.peers.has(from)) return
        // We initiate the connection as the non-polite peer
        await this.createConnection(from, false)
        this.onPeerJoin(from)
      }),

      this.signaling.on('peer-leave', ({ from }) => {
        this.closePeer(from)
        this.onPeerLeave(from)
      }),

      this.signaling.on('offer', async ({ from, data }) => {
        let peer = this.peers.get(from)
        if (!peer) {
          peer = await this.createConnection(from, true)
        }
        const { pc } = { pc: peer.connection }
        await pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        this.signaling.send({ type: 'answer', from: this.localPeerId, to: from, data: answer })
      }),

      this.signaling.on('answer', async ({ from, data }) => {
        const peer = this.peers.get(from)
        if (!peer) return
        await peer.connection.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit))
      }),

      this.signaling.on('ice-candidate', async ({ from, data }) => {
        const peer = this.peers.get(from)
        if (!peer) return
        try {
          await peer.connection.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit))
        } catch {
          // Silently ignore stale candidates
        }
      })
    )
  }

  // ─── Create Peer Connection ──────────────────────────────────────

  async createConnection(remotePeerId: string, polite: boolean): Promise<PeerInfo> {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    const peerInfo: PeerInfo = { id: remotePeerId, connection: pc, polite }
    this.peers.set(remotePeerId, peerInfo)

    // ICE candidate exchange
    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return
      this.signaling.send({
        type: 'ice-candidate',
        from: this.localPeerId,
        to: remotePeerId,
        data: candidate.toJSON(),
      })
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.closePeer(remotePeerId)
        this.onPeerLeave(remotePeerId)
      }
    }

    // Handle incoming data channel (receiver side)
    pc.ondatachannel = ({ channel }) => {
      this.setupReceiveChannel(channel, remotePeerId)
    }

    if (!polite) {
      // Non-polite: initiate offer
      const channel = pc.createDataChannel('file-transfer', {
        ordered: true,
        maxRetransmits: undefined,
      })
      peerInfo.channel = channel
      this.setupSendChannel(channel)

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      this.signaling.send({
        type: 'offer',
        from: this.localPeerId,
        to: remotePeerId,
        data: offer,
      })
    }

    return peerInfo
  }

  // ─── Send File to One Peer ───────────────────────────────────────

  async sendFile(file: File, targetPeerId: string): Promise<void> {
    const peer = this.peers.get(targetPeerId)
    if (!peer?.channel) {
      console.warn(`No data channel for peer ${targetPeerId}`)
      return
    }

    const channel = peer.channel
    const fileSize = file.size
    let transferred = 0
    let lastTime = Date.now()
    let lastBytes = 0

    // Send metadata first
    const meta = JSON.stringify({ type: 'meta', name: file.name, size: fileSize, mime: file.type })
    channel.send(meta)

    // Send chunks with backpressure
    const chunkSize = CHUNK_SIZE
    const totalChunks = Math.ceil(fileSize / chunkSize)

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, fileSize)
      const chunk = await file.slice(start, end).arrayBuffer()

      // Backpressure: wait if buffer is too full
      if (channel.bufferedAmount > MAX_BUFFER) {
        await new Promise<void>((resolve) => {
          channel.bufferedAmountLowThreshold = MAX_BUFFER / 2
          channel.onbufferedamountlow = () => resolve()
        })
      }

      channel.send(chunk)
      transferred += chunk.byteLength

      // Speed calculation (every 100ms window)
      const now = Date.now()
      const elapsed = now - lastTime
      if (elapsed >= 100) {
        const speed = (transferred - lastBytes) / elapsed
        this.onProgress({ peerId: targetPeerId, fileName: file.name, fileSize, transferred, speed, direction: 'send' })
        lastTime = now
        lastBytes = transferred
      }
    }

    // Send end marker
    channel.send(JSON.stringify({ type: 'end' }))
  }

  /**
   * Send a file to ALL connected peers concurrently
   */
  async sendFileToAll(file: File): Promise<void> {
    const peerIds = Array.from(this.peers.keys()).filter(
      (id) => this.peers.get(id)?.channel?.readyState === 'open'
    )
    await Promise.all(peerIds.map((id) => this.sendFile(file, id)))
  }

  // ─── DataChannel Setup ───────────────────────────────────────────

  private setupSendChannel(channel: RTCDataChannel) {
    channel.binaryType = 'arraybuffer'
    channel.onopen = () => console.log('[WebRTC] Send channel open')
    channel.onerror = (e) => console.error('[WebRTC] Send channel error', e)
  }

  private setupReceiveChannel(channel: RTCDataChannel, remotePeerId: string) {
    channel.binaryType = 'arraybuffer'

    let receivedMeta: { name: string; size: number; mime: string } | null = null
    const chunks: ArrayBuffer[] = []
    let receivedBytes = 0
    let lastTime = Date.now()
    let lastBytes = 0

    channel.onmessage = ({ data }) => {
      // JSON control messages
      if (typeof data === 'string') {
        const msg = JSON.parse(data)
        if (msg.type === 'meta') {
          receivedMeta = { name: msg.name, size: msg.size, mime: msg.mime }
          chunks.length = 0
          receivedBytes = 0
        } else if (msg.type === 'end' && receivedMeta) {
          const blob = new Blob(chunks, { type: receivedMeta.mime || 'application/octet-stream' })
          this.onFileReceived(receivedMeta.name, blob)
          this.onProgress({
            peerId: remotePeerId,
            fileName: receivedMeta.name,
            fileSize: receivedMeta.size,
            transferred: receivedMeta.size,
            speed: 0,
            direction: 'receive',
          })
          receivedMeta = null
          chunks.length = 0
        }
        return
      }

      // Binary chunk
      if (data instanceof ArrayBuffer && receivedMeta) {
        chunks.push(data)
        receivedBytes += data.byteLength

        const now = Date.now()
        const elapsed = now - lastTime
        if (elapsed >= 100) {
          const speed = (receivedBytes - lastBytes) / elapsed
          this.onProgress({
            peerId: remotePeerId,
            fileName: receivedMeta.name,
            fileSize: receivedMeta.size,
            transferred: receivedBytes,
            speed,
            direction: 'receive',
          })
          lastTime = now
          lastBytes = receivedBytes
        }
      }
    }
  }

  // ─── Cleanup ─────────────────────────────────────────────────────

  closePeer(peerId: string) {
    const peer = this.peers.get(peerId)
    if (!peer) return
    peer.channel?.close()
    peer.connection.close()
    this.peers.delete(peerId)
  }

  destroy() {
    this.peers.forEach((_, id) => this.closePeer(id))
    this.unsubscribers.forEach((fn) => fn())
  }

  getPeerIds(): string[] {
    return Array.from(this.peers.keys())
  }

  isPeerConnected(peerId: string): boolean {
    return this.peers.get(peerId)?.connection.connectionState === 'connected'
  }
}
