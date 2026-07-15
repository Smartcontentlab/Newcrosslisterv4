import { AppLayout } from "@/components/layout/AppLayout";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <AppLayout>
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
        <h1 className="text-6xl font-black font-mono text-primary mb-4">404</h1>
        <h2 className="text-2xl font-bold tracking-tight mb-2">Page Not Found</h2>
        <p className="text-muted-foreground max-w-md mb-8">
          The page you're looking for doesn't exist or has been moved. Keep searching, the best deals are usually hidden!
        </p>
        <Link href="/" className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6 py-2 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors">
          Return to Dashboard
        </Link>
      </div>
    </AppLayout>
  );
}
