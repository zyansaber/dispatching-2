import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useDashboardContext } from '@/components/AppLayout';

export default function FinancePage() {
  const { dealer } = useDashboardContext();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Billing & risk · {dealer}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Finance</h1>
        </div>
        <Badge variant="outline" className="rounded-full px-3">Live data expected from ERP</Badge>
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>No finance queues connected</CardTitle>
          <CardDescription>
            This view stays empty until we hook it up to your existing payout/hold sources.
            No fabricated rows are shown here.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {["Insurance", "Credit", "Taxes"].map((item) => (
            <div key={item} className="space-y-2 rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                {item}
              </div>
              <Separator />
              <p className="text-sm text-muted-foreground">Waiting on real integrations.</p>
              <Badge variant="secondary" className="w-fit">Placeholder only</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
