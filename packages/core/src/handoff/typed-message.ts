/**
 * Wrap a strongly typed `MessageEvent<T>` handler so it can be assigned to
 * `self.onmessage` (which is typically `MessageEvent<any>` in lib.dom.d.ts).
 *
 * This preserves the payload type `T` for inference inside the handler.
 */
export function createTypedMessageHandler<T>(
  handler: (event: MessageEvent<T>) => void,
): (event: MessageEvent) => void {
  return (event: MessageEvent) => {
    handler(event as MessageEvent<T>);
  };
}
