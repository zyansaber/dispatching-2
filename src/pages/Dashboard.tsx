import { DollarSign, Receipt, ShieldCheck, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDashboardContext } from '@/components/AppLayout';

const payoutQueue = [
  { dealer: 'Cascade Volvo', status: 'ready', amount: '$184,200', due: 'Today' },
  { dealer: 'Blue River Trucks', status: 'review', amount: '$92,400', due: 'Today' },
  { dealer: 'North Loop Freight', status: 'hold', amount: '$41,800', due: 'Tomorrow' },
  { dealer: 'Prairie Logistics', status: 'ready', amount: '$74,600', due: 'Fri' },
];

const financeMetrics = [
  { title: 'Receivables', value: '$412,800', change: '+6.2%', icon: DollarSign },
  { title: 'Pending payouts', value: '$133,400', change: '12 queued', icon: Receipt },
  { title: 'Risk holds', value: '7 accounts', change: '2 escalated', icon: ShieldCheck },
  { title: 'Margin', value: '18.4%', change: '+0.8 pts', icon: TrendingUp },
];

const statusTone: Record<string, string> = {
  ready: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  review: 'bg-amber-100 text-amber-700 border-amber-200',
  hold: 'bg-rose-100 text-rose-700 border-rose-200',
};

export default function FinancePage() {
  const { dealer } = useDashboardContext();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Billing & risk · {dealer}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Finance</h1>
        </div>
        <Badge variant="outline" className="rounded-full px-3">Auto-sync nightly</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {financeMetrics.map((metric) => (
          <Card key={metric.title} className="border-dashed">
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <metric.icon className="h-4 w-4 text-indigo-600" />
                {metric.title}
              </div>
              <CardTitle className="text-2xl">{metric.value}</CardTitle>
              <CardDescription>{metric.change}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payout queue</CardTitle>
          <CardDescription>Dealer remittances ready for release or review.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dealer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="text-right">Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payoutQueue.map((row) => (
                <TableRow key={row.dealer}>
                  <TableCell className="font-semibold">{row.dealer}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone[row.status]}`}>
                      {row.status}
                    </span>
                  </TableCell>
                  <TableCell>{row.amount}</TableCell>
                  <TableCell className="text-right">{row.due}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Risk and compliance</CardTitle>
          <CardDescription>Cross-check credit, insurance, and lien status before releasing units.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {["Insurance", "Credit", "Taxes"].map((item) => (
            <div key={item} className="space-y-2 rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                {item}
              </div>
              <Separator />
              <p className="text-sm text-muted-foreground">{Math.floor(Math.random() * 5) + 2} verifications pending</p>
              <Badge variant="secondary" className="w-fit">Auto-checking</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
