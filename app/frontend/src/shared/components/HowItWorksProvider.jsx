import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import HowItWorksDrawer from "./HowItWorksDrawer";

// PR6: provider mounts the global drawer once (at the DashShell level)
// and listens for the `ccp:how-it-works:open` CustomEvent so any
// component anywhere in the tree can request a drawer without prop
// drilling. The event contract:
//
//   window.dispatchEvent(new CustomEvent("ccp:how-it-works:open", {
//     detail: { topic: "persona", data: { ... optional ... } }
//   }));
//
// Programmatic callers can also use the `useHowItWorks` hook to avoid
// the global event entirely.

const HOW_IT_WORKS_EVENT = "ccp:how-it-works:open";

const HowItWorksContext = createContext({
  open: () => {},
  close: () => {},
});

export function useHowItWorks() {
  return useContext(HowItWorksContext);
}

export default function HowItWorksProvider({ children }) {
  const [state, setState] = useState({ open: false, topic: null, data: null });
  // Track which element opened the drawer so we can return focus to it
  // on close. Falls back to document.activeElement at the moment of open.
  const openerRef = useRef(null);

  const open = useCallback((topic, data) => {
    openerRef.current = typeof document !== "undefined" ? document.activeElement : null;
    setState({ open: true, topic, data: data ?? null });
  }, []);

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    // Restore focus after the drawer unmounts. Defer to the next tick so
    // React has finished its cleanup and the previously focused element
    // is still in the DOM.
    setTimeout(() => {
      const el = openerRef.current;
      if (el && typeof el.focus === "function" && document.contains(el)) {
        el.focus();
      }
      openerRef.current = null;
    }, 0);
  }, []);

  useEffect(() => {
    function onOpen(e) {
      const topic = e?.detail?.topic;
      const data = e?.detail?.data ?? null;
      if (!topic) return;
      open(topic, data);
    }
    window.addEventListener(HOW_IT_WORKS_EVENT, onOpen);
    return () => window.removeEventListener(HOW_IT_WORKS_EVENT, onOpen);
  }, [open]);

  return (
    <HowItWorksContext.Provider value={{ open, close }}>
      {children}
      <HowItWorksDrawer
        open={state.open}
        topic={state.topic}
        data={state.data}
        onClose={close}
      />
    </HowItWorksContext.Provider>
  );
}

export { HOW_IT_WORKS_EVENT };
