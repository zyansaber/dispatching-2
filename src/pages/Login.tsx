import { Lock, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-md border-muted-foreground/10 shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl">Dispatch Control</CardTitle>
          <CardDescription>Sign in to access the dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input id="email" type="email" placeholder="you@company.com" className="pl-9" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input id="password" type="password" placeholder="••••••••" className="pl-9" />
            </div>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 rounded border" />
              Remember me
            </label>
            <a className="text-indigo-600 hover:underline" href="#">
              Forgot password?
            </a>
          </div>
          <Button className="w-full" asChild>
            <Link to="/dashboard">Continue</Link>
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Protected demo — any credentials are accepted.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
