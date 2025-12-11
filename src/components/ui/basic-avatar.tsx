import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from "@/lib/utils"

type BasicAvatarProps = {
  src?: string | null;
  fallback: string;
  className?: string;
  imageClassName?: string;
}

const BasicAvatar = ({ src, fallback, className, imageClassName }: BasicAvatarProps) => {
  return (
    <Avatar className={cn("h-8 w-8 border border-muted", className || "")}>
      <AvatarImage
        src={src || undefined}
        alt={fallback}
        className={cn("object-cover", imageClassName || "")}
      />
      <AvatarFallback className="text-xs bg-muted text-muted-foreground">
        {fallback.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}

export default BasicAvatar
