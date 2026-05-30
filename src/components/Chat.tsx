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

const MESSAGE_LIFETIME = 10_000; // messages older than this are hidden

export function Chat({ messages, onSend, visible, onClose }: Props) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());

  // Update "now" every second to fade old messages
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Focus input when chat opens
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [visible]);

  // Auto-scroll to bottom
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

  // Filter recent messages
  const recentMessages = messages.filter(m => now - m.time < MESSAGE_LIFETIME);
  const showChat = visible || recentMessages.length > 0;

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
          maxHeight: 200,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          padding: '4px 0',
        }}
      >
        {recentMessages.map((msg, i) => {
          const age = now - msg.time;
          const opacity = age > MESSAGE_LIFETIME * 0.7
            ? Math.max(0, 1 - (age - MESSAGE_LIFETIME * 0.7) / (MESSAGE_LIFETIME * 0.3))
            : 1;

          return (
            <div key={i} style={{
              background: 'rgba(0, 0, 0, 0.45)',
              padding: '2px 6px',
              borderRadius: 2,
              color: '#fff',
              textShadow: '1px 1px 0 #000',
              opacity,
              lineHeight: '18px',
              wordBreak: 'break-word',
            }}>
              <span style={{ color: '#ff5555', fontWeight: 'bold' }}>&lt;{msg.sender}&gt;</span>
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
            placeholder="Type a message..."
          />
        </form>
      )}
    </div>
  );
}
