import { ChevronDown, PhoneOutgoing } from "lucide-react";
import type { CallerIdOption } from "@/lib/caller-id-types";

export function CallerIdSelector({ callerIds, value, disabled, onChange }: {
  callerIds: readonly CallerIdOption[];
  value: string;
  disabled: boolean;
  onChange: (number: string) => void;
}) {
  return <label className="terminal-country-field">
    <span className="terminal-country-caption">CALL FROM</span>
    <span className="terminal-country-control">
      <PhoneOutgoing size={18} aria-hidden="true" />
      <select aria-label="Call from" value={value} disabled={disabled || callerIds.length === 0}
        onChange={(event) => onChange(event.target.value)}>
        {callerIds.length === 0 && <option value="">No calling numbers configured</option>}
        {callerIds.map((item) => <option key={item.number} value={item.number}>
          {item.label} — {item.number}
        </option>)}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </span>
    <span className="terminal-caller-hint">Your recipient sees this number.</span>
  </label>;
}
