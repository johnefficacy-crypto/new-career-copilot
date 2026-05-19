import React from "react";
import { HelpCircle } from "lucide-react";
import { useHowItWorks } from "./HowItWorksProvider";

// PR9: page-level "?" trigger that opens the PR6 How-it-works drawer at
// a page-specific default topic. Caller places this in the page header;
// the drawer itself is mounted once by HowItWorksProvider at the shell
// level, so this component only dispatches an open request — no drawer
// state lives here, and the existing focus-return behavior in the
// provider sends focus back to this button on close.
export default function HowItWorksHeaderButton({
  defaultTopic,
  pageName,
  className = "",
  testId,
}) {
  const { open } = useHowItWorks();
  const label = `How ${pageName} works`;
  return (
    <button
      type="button"
      onClick={() => open(defaultTopic)}
      aria-label={label}
      title={label}
      data-testid={testId || `how-it-works-trigger-${defaultTopic}`}
      data-topic={defaultTopic}
      className={
        "inline-grid h-9 w-9 place-items-center rounded-full border border-[#E7DECB] " +
        "bg-white/80 text-clay-700 transition hover:bg-white hover:text-clay-900 " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-clay-500 " +
        "focus-visible:ring-offset-2 focus-visible:ring-offset-[#FBF6EF] " +
        (className || "")
      }
    >
      <HelpCircle className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
