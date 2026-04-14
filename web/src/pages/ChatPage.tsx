import { useEffect, useState, useRef, useCallback } from "react";
import { Send, StopCircle, Paperclip, X, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { ModelInfo } from "@/lib/api";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";

interface ChatMsg {
  role: "user" | "assistant" | "system" | "command";
  content: string;
}

const CHAT_AGENT = "chat";
const POLL_MS = 2000;

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [agentReady, setAgentReady] = useState(false);
  const [agentSpawning, setAgentSpawning] = useState(false);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastOutputLen = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const agentReadyRef = useRef(false);
  const streamingRef = useRef(false);

  useEffect(() => {
    api.getModelInfo().then(setModelInfo).catch(() => {});
    // Check if chat agent already exists
    api.getAgents().then(({ agents }) => {
      const chat = agents.find((a) => a.name === CHAT_AGENT);
      if (chat && chat.status === "running") {
        agentReadyRef.current = true;
        setAgentReady(true);
        startPolling();
      }
    }).catch(() => {});
    return () => stopPolling();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  const handleFileAttach = () => {
    const el = document.createElement("input");
    el.type = "file";
    el.accept = "image/*";
    el.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedFile({ name: file.name, dataUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    };
    el.click();
  };

  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    pollTimer.current = setInterval(pollOutput, POLL_MS);
  };

  const pollOutput = async () => {
    try {
      const info = await api.getAgent(CHAT_AGENT);
      if (!info.output) return;

      const output: string = info.output;
      // Only process new content since last poll
      if (output.length <= lastOutputLen.current) return;

      const newContent = output.slice(lastOutputLen.current);
      lastOutputLen.current = output.length;

      // Skip empty/whitespace-only updates
      const trimmed = newContent.trim();
      if (!trimmed) return;

      // Append to last assistant message or create new one
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant") {
          // Append to existing
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + trimmed },
          ];
        }
        // New assistant message
        return [...prev, { role: "assistant", content: trimmed }];
      });
      scrollToBottom();

      // Detect when agent is done responding (hermes shows prompt)
      // The hermes prompt contains a colored symbol like ▋ or similar
      if (streamingRef.current && /\n[^|\n]*[>$#]\s*$/.test(output.slice(-50))) {
        streamingRef.current = false;
        setStreaming(false);
      }
    } catch {
      // Agent might be dead
      agentReadyRef.current = false;
      setAgentReady(false);
      stopPolling();
    }
  };

  const ensureAgent = async (firstMessage: string): Promise<boolean> => {
    if (agentReadyRef.current) return true;

    setAgentSpawning(true);
    try {
      // Spawn the chat agent with the first message as prompt
      await api.spawnAgent({
        prompt: firstMessage,
        name: CHAT_AGENT,
        mode: "interactive",
      });

      // Wait a moment for tmux to boot, then start polling
      await new Promise((r) => setTimeout(r, 3000));
      lastOutputLen.current = 0;
      agentReadyRef.current = true;
      setAgentReady(true);
      startPolling();
      return true;
    } catch (e: any) {
      // Check if 409 (already exists) — that's fine
      if (e.message?.includes("409")) {
        agentReadyRef.current = true;
        setAgentReady(true);
        startPolling();
        return true;
      }
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Failed to spawn agent: ${e.message}` },
      ]);
      return false;
    } finally {
      setAgentSpawning(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text && !attachedFile) return;
    if (streaming || agentSpawning) return;

    const displayText = text || "(image)";
    setInput("");
    streamingRef.current = true;
    setStreaming(true);

    // Show user message
    setMessages((prev) => [...prev, { role: "user", content: displayText }]);
    setAttachedFile(null);

    // Build the message to send to agent
    let agentMsg = text;
    if (attachedFile && text) {
      agentMsg = `${text}\n[Attached image: ${attachedFile.name}]`;
    } else if (attachedFile) {
      agentMsg = `[Attached image: ${attachedFile.name}]`;
    }

    // Slash commands — proxy to command endpoint
    if (text.startsWith("/")) {
      const parts = text.split(/\s+/);
      const cmd = parts[0].slice(1);
      const args = parts.slice(1).join(" ");
      try {
        const r = await api.executeCommand({ command: "/" + cmd, args });
        setMessages((prev) => [
          ...prev,
          { role: "command", content: r.output || "(no output)" },
        ]);
      } catch (e: any) {
        setMessages((prev) => [
          ...prev,
          { role: "system", content: `Error: ${e.message}` },
        ]);
      }
      setStreaming(false);
      return;
    }

    // Ensure agent is running
    const ok = await ensureAgent(agentMsg);
    if (!ok) {
      setStreaming(false);
      return;
    }

    // If we just spawned with this message as prompt, it was already sent
    if (!agentReadyRef.current || messages.length === 0) {
      // First message was sent as the spawn prompt, just wait for output
      return;
    }

    // Send message to existing agent
    try {
      await api.sendAgentMessage(CHAT_AGENT, agentMsg);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Send failed: ${e.message}` },
      ]);
      setStreaming(false);
    }
  };

  const abortStream = () => {
    // Can't truly abort a tmux agent, but we can stop showing loading state
    setStreaming(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Context bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border text-xs text-muted-foreground shrink-0">
        <span className="font-medium">{modelInfo?.model_short || "—"}</span>
        {modelInfo?.provider && <span className="opacity-60">via {modelInfo.provider}</span>}
        <span className="opacity-40">|</span>
        <span className={agentReady ? "text-green-500" : agentSpawning ? "text-yellow-500" : "text-muted-foreground"}>
          {agentReady ? "● Connected" : agentSpawning ? "◌ Spawning..." : "○ No agent"}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-lg font-display mb-2">Hermes Agent</p>
            <p className="text-sm opacity-60">Send a message to start a tmux session</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : msg.role === "system"
                    ? "bg-muted text-muted-foreground italic text-sm"
                    : msg.role === "command"
                      ? "bg-secondary text-secondary-foreground font-mono text-xs whitespace-pre-wrap"
                      : "bg-secondary text-secondary-foreground"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap break-words">
                  <Markdown content={msg.content} />
                  {streaming && i === messages.length - 1 && (
                    <span className="inline-block w-1.5 h-4 bg-foreground/70 animate-pulse ml-0.5 align-text-bottom" />
                  )}
                </div>
              ) : (
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              )}
            </div>
          </div>
        ))}
        {agentSpawning && (
          <div className="flex justify-start">
            <div className="bg-secondary text-secondary-foreground rounded-lg px-3 py-2 flex items-center gap-2 text-sm">
              <Loader2 className="h-3 w-3 animate-spin" />
              Spawning agent session...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Attachment preview */}
      {attachedFile && (
        <div className="flex items-center gap-2 px-4 py-1 border-t border-border text-xs">
          <Paperclip className="h-3 w-3" />
          <span className="truncate">{attachedFile.name}</span>
          <button onClick={() => setAttachedFile(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-end gap-2 px-4 py-3 border-t border-border shrink-0">
        <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9" onClick={handleFileAttach}>
          <Paperclip className="h-4 w-4" />
        </Button>
        <textarea
          ref={inputRef}
          className="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[38px] max-h-[120px]"
          placeholder={agentReady ? "Message Hermes..." : "Send a message to spawn agent..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          disabled={streaming || agentSpawning}
        />
        {streaming ? (
          <Button variant="destructive" size="icon" className="shrink-0 h-9 w-9" onClick={abortStream}>
            <StopCircle className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="icon" className="shrink-0 h-9 w-9" onClick={send} disabled={(!input.trim() && !attachedFile) || agentSpawning}>
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
