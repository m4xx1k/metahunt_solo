import { cn } from "@/lib/utils";
import Image from 'next/image';

export function Logo({
  className,
  label = "мetahunt",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Image src={'/logo.webp'} alt="logo" width={32} height={32} className='rounded-full animate-pulse' />
      <span className="font-display text-3xl font-black tracking-tight text-text-primary">
        <span className="text-accent">[</span>
        {label.toLowerCase()}
        <span className="text-accent">]</span>
      </span>
    </div>
  );
}
