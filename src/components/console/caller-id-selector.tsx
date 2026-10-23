import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PhoneOutgoing } from "lucide-react";
import type { CallerIdOption } from "@/lib/caller-id-types";

export function CallerIdSelector({ callerIds, value, disabled, onChange }: {
  callerIds: readonly CallerIdOption[];
  value: string;
  disabled: boolean;
  onChange: (number: string) => void;
}) {
  return <Label className="terminal-country-field">
    <span className="terminal-country-caption">CALL FROM</span>
    <span className="terminal-country-control">
      <PhoneOutgoing size={18} aria-hidden="true" />
      <NativeSelect aria-label="Call from" value={value} disabled={disabled || callerIds.length === 0}
        onChange={(event) => onChange(event.target.value)}>
        {callerIds.length === 0 && <NativeSelectOption value="">No calling numbers configured</NativeSelectOption>}
        {callerIds.map((item) => <NativeSelectOption key={item.number} value={item.number}>
          {item.label} — {item.number}
        </NativeSelectOption>)}
      </NativeSelect>
    </span>
    <span className="terminal-caller-hint">Your recipient sees this number.</span>
  </Label>;
}
