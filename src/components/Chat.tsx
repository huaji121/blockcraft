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

const MAX_LINES = 10;
const IDLE_FADE_DELAY = 10_000; // start fading after 10s of no new messages
const FADE_DURATION = 3_000;    // fade over 3s

export function Chat({ messages, onSend, visible, onClose }: Props) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageTimeRef = useRef(Date.now());
  const [fadeOpacity, setFadeOpacity] = useState(1);

  // Track last message time
  useEffect(() => {
    if (messages.length > 0) {
      lastMessageTimeRef.current = messages[messages.length - 1].time;
    }
  }, [messages]);

  // Fade timer
  useEffect(() => {
    if (visible) {
      setFadeOpacity(1);
      return;
    }
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastMessageTimeRef.current;
      if (elapsed < IDLE_FADE_DELAY) {
        setFadeOpacity(1);
      } else if (elapsed < IDLE_FADE_DELAY + FADE_DURATION) {
        setFadeOpacity(1 - (elapsed - IDLE_FADE_DELAY) / FADE_DURATION);
      } else {
        setFadeOpacity(0);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [visible]);

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

  // Show last MAX_LINES messages
  const displayMessages = visible ? messages : messages.slice(-MAX_LINES);
  const showChat = visible || (displayMessages.length > 0 && fadeOpacity > 0.01);
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
      opacity: visible ? 1 : fadeOpacity,
      transition: visible ? 'none' : 'opacity 0.1s',
    }}>
      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          maxHeight: visible ? '60vh' : `${MAX_LINES * 18}px`,
          overflowY: 'auto',
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: 2,
        }}
      >
        {displayMessages.map((msg, i) => (
          <div key={`${msg.sender}-${msg.time}-${i}`} style={{
            padding: '0 6px',
            color: msg.sender === 'System' ? '#ffff55' : '#fff',
            textShadow: '1px 1px 0 #000',
            lineHeight: '18px',
            fontSize: 13,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            <span style={{
              color: msg.sender === 'System' ? '#ffff55' : '#ff5555',
              fontWeight: 'bold',
            }}>&lt;{msg.sender}&gt;</span>
            {' '}{msg.text}
          </div>
        ))}
      </div>

      {/* Input */}
      {visible && (
        <form onSubmit={handleSubmit} style={{ marginTop: 2 }}>
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
