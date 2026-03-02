export default function Message({ message }) {
  return (
    <div className={`message ${message.role}`}>
      <div className="bubble">{message.content}</div>
    </div>
  );
}
