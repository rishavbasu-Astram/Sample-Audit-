import { FileBox } from "lucide-react";

interface EmptyPlaceholderProps {
  title: string;
  description: string;
}

export function EmptyPlaceholder({ title, description }: EmptyPlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-md border bg-card border-dashed border-2">
      <div className="h-12 w-12 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
        <FileBox className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
    </div>
  );
}
