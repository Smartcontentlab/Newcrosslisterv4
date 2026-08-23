import { Link } from 'wouter';
import { Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-6">
        <div className="space-y-4">
          <h1 
            className="font-pixel text-8xl text-primary text-glow-pink glitch-text animate-flicker" 
            data-text="404"
          >
            404
          </h1>
          <p className="font-pixel text-2xl text-secondary text-glow-purple">Page Not Found</p>
          <p className="text-muted-foreground font-sans max-w-md mx-auto">
            This page got lost in the resale void ★
          </p>
        </div>
        
        <div className="glass-card-glow p-8 rounded-xl max-w-md mx-auto">
          <p className="font-sans text-sm text-muted-foreground mb-4">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Link href="/">
            <Button className="neon-glow-pink font-sans font-bold" data-testid="button-home">
              <Home size={20} /> Back to Dashboard
            </Button>
          </Link>
        </div>

        <div className="flex justify-center gap-4 pt-8">
          <span className="text-primary text-2xl animate-pulse">★</span>
          <span className="text-accent text-2xl animate-pulse delay-100">♥</span>
          <span className="text-secondary text-2xl animate-pulse delay-200">✦</span>
        </div>
      </div>
    </div>
  );
}
