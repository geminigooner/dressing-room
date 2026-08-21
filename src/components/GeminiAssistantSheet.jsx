import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Bot,
  User as UserIcon,
  Layers,
  Wrench,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { chatWithAssistant } from '../lib/api.js';
import { getAvailableCapabilities, validateToolRequest } from '../lib/capabilities.js';

/**
 * Persistent Gemini Assistant Drawer / Bottom Sheet
 * 
 * Provides an always-accessible AI styling assistant with full awareness of:
 * - Live workspace snapshot (uploaded base, outfit, prompt, result status, errors)
 * - Dynamic app tool & capability registry
 * - Safe, validated tool execution layer
 */
export default function GeminiAssistantSheet({
  isOpen,
  onClose,
  workspaceContext,
  onExecuteTool,
  onApplyPromptSuggestion,
}) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'model',
      content: "Hey, I'm Gemini, your styling assistant inside Dressing Room. I can help refine your prompts, suggest outfit ideas, troubleshoot look edits, or execute studio actions like generating looks, saving them, or opening your gallery. What are we styling today?",
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showStateBadge, setShowStateBadge] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll messages to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      // Focus input when opened
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const capabilities = getAvailableCapabilities();

  const handleSend = async (e) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text || isSending) return;

    const userMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputText('');
    setIsSending(true);

    try {
      // 1. Send conversation, live workspace context snapshot, and available tool registry
      const response = await chatWithAssistant(
        newMessages.map((m) => ({ role: m.role, content: m.content })),
        workspaceContext,
        capabilities
      );

      let actionStatus = null;

      // 2. Safe, validated tool execution layer
      if (response.toolRequest) {
        const { tool: requestedTool, params: requestedParams } = response.toolRequest;

        // Validate requested tool name, parameters, and workspace preconditions
        const validation = validateToolRequest(requestedTool, requestedParams, workspaceContext);

        if (!validation.isValid) {
          actionStatus = {
            success: false,
            tool: requestedTool,
            message: validation.error,
          };
        } else if (typeof onExecuteTool === 'function') {
          try {
            const execResult = await onExecuteTool(requestedTool, validation.sanitizedParams);
            actionStatus = {
              success: execResult?.success ?? true,
              tool: requestedTool,
              toolName: validation.tool?.name || requestedTool,
              message: execResult?.message,
            };
          } catch (execErr) {
            actionStatus = {
              success: false,
              tool: requestedTool,
              toolName: validation.tool?.name || requestedTool,
              message: execErr.message || 'Execution error.',
            };
          }
        }
      }

      const assistantMessage = {
        id: `gemini_${Date.now()}`,
        role: 'model',
        content: response.content,
        actionStatus,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Assistant error:', err);
      const errorMessage = {
        id: `err_${Date.now()}`,
        role: 'model',
        content: `I ran into an issue connecting to the styling engine: ${err.message || 'Please try again.'}`,
        isError: true,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsSending(false);
    }
  };

  // Quick suggestion prompts
  const quickPrompts = [
    workspaceContext.hasResultImage && workspaceContext.hasBasePhoto
      ? "What changed in this look?"
      : null,
    workspaceContext.hasResultImage && workspaceContext.hasBasePhoto
      ? "Try again & preserve my face and body"
      : null,
    workspaceContext.hasResultImage && workspaceContext.hasOutfitReference
      ? "Is this close to the outfit reference?"
      : null,
    workspaceContext.hasBasePhoto && !workspaceContext.hasResultImage
      ? "Generate this look"
      : null,
    workspaceContext.hasResultImage
      ? "Save this one to gallery"
      : null,
    workspaceContext.galleryCount > 0
      ? "Open my gallery"
      : null,
    workspaceContext.prompt
      ? "How can I improve my styling prompt?"
      : "Suggest a stylish outfit idea",
  ].filter(Boolean).slice(0, 4);

  return (
    <div className="modal-overlay" onClick={onClose} id="gemini-assistant-overlay">
      <div
        className="gemini-sheet-panel"
        id="gemini-assistant-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="gemini-sheet-header">
          <div className="gemini-sheet-header-left">
            <div className="gemini-avatar-badge">
              <Sparkles size={16} />
            </div>
            <div>
              <div className="gemini-sheet-title-row">
                <h3 className="gemini-sheet-title">Gemini Style Assistant</h3>
                <span className="gemini-live-pill">LIVE</span>
              </div>
              <span className="gemini-sheet-subtitle">Aware of your workspace & ready to execute actions</span>
            </div>
          </div>

          <div className="gemini-sheet-header-actions">
            <button
              type="button"
              className={`gemini-context-toggle-btn ${showStateBadge ? 'active' : ''}`}
              title="Inspect live workspace snapshot"
              onClick={() => setShowStateBadge(!showStateBadge)}
            >
              <Layers size={15} />
            </button>
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Close Gemini assistant"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Live Workspace Context Snapshot Drawer (Collapsible) */}
        {showStateBadge && (
          <div className="gemini-workspace-inspector">
            <div className="inspector-title-row">
              <Layers size={13} style={{ color: 'var(--accent-pink)' }} />
              <span className="inspector-title">Active Workspace Snapshot Sent to Gemini</span>
            </div>
            <div className="inspector-grid">
              <div className="inspector-item">
                <span className="inspector-key">Base Photo:</span>
                <span className={`inspector-val ${workspaceContext.hasBasePhoto ? 'val-true' : 'val-false'}`}>
                  {workspaceContext.hasBasePhoto ? 'Loaded' : 'Not Loaded'}
                </span>
              </div>
              <div className="inspector-item">
                <span className="inspector-key">Outfit Ref:</span>
                <span className={`inspector-val ${workspaceContext.hasOutfitReference ? 'val-true' : 'val-false'}`}>
                  {workspaceContext.hasOutfitReference ? 'Loaded' : 'None'}
                </span>
              </div>
              <div className="inspector-item">
                <span className="inspector-key">Result on Canvas:</span>
                <span className={`inspector-val ${workspaceContext.hasResultImage ? 'val-true' : 'val-false'}`}>
                  {workspaceContext.hasResultImage ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="inspector-item">
                <span className="inspector-key">Saved Looks:</span>
                <span className="inspector-val">{workspaceContext.galleryCount || 0}</span>
              </div>
            </div>
            {workspaceContext.prompt && (
              <div className="inspector-prompt-preview">
                <span className="inspector-key">Current Prompt:</span>
                <span className="inspector-prompt-text">"{workspaceContext.prompt}"</span>
              </div>
            )}
            <div className="inspector-tools-row">
              <Wrench size={12} />
              <span>{capabilities.length} available app capabilities executable</span>
            </div>
          </div>
        )}

        {/* Message Stream */}
        <div className="gemini-messages-container" id="gemini-messages-list">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`gemini-msg-row ${msg.role === 'user' ? 'msg-user' : 'msg-assistant'}`}
            >
              {msg.role !== 'user' && (
                <div className="msg-avatar-icon">
                  <Sparkles size={14} />
                </div>
              )}
              <div className={`gemini-msg-bubble ${msg.isError ? 'msg-bubble-error' : ''}`}>
                <p className="gemini-msg-text">{msg.content}</p>

                {/* Tool Execution Status Badge */}
                {msg.actionStatus && (
                  <div
                    className={`gemini-tool-status-pill ${
                      msg.actionStatus.success ? 'status-success' : 'status-notice'
                    }`}
                  >
                    {msg.actionStatus.success ? (
                      <CheckCircle2 size={13} style={{ flexShrink: 0 }} />
                    ) : (
                      <AlertCircle size={13} style={{ flexShrink: 0 }} />
                    )}
                    <span>
                      {msg.actionStatus.message ||
                        (msg.actionStatus.success ? `Executed ${msg.actionStatus.toolName}` : 'Action requirement')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isSending && (
            <div className="gemini-msg-row msg-assistant">
              <div className="msg-avatar-icon">
                <Sparkles size={14} />
              </div>
              <div className="gemini-msg-bubble gemini-msg-typing">
                <Loader2 size={15} className="spinner-icon" />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Gemini is thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        {quickPrompts.length > 0 && messages.length <= 4 && (
          <div className="gemini-quick-prompts-row">
            {quickPrompts.slice(0, 3).map((qp, idx) => (
              <button
                key={idx}
                type="button"
                className="gemini-quick-chip"
                onClick={() => {
                  setInputText(qp);
                }}
              >
                {qp}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <form className="gemini-input-form" onSubmit={handleSend}>
          <input
            ref={inputRef}
            type="text"
            className="gemini-input-field"
            placeholder="Ask Gemini (e.g. 'generate this', 'save it', 'open gallery')..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isSending}
          />
          <button
            type="submit"
            className="gemini-send-btn"
            disabled={!inputText.trim() || isSending}
            aria-label="Send message to Gemini"
          >
            {isSending ? <Loader2 size={16} className="spinner-icon" /> : <Send size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}

