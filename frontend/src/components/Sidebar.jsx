export default function Sidebar({
  chats,
  activeChatId,
  setActiveChatId,
  setChats
}) {
  const newChat = () => {
    const id = Date.now();
    setChats(prev => [...prev, { id, messages: [] }]);
    setActiveChatId(id);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-top">
        <div className="logo">ChatGPT</div>

        <button className="new-chat" onClick={newChat}>
          + New chat
        </button>

        <div className="sidebar-item">🔍 Search chats</div>
        <div className="sidebar-item">🧩 Apps</div>
        <div className="sidebar-item">💻 Codex</div>
        <div className="sidebar-item">📁 Projects</div>
      </div>

      <div className="sidebar-bottom">
        <div className="chat-history-title">Your chats</div>

        {chats.map(chat => (
          <div
            key={chat.id}
            className={`chat-history-item ${
              chat.id === activeChatId ? "active" : ""
            }`}
            onClick={() => setActiveChatId(chat.id)}
          >
            Chat {chat.id.toString().slice(-4)}
          </div>
        ))}
      </div>
    </div>
  );
}
