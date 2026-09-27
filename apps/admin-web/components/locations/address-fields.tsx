import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { LocationAddressInput } from '@/lib/actions/locations';

export function AddressFields({
  value,
  onChange,
}: {
  value: LocationAddressInput;
  onChange: (patch: Partial<LocationAddressInput>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="addressLine1">Address (optional)</Label>
          <Input id="addressLine1" value={value.addressLine1} onChange={(e) => onChange({ addressLine1: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="addressLine2">Suite/unit</Label>
          <Input id="addressLine2" value={value.addressLine2} onChange={(e) => onChange({ addressLine2: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="city">City</Label>
          <Input id="city" value={value.city} onChange={(e) => onChange({ city: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="state">State</Label>
          <Input id="state" value={value.state} onChange={(e) => onChange({ state: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="postalCode">ZIP</Label>
          <Input id="postalCode" value={value.postalCode} onChange={(e) => onChange({ postalCode: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
