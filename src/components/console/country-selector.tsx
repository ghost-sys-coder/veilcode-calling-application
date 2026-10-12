import { ChevronDown, Globe2 } from "lucide-react";
import { callingCountries, type DialingCountry } from "@/lib/calling-countries";

export function CountrySelector({ country, disabled, onChange }: {
  country: DialingCountry;
  disabled: boolean;
  onChange: (country: DialingCountry) => void;
}) {
  return <label className="terminal-country-field">
    <span className="terminal-country-caption">CALLING DESTINATION</span>
    <span className="terminal-country-control">
      <Globe2 size={18} aria-hidden="true" />
      <select aria-label="Destination country" value={country} disabled={disabled}
        onChange={(event) => onChange(event.target.value as DialingCountry)}>
        {callingCountries.map((item) => <option key={item.code} value={item.code}>
          {item.name} ({item.prefix})
        </option>)}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </span>
  </label>;
}
