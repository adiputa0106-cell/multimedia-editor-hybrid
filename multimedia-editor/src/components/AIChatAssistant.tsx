import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { PhotoEditState } from '../core/types';
import { generateId } from '../core/types';
import type { ChatMessage, EditSessionContext, StructuredOperation } from '../core/conversationTypes';
import {
  parseUserPrompt,
  executeStructuredOperation,
  getSmartFollowUpSuggestions,
  createWelcomeAssistantMessage,
} from '../core/aiOrchestrator';
import { AIProviderRegistry } from '../core/aiProviderAdapter';
import './AIChatAssistant.css';

interface AIChatAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  currentState: PhotoEditState;
  onApplyState: (nextState: PhotoEditState, reason?: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  fileName: string;
  sourceDimensions: { width: number; height: number };
  getCurrentCanvas?: () => HTMLCanvasElement | null;
  onApplyNewImageVersion?: (newImageDataUrl: string, description: string) => void;
}

export default function AIChatAssistant({
  isOpen,
  onClose,
  currentState,
  onApplyState,
  onUndo,
  canUndo,
  fileName,
  sourceDimensions,
  getCurrentCanvas,
  onApplyNewImageVersion,
}: AIChatAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [createWelcomeAssistantMessage()]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastAction, setLastAction] = useState<string | undefined>(undefined);
  const [lastParams, setLastParams] = useState<Record<string, number> | undefined>(undefined);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const remoteAbortRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages]);

  const context: EditSessionContext = useMemo(
    () => ({
      currentState,
      previousOperations: messages
        .filter((m) => m.operation)
        .map((m) => m.operation!),
      lastAdjustmentAction: lastAction,
      lastAdjustmentParams: lastParams,
      sourceFileName: fileName,
      imageDimensions: sourceDimensions,
    }),
    [currentState, messages, lastAction, lastParams, fileName, sourceDimensions]
  );

  const handleExecuteRemoteOperation = useCallback(
    async (operation: StructuredOperation, messageIdToUpdate: string) => {
      setIsProcessing(true);
      const controller = new AbortController();
      remoteAbortRef.current = controller;

      // Update message to remove consent buttons and show processing
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageIdToUpdate
            ? { ...m, isGenerativeConsent: false, text: '⏳ Sedang memproses citra melalui backend AI online...' }
            : m
        )
      );

      try {
        const remoteProvider = AIProviderRegistry.getProvider('remote');
        const canvas = getCurrentCanvas ? getCurrentCanvas() : null;

        const sessionCtx: EditSessionContext = {
          ...context,
          sourceCanvas: canvas,
          abortSignal: controller.signal,
        };

        const result = await remoteProvider.executeOperation(operation, sessionCtx);

        if (result.errorCode || !result.resultImage) {
          const errText =
            result.errorCode === 'PROVIDER_NOT_CONFIGURED'
              ? '⚠️ Penyedia AI belum dikonfigurasi di server (Status 503). Atur AI_PROVIDER_API_KEY di server/.env.'
              : result.errorCode === 'ABORTED'
              ? 'Permintaan pemrosesan AI dibatalkan oleh pengguna.'
              : `⚠️ Gagal memproses: ${result.summary[0] || 'Kesalahan server'}`;

          const errorMsg: ChatMessage = {
            id: `asst_${generateId()}`,
            sender: 'assistant',
            text: errText,
            timestamp: new Date().toISOString(),
            error: result.errorCode,
            suggestedFollowUps: ['Terangkan sedikit', 'Buat lebih hangat', 'Gaya Sinematik'],
          };
          setMessages((prev) => [...prev, errorMsg]);
        } else {
          const successMsg: ChatMessage = {
            id: `asst_${generateId()}`,
            sender: 'assistant',
            text: '✓ Latar belakang foto berhasil dihapus! Hasil tersedia sebagai versi baru.',
            timestamp: new Date().toISOString(),
            operation,
            resultImage: result.resultImage,
            appliedChangesSummary: result.summary,
            suggestedFollowUps: ['Gaya Sinematik', 'Terangkan sedikit', 'Tambah kontras'],
          };
          setMessages((prev) => [...prev, successMsg]);
        }
      } catch (err: unknown) {
        const e = err as Error;
        const errorMsg: ChatMessage = {
          id: `asst_${generateId()}`,
          sender: 'assistant',
          text: `Maaf, kendala jaringan: ${e.message}`,
          timestamp: new Date().toISOString(),
          error: e.message,
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsProcessing(false);
        remoteAbortRef.current = null;
      }
    },
    [context, getCurrentCanvas]
  );

  const handleSendPrompt = useCallback(
    (promptText?: string) => {
      const textToSend = (promptText || inputPrompt).trim();
      if (!textToSend || isProcessing) return;

      setInputPrompt('');
      setIsProcessing(true);

      const userMsgId = `user_${generateId()}`;
      const userMsg: ChatMessage = {
        id: userMsgId,
        sender: 'user',
        text: textToSend,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);

      setTimeout(() => {
        try {
          const operation = parseUserPrompt(textToSend, context);

          if (operation.target === 'history' && operation.action === 'undo') {
            if (canUndo) {
              onUndo();
              const assistantMsg: ChatMessage = {
                id: `asst_${generateId()}`,
                sender: 'assistant',
                text: 'Perubahan terakhir telah dibatalkan (Undo) ✓',
                timestamp: new Date().toISOString(),
                operation,
                suggestedFollowUps: ['Terangkan sedikit', 'Buat lebih hangat', 'Gaya Sinematik'],
              };
              setMessages((prev) => [...prev, assistantMsg]);
            } else {
              const assistantMsg: ChatMessage = {
                id: `asst_${generateId()}`,
                sender: 'assistant',
                text: 'Tidak ada riwayat perubahan yang dapat dibatalkan saat ini.',
                timestamp: new Date().toISOString(),
                operation,
                suggestedFollowUps: ['Terangkan sedikit', 'Tambah kontras'],
              };
              setMessages((prev) => [...prev, assistantMsg]);
            }
            setIsProcessing(false);
            return;
          }

          if (operation.status === 'clarification_needed') {
            const assistantMsg: ChatMessage = {
              id: `asst_${generateId()}`,
              sender: 'assistant',
              text: operation.explanation,
              timestamp: new Date().toISOString(),
              operation,
              suggestedFollowUps: [
                'Terangkan sedikit',
                'Buat lebih hangat',
                'Tambah kontras',
                'Jadikan hitam putih',
              ],
            };
            setMessages((prev) => [...prev, assistantMsg]);
            setIsProcessing(false);
            return;
          }

          // 10. Remote Generative Operation: Require Explicit Consent
          if (operation.provider === 'remote') {
            const consentMsg: ChatMessage = {
              id: `asst_${generateId()}`,
              sender: 'assistant',
              text: 'Operasi ini memerlukan pengiriman citra ke backend AI online. Foto diproses murni di memori dan tidak disimpan permanen di server.\n\nApakah Anda setuju untuk melanjutkan pemrosesan secara online?',
              timestamp: new Date().toISOString(),
              operation,
              isGenerativeConsent: true,
            };
            setMessages((prev) => [...prev, consentMsg]);
            setIsProcessing(false);
            return;
          }

          // Execute local deterministic operation
          const result = executeStructuredOperation(operation, currentState);
          onApplyState(result.nextState, operation.explanation);

          if (result.lastAction) setLastAction(result.lastAction);
          if (result.lastParams) setLastParams(result.lastParams);

          const followUps = getSmartFollowUpSuggestions(result.lastAction);

          const assistantMsg: ChatMessage = {
            id: `asst_${generateId()}`,
            sender: 'assistant',
            text: operation.explanation,
            timestamp: new Date().toISOString(),
            operation,
            appliedChangesSummary: result.summary,
            suggestedFollowUps: followUps,
          };

          setMessages((prev) => [...prev, assistantMsg]);
        } catch (err: unknown) {
          const e = err as Error;
          const errorMsg: ChatMessage = {
            id: `asst_${generateId()}`,
            sender: 'assistant',
            text: `Maaf, terjadi kendala saat memproses instruksi: ${e.message}`,
            timestamp: new Date().toISOString(),
            error: e.message,
          };
          setMessages((prev) => [...prev, errorMsg]);
        } finally {
          setIsProcessing(false);
        }
      }, 280);
    },
    [inputPrompt, isProcessing, context, canUndo, onUndo, currentState, onApplyState]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendPrompt();
    }
  };

  const handleCancelRemoteProcess = () => {
    if (remoteAbortRef.current) {
      remoteAbortRef.current.abort();
      remoteAbortRef.current = null;
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="ai-chat-drawer" aria-label="AI Photo Assistant">
      <div className="ai-chat-header">
        <div className="ai-chat-title-group">
          <span className="ai-chat-icon">🤖</span>
          <div>
            <h3 className="ai-chat-title">AI Photo Assistant</h3>
            <span className="ai-chat-subtitle">Hybrid Local &amp; Online Copilot</span>
          </div>
        </div>
        <div className="ai-chat-header-actions">
          <button
            type="button"
            className="ai-chat-header-btn"
            onClick={() => setMessages([createWelcomeAssistantMessage()])}
            title="Bersihkan riwayat percakapan"
          >
            🧹
          </button>
          <button
            type="button"
            className="ai-chat-header-btn"
            onClick={onClose}
            title="Tutup AI Assistant"
            id="btn-close-ai-chat"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="ai-chat-messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`ai-chat-bubble ai-chat-bubble--${msg.sender}`}
          >
            {msg.sender === 'assistant' && (
              <div className="ai-chat-avatar">🤖</div>
            )}
            <div className="ai-chat-bubble-content">
              <p className="ai-chat-text" style={{ whiteSpace: 'pre-line' }}>{msg.text}</p>

              {/* Explicit User Consent Card for Online Generative Call */}
              {msg.isGenerativeConsent && msg.operation && (
                <div className="ai-chat-consent-card">
                  <div className="ai-chat-consent-actions">
                    <button
                      type="button"
                      className="ai-chat-btn-agree"
                      onClick={() => handleExecuteRemoteOperation(msg.operation!, msg.id)}
                      disabled={isProcessing}
                    >
                      ✓ Setuju &amp; Proses Online
                    </button>
                    <button
                      type="button"
                      className="ai-chat-btn-cancel"
                      onClick={() => {
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.id === msg.id
                              ? { ...m, isGenerativeConsent: false, text: 'Operasi online dibatalkan atas permintaan pengguna.' }
                              : m
                          )
                        );
                      }}
                      disabled={isProcessing}
                    >
                      Batalkan
                    </button>
                  </div>
                </div>
              )}

              {/* Generative Result Preview & Non-Destructive Versioning */}
              {msg.resultImage && (
                <div className="ai-chat-result-card">
                  <div className="ai-chat-result-thumb-box">
                    <img
                      src={msg.resultImage}
                      alt="Hasil Generatif Transparan"
                      className="ai-chat-result-img"
                    />
                  </div>
                  <button
                    type="button"
                    className="ai-chat-btn-apply-version"
                    onClick={() => {
                      if (onApplyNewImageVersion && msg.resultImage) {
                        onApplyNewImageVersion(msg.resultImage, 'Hapus Background AI');
                        setMessages((prev) => [
                          ...prev,
                          {
                            id: `asst_${generateId()}`,
                            sender: 'assistant',
                            text: '✓ Versi citra transparan baru telah berhasil dimuat ke editor tanpa menimpa foto asli.',
                            timestamp: new Date().toISOString(),
                          },
                        ]);
                      }
                    }}
                  >
                    🎨 Terapkan Sebagai Versi Baru
                  </button>
                </div>
              )}

              {/* Structured Operation Pills */}
              {msg.appliedChangesSummary && msg.appliedChangesSummary.length > 0 && (
                <div className="ai-chat-pills">
                  {msg.appliedChangesSummary.map((pill, i) => (
                    <span key={i} className="ai-chat-pill">
                      ✓ {pill}
                    </span>
                  ))}
                  <span className="ai-chat-provider-badge">
                    {msg.operation?.provider === 'remote' ? 'Online Server' : 'Lokal (0ms)'}
                  </span>
                </div>
              )}

              {/* Suggestion Chips */}
              {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                <div className="ai-chat-suggestions">
                  {msg.suggestedFollowUps.map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="ai-chat-suggestion-chip"
                      onClick={() => handleSendPrompt(chip)}
                      disabled={isProcessing}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="ai-chat-bubble ai-chat-bubble--assistant">
            <div className="ai-chat-avatar">🤖</div>
            <div className="ai-chat-bubble-content">
              <div className="ai-chat-typing-indicator" style={{ marginBottom: 6 }}>
                <span />
                <span />
                <span />
              </div>
              <button
                type="button"
                className="ai-chat-btn-cancel"
                onClick={handleCancelRemoteProcess}
                style={{ fontSize: '10px', padding: '3px 8px' }}
              >
                ⏹️ Batalkan Proses
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="ai-chat-input-area">
        <input
          ref={inputRef}
          type="text"
          className="ai-chat-input"
          placeholder="Ketik instruksi (cth: Hapus background, terangkan)..."
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isProcessing}
          id="input-ai-prompt"
        />
        <button
          type="button"
          className="ai-chat-send-btn"
          onClick={() => handleSendPrompt()}
          disabled={!inputPrompt.trim() || isProcessing}
          id="btn-send-ai-prompt"
          title="Kirim instruksi edit foto"
        >
          ➤
        </button>
      </div>
    </aside>
  );
}
