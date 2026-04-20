'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type Variant = 'info' | 'success' | 'warning' | 'danger' | 'error';

interface BaseOptions {
  title?: string;
  message: string;
  variant?: Variant;
}

interface ConfirmOptions extends BaseOptions {
  confirmLabel?: string;
  cancelLabel?: string;
}

interface AlertOptions extends BaseOptions {
  confirmLabel?: string;
}

interface DialogContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  alert: (opts: AlertOptions) => Promise<void>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

interface InternalState {
  kind: 'alert' | 'confirm';
  title: string;
  message: string;
  variant: Variant;
  confirmLabel: string;
  cancelLabel?: string;
  resolve: (value: boolean) => void;
}

const VARIANT_STYLES: Record<Variant, { accent: string; badge: string; button: string }> = {
  info: {
    accent: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
    button: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  success: {
    accent: 'border-green-200',
    badge: 'bg-green-100 text-green-700',
    button: 'bg-green-600 hover:bg-green-700 text-white',
  },
  warning: {
    accent: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
    button: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  danger: {
    accent: 'border-red-200',
    badge: 'bg-red-100 text-red-700',
    button: 'bg-red-600 hover:bg-red-700 text-white',
  },
  error: {
    accent: 'border-red-200',
    badge: 'bg-red-100 text-red-700',
    button: 'bg-red-600 hover:bg-red-700 text-white',
  },
};

const VARIANT_ICON: Record<Variant, string> = {
  info: 'i',
  success: '✓',
  warning: '!',
  danger: '!',
  error: '×',
};

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InternalState | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback((value: boolean) => {
    setState(current => {
      if (current) current.resolve(value);
      return null;
    });
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      setState({
        kind: 'confirm',
        title: opts.title ?? 'Please confirm',
        message: opts.message,
        variant: opts.variant ?? 'info',
        confirmLabel: opts.confirmLabel ?? 'Confirm',
        cancelLabel: opts.cancelLabel ?? 'Cancel',
        resolve,
      });
    });
  }, []);

  const alert = useCallback((opts: AlertOptions) => {
    return new Promise<void>(resolve => {
      setState({
        kind: 'alert',
        title: opts.title ?? 'Notice',
        message: opts.message,
        variant: opts.variant ?? 'info',
        confirmLabel: opts.confirmLabel ?? 'OK',
        resolve: () => resolve(),
      });
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        close(true);
      }
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => confirmButtonRef.current?.focus(), 20);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [state, close]);

  const value = useMemo(() => ({ confirm, alert }), [confirm, alert]);

  const paragraphs = state ? state.message.split(/\n{2,}/) : [];
  const styles = state ? VARIANT_STYLES[state.variant] : null;

  return (
    <DialogContext.Provider value={value}>
      {children}
      {state && styles && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
          onClick={() => close(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className={`w-full max-w-md rounded-lg border ${styles.accent} bg-white shadow-xl`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 p-6">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${styles.badge}`}
                aria-hidden="true"
              >
                {VARIANT_ICON[state.variant]}
              </div>
              <div className="flex-1 min-w-0">
                <h2 id="dialog-title" className="text-base font-semibold text-gray-900">
                  {state.title}
                </h2>
                <div className="mt-2 space-y-2 text-sm text-gray-600">
                  {paragraphs.map((p, i) => (
                    <p key={i} className="whitespace-pre-line break-words">
                      {p}
                    </p>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-3 rounded-b-lg">
              {state.kind === 'confirm' && (
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  {state.cancelLabel}
                </button>
              )}
              <button
                type="button"
                ref={confirmButtonRef}
                onClick={() => close(true)}
                className={`px-4 py-2 text-sm font-medium rounded-md ${styles.button}`}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog must be used inside <DialogProvider>');
  }
  return ctx;
}
