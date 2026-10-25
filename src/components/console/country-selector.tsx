"use client";
import { useId } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe2 } from "lucide-react";
import { callingCountries, type DialingCountry } from "@/lib/calling-countries";

export function CountrySelector({ country, disabled, onChange,paid=false }: {
  country: DialingCountry;
  disabled: boolean;
  onChange: (country: DialingCountry) => void;
  paid?:boolean;
}) {
  const id=useId();
  return <div className="terminal-country-field">
    <Label htmlFor={id} className="terminal-country-caption">CALLING DESTINATION</Label>
    <span className="terminal-country-control">
      <Globe2 size={18} aria-hidden="true" />
      <Select value={country} disabled={disabled} onValueChange={value=>onChange(value as DialingCountry)}>
        <SelectTrigger id={id} aria-label="Destination country"><SelectValue/></SelectTrigger>
        <SelectContent>{callingCountries.filter(item=>!paid||['GB','AU'].includes(item.code)).map((item) => <SelectItem key={item.code} value={item.code}>
          {item.name} ({item.prefix})
        </SelectItem>)}</SelectContent>
      </Select>
    </span>
  </div>;
}
