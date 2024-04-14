import React, { useEffect, useRef } from 'react';
import './ChatContainer.css';

const ChatContainer = ({ messages, onSendMessage }) => {
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      const message = event.target.value.trim();
      if (message !== '') {
        onSendMessage(message);
        event.target.value = '';
      }
    }
  };

  return (
    <div className="chat-container">
      {messages.map((message, index) => (
        <div key={index} className={`chat-bubble ${message.isSent ? 'sent' : 'received'}`}>
          <span className="message-text">Bot: {message.text} </span>
          <span className="message-time">{message.time}</span>
        </div>
      ))}
      <div ref={chatEndRef} />
      {/* <div className="chat-input"> */}
        {/* <input type="text" placeholder="Type your message..." onKeyDown={handleKeyDown} /> */}
      {/* </div> */}
    </div>
  );
};

export default ChatContainer;
