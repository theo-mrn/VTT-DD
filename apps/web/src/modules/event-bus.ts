import type { GameEvent } from './types';

type EventHandler<T = unknown> = (payload: T) => void;

class GameEventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  on<T extends GameEvent['type']>(
    eventType: T,
    handler: EventHandler<Extract<GameEvent, { type: T }>['payload']>
  ): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as EventHandler);

    return () => {
      this.handlers.get(eventType)?.delete(handler as EventHandler);
    };
  }

  emit(event: GameEvent): void {
    const handlers = this.handlers.get(event.type);
    if (!handlers) return;
    handlers.forEach(handler => {
      try {
        handler(event.payload);
      } catch (error) {
        console.error(`[VTT Modules] Error in event handler for "${event.type}":`, error);
      }
    });
  }
}

export const gameEventBus = new GameEventBus();
