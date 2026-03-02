import { useRef, useState } from "react";
import Message from "./Message";

export default function Chat({ chatId, chats, setChats }) {
  const chat = chats.find(c => c.id === chatId) || { messages: [] };
  const messages = chat.messages;

  const [input, setInput] = useState("");
  const chatEndRef = useRef(null);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userText = input;
    setInput("");

    // add user message to active chat
    setChats(prev =>
      prev.map(c =>
        c.id === chatId
          ? {
              ...c,
              messages: [...c.messages, { role: "user", content: userText }]
            }
          : c
      )
    );

    // detect coordinates (Blackwall UX only)
    const isBlackwall = /(-?\d+\.\d+)\s*,?\s*(-?\d+\.\d+)/.test(userText);

    // add placeholder assistant message
    setChats(prev =>
      prev.map(c =>
        c.id === chatId
          ? {
              ...c,
              messages: [
                ...c.messages,
                {
                  role: "assistant",
                  content: isBlackwall
                    ? "📍 Analyzing location using Blackwall AI…"
                    : ""
                }
              ]
            }
          : c
      )
    );

    const response = await fetch("http://localhost:5000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [...messages, { role: "user", content: userText }]
      })
    });

    const data = await response.json();

    // replace placeholder with actual AI reply
    setChats(prev =>
      prev.map(c =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m, i) =>
                i === c.messages.length - 1
                  ? { ...m, content: data.reply }
                  : m
              )
            }
          : c
      )
    );

    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            <h1>How can I help you today?</h1>
          </div>
        ) : (
          messages.map((msg, i) => (
            <Message key={i} message={msg} />
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="input-box">
        <div className="input-bar">
          <div className="input-pill">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") sendMessage();
              }}
              placeholder="Ask anything"
            />
            <button className="send-btn" onClick={sendMessage}>
              ➤
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
