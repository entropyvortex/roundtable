// Shared store reset for component suites: no run, no sweep, an empty panel.
import { DEFAULT_OPTIONS, useArenaStore } from "@/lib/store";

export function resetStore(): void {
  const s = useArenaStore.getState();
  s.reset();
  s.clearSweep();
  useArenaStore.setState({ participants: [], prompt: "", options: { ...DEFAULT_OPTIONS } });
}
