import { useState } from "react";
import { KeyRound } from "lucide-react";

interface Props {
  onAuth: (key: string) => void;
  isOpen: boolean;
}

export default function ApiKeyModal({ onAuth, isOpen }: Props) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) {
      setError("API key is required");
      return;
    }
    // Store in both storages for redundancy
    try { sessionStorage.setItem("hermes_api_key", trimmed); } catch {}
    try { localStorage.setItem("hermes_api_key", trimmed); } catch {}
    setError("");
    onAuth(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 border border-border bg-background p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <KeyRound className="h-5 w-5 text-foreground" />
          <h2 className="font-display text-base tracking-wider uppercase">
            Authentication Required
          </h2>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Running outside Telegram. Enter your API server key to authenticate.
          <br />
          <span className="text-xs opacity-60">
            Find it in <code className="bg-muted/50 px-1 py-0.5 rounded text-xs">~/.hermes/.env</code> as <code className="bg-muted/50 px-1 py-0.5 rounded text-xs">API_SERVER_KEY</code>
          </span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={key}
            onChange={(e) => { setKey(e.target.value); setError(""); }}
            placeholder="Paste your API_SERVER_KEY"
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
          <button
            type="submit"
            className="w-full rounded-md bg-foreground text-background px-4 py-2 text-sm font-display tracking-wider uppercase hover:bg-foreground/90 transition-colors"
          >
            Connect
          </button>
        </form>
      </div>
    </div>
  );
}