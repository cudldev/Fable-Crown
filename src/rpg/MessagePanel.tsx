import { useEffect, useRef, useState } from "react";
import type { CommandReceipt, GameMessage } from "./types";
import "./message-panel.css";

interface Props {
  messages: GameMessage[];
  epoch: number;
  expanded: boolean;
  onExpandedChange: (value: boolean) => void;
  rejection: CommandReceipt | null;
}
type Filter = "all" | "event" | "dialogue";

/** A readable history of consequences; routine production stays in world feedback. */
export function MessagePanel({
  messages,
  epoch,
  expanded,
  onExpandedChange,
  rejection,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const highest = messages.at(-1)?.id ?? 0;
  const [readThrough, setReadThrough] = useState(highest);
  const previousEpoch = useRef(epoch);
  const history = useRef<HTMLDivElement>(null);
  const followNewest = useRef(true);
  useEffect(() => {
    if (previousEpoch.current !== epoch) {
      previousEpoch.current = epoch;
      setReadThrough(highest);
      followNewest.current = true;
    } else if (expanded) setReadThrough(highest);
  }, [epoch, expanded, highest]);
  useEffect(() => {
    if (expanded && history.current && followNewest.current)
      history.current.scrollTop = history.current.scrollHeight;
  }, [expanded, highest, messages, rejection, filter]);
  const rows = messages.filter(
    (message) => filter === "all" || message.category === filter,
  );
  const unread = messages.filter((message) => message.id > readThrough).length;
  const toggle = () => {
    followNewest.current = true;
    onExpandedChange(!expanded);
  };
  const line = (message: GameMessage) => (
    <>
      <span>{message.text}</span>
      {message.count > 1 && (
        <b aria-label={`${message.count} occurrences`}> ×{message.count}</b>
      )}
    </>
  );
  return (
    <aside
      className={`rpg-messages ${expanded ? "expanded" : "compact"}`}
      aria-label="Important messages"
    >
      <div className="message-heading">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls="game-message-history"
          aria-label={expanded ? "Collapse messages" : "Open messages"}
        >
          Messages{unread > 0 && <b className="message-unread"> {unread}</b>}{" "}
          <span aria-hidden="true">{expanded ? "▾" : "▴"}</span>
        </button>
        {!expanded && (
          <div
            className="message-preview"
            aria-label="Recent important messages"
            aria-live="polite"
          >
            {rejection ? (
              <p>
                <span>{rejection.message}</span>
              </p>
            ) : (
              messages
                .slice(-2)
                .map((message) => <p key={message.id}>{line(message)}</p>)
            )}
            {!rejection && messages.length === 0 && (
              <p>
                <span>Important events and conversations appear here.</span>
              </p>
            )}
          </div>
        )}
      </div>
      {expanded && (
        <>
          <div
            className="message-filters"
            role="tablist"
            aria-label="Message filters"
          >
            {(
              [
                ["all", "All"],
                ["event", "Events"],
                ["dialogue", "Dialogue"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            id="game-message-history"
            className="message-history"
            role="log"
            aria-label="Message history"
            aria-live="polite"
            ref={history}
            onScroll={() => {
              const node = history.current;
              if (node)
                followNewest.current =
                  node.scrollHeight - node.scrollTop - node.clientHeight < 40;
            }}
          >
            {rows.map((message) => (
              <p key={message.id} data-category={message.category}>
                <small>
                  {message.category === "dialogue" ? "Dialogue" : "Event"}
                </small>
                {line(message)}
              </p>
            ))}
            {rejection && filter !== "dialogue" && (
              <p className="message-blocker">
                <small>Action unavailable</small>
                {rejection.message}
              </p>
            )}
            {!rows.length && !(rejection && filter !== "dialogue") && (
              <p className="message-empty">
                No{" "}
                {filter === "all"
                  ? "important messages"
                  : filter === "event"
                    ? "events"
                    : "dialogue"}{" "}
                yet.
              </p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
