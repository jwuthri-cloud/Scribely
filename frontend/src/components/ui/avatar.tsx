import React from "react";
import { cn } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: "sm" | "md" | "lg";
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, fallback, size = "md", ...props }, ref) => {
    const sizes = {
      sm: "h-8 w-8",
      md: "h-10 w-10",
      lg: "h-12 w-12",
    };

    const textSizes = {
      sm: "text-xs",
      md: "text-sm",
      lg: "text-base",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex shrink-0 overflow-hidden rounded-full",
          sizes[size],
          className,
        )}
        {...props}
      >
        {src ? (
          <img
            className="aspect-square h-full w-full object-cover"
            src={src}
            alt={alt}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <span
              className={cn(
                "font-medium text-gray-600 dark:text-gray-400",
                textSizes[size],
              )}
            >
              {fallback || "?"}
            </span>
          </div>
        )}
      </div>
    );
  },
);

Avatar.displayName = "Avatar";
