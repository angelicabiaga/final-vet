import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";

const NOTICE_SELECTOR = [
  '[role="alert"]',
  '.alert',
  '.success',
  '.error',
  '.err',
  '.ok',
  '.warn',
  '.notice.success',
  '.notice.error',
  '.notice.warning',
  '.message.successMessage',
  '.message.errorMessage',
  '.manage-message',
  '.dash-alert',
].join(',');

const EXCLUDED_SELECTOR = [
  '.registration-success-page',
  '.registration-success-card',
  '.walkin-success-view',
  '.walkin-success-card',
  '.global-toast-region',
  '.msg',
  '.messages',
  '.chat',
  '.conversation',
  '[data-messaging-module]',
].join(',');

function getType(element, text) {
  const classes = String(element?.className || '').toLowerCase();
  const content = String(text || '').toLowerCase();

  if (
    classes.includes('error') ||
    classes.split(/\s+/).includes('err') ||
    content.includes('unable to') ||
    content.includes('failed') ||
    content.includes('invalid') ||
    content.includes('does not match') ||
    content.includes('required')
  ) return 'error';

  if (
    classes.includes('warn') ||
    content.includes('warning') ||
    content.includes('denied') ||
    content.includes('late arrival')
  ) return 'warning';

  if (
    classes.includes('success') ||
    classes.split(/\s+/).includes('ok') ||
    content.includes('successfully') ||
    content.includes('saved') ||
    content.includes('created') ||
    content.includes('updated') ||
    content.includes('enabled') ||
    content.includes('sent') ||
    content.includes('booked')
  ) return 'success';

  return 'info';
}

function cleanText(element) {
  return String(element?.innerText || element?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function GlobalToastCenter() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const seen = useRef(new WeakMap());
  const sequence = useRef(0);

  function dismiss(id) {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function showToast(message, type = 'info', duration = 5000) {
    const text = String(message || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 500) return;

    const id = `${Date.now()}-${sequence.current++}`;
    setToasts((current) => [...current.slice(-3), { id, message: text, type }]);

    const timer = window.setTimeout(() => dismiss(id), duration);
    timers.current.set(id, timer);
  }

  useEffect(() => {
    const activeTimers = timers.current;
    function processElement(element) {
      if (!(element instanceof HTMLElement)) return;
      if (!element.matches(NOTICE_SELECTOR)) return;
      if (element.closest(EXCLUDED_SELECTOR)) return;
      if (element.offsetParent === null && getComputedStyle(element).position !== 'fixed') return;

      const text = cleanText(element);
      if (!text) return;
      if (seen.current.get(element) === text) return;
      seen.current.set(element, text);

      showToast(text, getType(element, text));
      element.classList.add('pawcruz-toast-source');
      element.setAttribute('aria-hidden', 'true');
    }

    function scan(root) {
      if (!(root instanceof Element)) return;
      processElement(root);
      root.querySelectorAll?.(NOTICE_SELECTOR).forEach(processElement);
    }

    document.querySelectorAll(NOTICE_SELECTOR).forEach(processElement);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) scan(node);
            else if (node.parentElement) scan(node.parentElement);
          });
        } else if (mutation.target instanceof Element) {
          scan(mutation.target);
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    function handleInvalid(event) {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
      const label = field.closest('label')?.childNodes?.[0]?.textContent?.trim();
      const name = label || field.getAttribute('aria-label') || field.name || 'This field';
      showToast(`${name}: ${field.validationMessage}`, 'error', 6000);
    }

    const originalAlert = window.alert;
    window.alert = (message) => showToast(message, 'info', 6000);
    document.addEventListener('invalid', handleInvalid, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('invalid', handleInvalid, true);
      window.alert = originalAlert;
      activeTimers.forEach((timer) => window.clearTimeout(timer));
      activeTimers.clear();
    };
    // The toast dispatcher is intentionally scoped to this mounted notification center.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const icons = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  };

  return (
    <>
      <div className="global-toast-region" aria-live="polite" aria-label="System notifications">
        {toasts.map((toast) => {
          const Icon = icons[toast.type] || Info;
          return (
            <div key={toast.id} className={`global-toast ${toast.type}`} role="status">
              <Icon size={22} strokeWidth={2.2} aria-hidden="true" />
              <p>{toast.message}</p>
              <button type="button" onClick={() => dismiss(toast.id)} aria-label="Close notification">
                <X size={18} />
              </button>
            </div>
          );
        })}
      </div>
      <style>{`
        .pawcruz-toast-source{display:none!important}
        .global-toast-region{position:fixed;top:20px;right:22px;z-index:2147483000;width:min(420px,calc(100vw - 32px));display:grid;gap:12px;pointer-events:none}
        .global-toast{pointer-events:auto;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;min-height:64px;padding:15px 14px 15px 16px;border:1px solid;border-radius:16px;background:#fff;box-shadow:0 14px 42px rgba(25,64,82,.20);animation:pawcruzToastIn .24s ease-out both}
        .global-toast p{margin:0;font-size:15px;font-weight:650;line-height:1.45;overflow-wrap:anywhere}
        .global-toast button{width:32px;height:32px;display:grid;place-items:center;border:0;border-radius:9px;background:transparent;color:currentColor;cursor:pointer;opacity:.72}
        .global-toast button:hover{background:rgba(0,0,0,.06);opacity:1}
        .global-toast.success{color:#167348;background:#effaf4;border-color:#ccebd9}
        .global-toast.error{color:#ad3540;background:#fff2f3;border-color:#f2cdd1}
        .global-toast.warning{color:#8a6416;background:#fff9e9;border-color:#f0dfaa}
        .global-toast.info{color:#176f98;background:#eff9fd;border-color:#c9e7f3}
        @keyframes pawcruzToastIn{from{opacity:0;transform:translateY(-12px) scale(.98)}to{opacity:1;transform:none}}
        @media(max-width:600px){.global-toast-region{top:12px;right:16px;left:16px;width:auto}.global-toast{min-height:58px;padding:13px}.global-toast p{font-size:14px}}
        @media(prefers-reduced-motion:reduce){.global-toast{animation:none}}
      `}</style>
    </>
  );
}
