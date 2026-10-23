import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Globe2 } from "lucide-react";
import { callingCountries, type DialingCountry } from "@/lib/calling-countries";

export function CountrySelector({ country, disabled, onChange }: {
  country: DialingCountry;
  disabled: boolean;
  onChange: (country: DialingCountry) => void;
}) {
  return <Label className="terminal-country-field">
    <span className="terminal-country-caption">CALLING DESTINATION</span>
    <span className="terminal-country-control">
      <Globe2 size={18} aria-hidden="true" />
      <NativeSelect aria-label="Destination country" value={country} disabled={disabled}
        onChange={(event) => onChange(event.target.value as DialingCountry)}>
        {callingCountries.map((item) => <NativeSelectOption key={item.code} value={item.code}>
          {item.name} ({item.prefix})
        </NativeSelectOption>)}
      </NativeSelect>
    </span>
  </Label>;
}
