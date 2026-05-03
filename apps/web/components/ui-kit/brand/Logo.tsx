import { cn } from "@/lib/utils";
import Image from 'next/image';

export function Logo({
  className,
  label = "MetaHunt",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Image src={'/logo.webp'} alt="logo" width={32} height={32} className='rounded-xs' />
      <span className="font-display text-xl font-bold tracking-tight text-text-primary">
        {label}
      </span>
    </div>
  );
}
