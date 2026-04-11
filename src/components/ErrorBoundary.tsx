import React from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

interface Props {
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 gap-6">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-rose-500" />
          </div>
          <div className="text-center max-w-md">
            <h1 className="text-xl font-black text-slate-900 mb-2">Something went wrong</h1>
            <p className="text-sm text-slate-500 font-medium mb-6">
              {this.state.error?.message || "An unexpected error occurred. Please reload the page."}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:bg-[#1e4fc0] transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
