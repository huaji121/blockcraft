import { useState, useEffect, useRef } from 'react';

export interface ChatMessage {
  sender: string;
  text: string;
  time: number;
}

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  visible: boolean;
  onClose: () => void;
}

const MESSAGE_LIFETIME = 10_000;
const MAX_RECENT_SHOWN = 5; // max messages visible when chat is closed

export function Chat({ messages, onSend, visible, onClose }: Props) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [visible]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, visible]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (text) {
      onSend(text);
      setInput('');
    }
    onClose();
  };

  // When closed: show only recent messages (fading)
  // When open: show all messages
  const displayMessages = visible
    ? messages
    : messages.filter(m => now - m.time < MESSAGE_LIFETIME).slice(-MAX_RECENT_SHOWN);

  const showChat = visible || displayMessages.length > 0;
  if (!showChat) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 60,
      left: 8,
      width: 400,
      zIndex: 150,
      fontFamily: "'Courier New', monospace",
      fontSize: 13,
      pointerEvents: visible ? 'auto' : 'none',
    }}>
      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          maxHeight: visible ? 300 : 120,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          padding: '4px 0',
        }}
      >
        {displayMessages.map((msg, i) => {
          const age = now - msg.time;
          const opacity = visible ? 1
            : age > MESSAGE_LIFETIME * 0.7
              ? Math.max(0, 1 - (age - MESSAGE_LIFETIME * 0.7) / (MESSAGE_LIFETIME * 0.3))
              : 1;

          return (
            <div key={`${msg.sender}-${msg.time}-${i}`} style={{
              background: 'rgba(0, 0, 0, 0.45)',
              padding: '2px 6px',
              borderRadius: 2,
              color: msg.sender === 'System' ? '#ffff55' : '#fff',
              textShadow: '1px 1px 0 #000',
              opacity,
              lineHeight: '18px',
              wordBreak: 'break-word',
            }}>
              <span style={{
                color: msg.sender === 'System' ? '#ffff55' : '#ff5555',
                fontWeight: 'bold',
              }}>&lt;{msg.sender}&gt;</span>
              {' '}{msg.text}
            </div>
          );
        })}
      </div>

      {/* Input */}
      {visible && (
        <form onSubmit={handleSubmit} style={{ marginTop: 4 }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'rgba(0, 0, 0, 0.6)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 2,
              color: '#fff',
              fontFamily: "'Courier New', monospace",
              fontSize: 13,
              padding: '4px 6px',
              outline: 'none',
            }}
            placeholder="Type a message or /help..."
          />
        </form>
      )}
    </div>
  );
}
