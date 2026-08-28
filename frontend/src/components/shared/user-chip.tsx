import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AVATAR_BG } from "@/lib/constants";
import { cn, initials } from "@/lib/utils";
import type { UserBrief } from "@/types/api";

export function UserAvatar({
  user,
  className,
}: {
  user: Pick<UserBrief, "full_name" | "avatar_color">;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      <AvatarFallback className={cn(AVATAR_BG[user.avatar_color] ?? "bg-zinc-500")}>
        {initials(user.full_name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function UserChip({ user, className }: { user: UserBrief | null; className?: string }) {
  if (!user) return <span className="text-sm text-muted-foreground">Sin asignar</span>;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <UserAvatar user={user} className="size-5 text-[9px]" />
      <span className="truncate text-sm">{user.full_name}</span>
    </span>
  );
}
