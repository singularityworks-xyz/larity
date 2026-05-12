import { useEffect, useRef, useState } from "react";
import { cx } from "../../lib/ui";

interface TopicIndicatorProps {
  topic: string | null;
  className?: string;
}

export function TopicIndicator({ topic, className }: TopicIndicatorProps) {
  const [displayTopic, setDisplayTopic] = useState<string | null>(topic);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevTopicRef = useRef<string | null>(topic);

  useEffect(() => {
    if (topic !== prevTopicRef.current) {
      prevTopicRef.current = topic;
      setIsTransitioning(true);
      const timeout = window.setTimeout(() => {
        setDisplayTopic(topic);
        setIsTransitioning(false);
      }, 120);
      return () => window.clearTimeout(timeout);
    }
    setDisplayTopic(topic);
    setIsTransitioning(false);
  }, [topic]);

  return (
    <output
      className={cx(
        "min-w-0 flex-1 truncate font-medium text-fg text-xs transition-opacity duration-150",
        isTransitioning && "opacity-0",
        !(displayTopic || isTransitioning) && "opacity-40",
        className
      )}
    >
      {displayTopic ?? "Listening\u2026"}
    </output>
  );
}
