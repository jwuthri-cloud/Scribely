import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useState, KeyboardEvent } from "react";

interface User {
  id: string | number;
  name?: string;
  image: string;
}

interface UserAvatarsProps {
  /** List of users with id, name, and image */
  users: User[];
  /** Avatar size in px (default: 56) */
  size?: number | string;
  /** Extra classNames for container */
  className?: string;
  /** Max number of visible avatars before showing +X bubble (default: 7) */
  maxVisible?: number;
  /** Overlap percentage between avatars (default: 60) */
  overlap?: number;
  /** Hover scale factor (default: 1.2) */
  focusScale?: number;
  /** Display avatars from right to left (default: false) */
  isRightToLeft?: boolean;
  /** Only overlap avatars, no shifting on hover (default: false) */
  isOverlapOnly?: boolean;
  /** Tooltip placement (default: "bottom") */
  tooltipPlacement?: "top" | "bottom";
}

export const UserAvatars = ({
  users,
  size = 56,
  className,
  maxVisible = 7,
  isRightToLeft = false,
  isOverlapOnly = false,
  overlap = 60,
  focusScale = 1.2,
  tooltipPlacement = "bottom",
}: UserAvatarsProps) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const slicedUsers = users.slice(0, Math.min(maxVisible + 1, users.length + 1));
  const exceedMaxLength = users.length > maxVisible;

  const handleKeyEnter = (e: KeyboardEvent<HTMLDivElement>, index: number) => {
    if (e.key === "Enter" || e.key === " ") {
      setHoveredIndex(index);
    }
  };

  return (
    <div className={cn("flex items-center relative", className)}>
      {slicedUsers.map((user, index) => {
        const isHoveredOne = hoveredIndex === index;
        const isLengthBubble = exceedMaxLength && maxVisible === index;

        const diff = 1 - overlap / 100;
        const zIndex =
          isHoveredOne && isOverlapOnly
            ? slicedUsers.length
            : isRightToLeft
            ? slicedUsers.length - index
            : index;

        const shouldScale =
          isHoveredOne &&
          (!exceedMaxLength || slicedUsers.length - 1 !== index);

        const shouldShift =
          hoveredIndex !== null &&
          (isRightToLeft ? index < hoveredIndex : index > hoveredIndex) &&
          !isOverlapOnly;

        const baseGap = Number(size) * (overlap / 100);
        const neededGap = (Number(size) * (1 + focusScale)) / 2;
        const shift = Math.max(0, neededGap - baseGap);

        return (
          <motion.div
            key={user.id}
            role="img"
            aria-label={user.name || "User avatar"}
            className="relative cursor-pointer outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary rounded-full"
            style={{
              width: size,
              height: size,
              zIndex,
              marginLeft: index === 0 ? 0 : -Number(size) * diff,
            }}
            tabIndex={0}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            onFocus={() => setHoveredIndex(index)}
            onBlur={() => setHoveredIndex(null)}
            onKeyDown={(e) => handleKeyEnter(e, index)}
            animate={{
              scale: shouldScale ? focusScale : 1,
              x: shouldShift ? shift * (isRightToLeft ? -1 : 1) : 0,
            }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            <div className="w-full h-full rounded-full overflow-hidden border border-white shadow-md">
              {isLengthBubble ? (
                <div className="flex h-full w-full items-center justify-center bg-background text-xs font-medium">
                  +{users.length - maxVisible}
                </div>
              ) : (
                <img
                  src={user.image}
                  alt={user.name || "User"}
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            <AnimatePresence>
              {shouldScale && user.name && (
                <motion.div
                  role="tooltip"
                  initial={{
                    opacity: 0,
                    y: tooltipPlacement === "bottom" ? 8 : -8,
                  }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    y: tooltipPlacement === "bottom" ? 8 : -8,
                  }}
                  transition={{ duration: 0.18 }}
                  className={cn(
                    "absolute left-1/2 z-50",
                    tooltipPlacement === "bottom"
                      ? "top-full mt-2"
                      : "bottom-full mb-2"
                  )}
                >
                  <div className="transform -translate-x-1/2 whitespace-nowrap rounded-md bg-black text-white text-xs px-2 py-1 shadow-lg">
                    {user.name}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
};
