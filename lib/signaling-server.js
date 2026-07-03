const { WebSocketServer } = require('ws')

const PORT = 3002
const wss = new WebSocketServer({ port: PORT })

// rooms: Map<roomId, Set<client>>
const rooms = new Map()

wss.on('connection', (ws) => {
  let currentRoomId = null
  let currentPeerId = null

  ws.on('message', (message) => {
    try {
      const payload = JSON.parse(message)
      const { type, roomId, peerId, to, data } = payload

      if (type === 'join') {
        currentRoomId = roomId
        currentPeerId = peerId

        if (!rooms.has(roomId)) {
          rooms.set(roomId, new Set())
        }
        rooms.get(roomId).add(ws)

        // Broadcast to other peers in room
        const msg = JSON.stringify({ type: 'peer-join', from: peerId, data: { peerId } })
        broadcastToRoom(roomId, ws, msg)
        return
      }

      if (type === 'signal') {
        const msg = JSON.stringify({ type: data.type, from: peerId, to, data: data.data })
        broadcastToRoom(currentRoomId, ws, msg, to)
        return
      }
    } catch (err) {
      console.error('[Signaling Server Error]', err)
    }
  })

  ws.on('close', () => {
    if (currentRoomId && rooms.has(currentRoomId)) {
      const room = rooms.get(currentRoomId)
      room.delete(ws)
      if (room.size === 0) {
        rooms.delete(currentRoomId)
      } else {
        const msg = JSON.stringify({ type: 'peer-leave', from: currentPeerId, data: { peerId: currentPeerId } })
        broadcastToRoom(currentRoomId, null, msg)
      }
    }
  })
})

function broadcastToRoom(roomId, senderWs, messageStr, targetPeerId) {
  if (!rooms.has(roomId)) return
  for (const client of rooms.get(roomId)) {
    if (client !== senderWs && client.readyState === 1) {
      client.send(messageStr)
    }
  }
}

console.log(`[DropZap] Local signaling server running on ws://localhost:${PORT}`)
