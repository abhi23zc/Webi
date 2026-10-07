// Handles UTF-8, CRLF, multi-line SSE data, and frames split across network chunks.
export async function consumeEvents(body, onEvent) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  function flush(final = false) {
    let match
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, match.index)
      buffer = buffer.slice(match.index + match[0].length)
      dispatch(frame)
    }
    if (final && buffer.trim()) dispatch(buffer)
  }
  function dispatch(frame) {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
    if (!data || data === '[DONE]') return
    onEvent(JSON.parse(data))
  }
  try {
    while (true) { const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done }); flush(done); if (done) break }
  } finally { reader.releaseLock() }
}
