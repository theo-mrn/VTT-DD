import { DiceRoller } from "@/components/(dices)/dice-roller";
import { NumberTicker } from "@/components/magicui/number-ticker";

export default function DiceRollerPage() {
  return (
    <div className="min-h-screen bg-background">
      <DiceRoller />
      <NumberTicker
      value={100}
      className="whitespace-pre-wrap text-8xl font-medium tracking-tighter text-black dark:text-white"
    />
    </div>
  );
} 