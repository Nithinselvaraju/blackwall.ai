import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Chat from "./components/Chat";

export default function App() {
  // helper to create a new chat
  const createNewChat = () => ({
    id: Date.now(),
    title: "New Chat",
    messages: []
  });

  const [chats, setChats] = useState([createNewChat()]);
  const [activeChatId, setActiveChatId] = useState(chats[0].id);

  return (
    <div className="app-layout">
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        setActiveChatId={setActiveChatId}
        setChats={setChats}
        createNewChat={createNewChat}
      />

      <Chat
        chatId={activeChatId}
        chats={chats}
        setChats={setChats}
      />
    </div>
  );
}
