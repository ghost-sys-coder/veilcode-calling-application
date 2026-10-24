"use client";
import { useId } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneOutgoing } from "lucide-react";
import type { CallerIdOption } from "@/lib/caller-id-types";

export function CallerIdSelector({ callerIds, value, disabled, onChange }: {
  callerIds: readonly CallerIdOption[];
  value: string;
  disabled: boolean;
  onChange: (number: string) => void;
}) {
  const id=useId();
  const selected=callerIds.find(item=>item.number===value);
  return <div className="terminal-country-field">
    <Label htmlFor={id} className="terminal-country-caption">CALL FROM</Label>
    <span className="terminal-country-control">
      <PhoneOutgoing size={18} aria-hidden="true" />
      <Select value={value} disabled={disabled || callerIds.length === 0} onValueChange={onChange}>
        <SelectTrigger id={id} aria-label="Call from" aria-describedby={`${id}-hint`}><SelectValue placeholder="No calling numbers configured">{selected && <span className="caller-id-value"><span>{selected.label}</span><strong>{selected.number}</strong></span>}</SelectValue></SelectTrigger>
        <SelectContent>{callerIds.map((item) => <SelectItem key={item.number} value={item.number}>
          {item.label} — {item.number}
        </SelectItem>)}</SelectContent>
      </Select>
    </span>
    <span id={`${id}-hint`} className="terminal-caller-hint">Your recipient sees this number.</span>
  </div>;
}
