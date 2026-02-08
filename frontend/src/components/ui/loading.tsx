import React from "react";
import { cn } from "@/lib/utils";

interface LoadingProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
  text?: string;
}

export const Loading = React.forwardRef<HTMLDivElement, LoadingProps>(
  ({ className, size = "md", text, ...props }, ref) => {
    const sizes = {
      sm: "h-4 w-4",
      md: "h-8 w-8",
      lg: "h-12 w-12",
    };

    return (
      <div
        ref={ref}
        className={cn("flex items-center justify-center", className)}
        {...props}
      >
        <div className="flex flex-col items-center gap-2">
          <div
            className={cn(
              "animate-spin rounded-full border-2 border-gray-300 border-t-blue-600",
              sizes[size],
            )}
          />
          {text && (
            <p className="text-sm text-gray-600 dark:text-gray-400">{text}</p>
          )}
        </div>
      </div>
    );
  },
);

Loading.displayName = "Loading";

export const Spinner = ({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) => {
  const sizes = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  return (
    <div
      className={cn(
        "animate-spin rounded-full border-2 border-gray-300 border-t-blue-600",
        sizes[size],
        className,
      )}
    />
  );
};
