import { MapPin, Palette, ShieldCheck, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useDashboardContext } from '@/components/AppLayout';
import { cn } from '@/lib/utils';

const yardZones = [
  { id: 'A1', name: 'Receiving', capacity: 32, occupied: 26, priority: 'high' },
  { id: 'B2', name: 'Detail & Wash', capacity: 18, occupied: 14, priority: 'medium' },
  { id: 'C3', name: 'Outbound staging', capacity: 26, occupied: 17, priority: 'high' },
  { id: 'D4', name: 'Finance hold', capacity: 10, occupied: 6, priority: 'low' },
  { id: 'E5', name: 'EV charging row', capacity: 12, occupied: 9, priority: 'medium' },
];

const inboundToday = [
  { time: '08:15', origin: 'Kent, WA', loads: 5, notes: 'Dedicated lane - on time' },
  { time: '09:45', origin: 'Missoula, MT', loads: 3, notes: 'Snow chains equipped' },
  { time: '11:10', origin: 'Medford, OR', loads: 4, notes: '2 units need detailing' },
  { time: '13:30', origin: 'Billings, MT', loads: 6, notes: 'Finance pre-cleared' },
  { time: '15:20', origin: 'Spokane, WA', loads: 2, notes: 'Hotshot delivery' },
];

const zoneTone: Record<string, string> = {
  high: 'bg-rose-50 text-rose-700 border-rose-100',
  medium: 'bg-amber-50 text-amber-700 border-amber-100',
  low: 'bg-emerald-50 text-emerald-700 border-emerald-100',
};

export default function YardPage() {
  const { dealer } = useDashboardContext();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Ground operations · {dealer}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Yard</h1>
        </div>
        <Badge variant="outline" className="rounded-full px-3">
          <Truck className="mr-2 h-4 w-4" />
          12 inbound trucks today
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {yardZones.map((zone) => {
          const utilization = Math.round((zone.occupied / zone.capacity) * 100);
          return (
            <Card key={zone.id} className="border-dashed">
              <CardHeader className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="rounded-full px-2 text-[11px]">
                    {zone.id}
                  </Badge>
                  <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', zoneTone[zone.priority])}>
                    {zone.priority} priority
                  </span>
                </div>
                <CardTitle>{zone.name}</CardTitle>
                <CardDescription>
                  {zone.occupied}/{zone.capacity} stalls used
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={utilization} />
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Utilization</span>
                  <span className="font-semibold text-foreground">{utilization}%</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inbound schedule</CardTitle>
          <CardDescription>Trucks due today with notes for staging teams.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {inboundToday.map((stop) => (
            <div
              key={`${stop.origin}-${stop.time}`}
              className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold leading-tight">{stop.origin}</p>
                <p className="text-sm text-muted-foreground">{stop.loads} loads · ETA {stop.time}</p>
              </div>
              <Badge variant="secondary" className="w-fit">{stop.notes}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Release checks</CardTitle>
          <CardDescription>Tasks that must clear before a unit can exit the yard.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {["Detailing", "Safety", "Paperwork"].map((step) => (
            <div key={step} className="space-y-3 rounded-lg border bg-muted/40 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {step === 'Detailing' && <Palette className="h-4 w-4 text-sky-600" />}
                {step === 'Safety' && <ShieldCheck className="h-4 w-4 text-emerald-600" />}
                {step === 'Paperwork' && <MapPin className="h-4 w-4 text-indigo-600" />}
                {step}
              </div>
              <Separator />
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>Open items: {step === 'Detailing' ? 11 : step === 'Safety' ? 6 : 4}</p>
                <p>Avg duration: {step === 'Detailing' ? 32 : step === 'Safety' ? 18 : 12} mins</p>
              </div>
              <Badge variant="secondary" className="w-fit">Live queue</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
