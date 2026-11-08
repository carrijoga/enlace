export type RemoteWriteRequest<T> = {
  expectedRevision: number;
  operationId: string;
  project: T;
};

/** Reuse an operation after an ambiguous response; never give its id a new body. */
export function selectWriteRequest<T>(
  retry: RemoteWriteRequest<T> | null,
  latest: () => RemoteWriteRequest<T>,
): RemoteWriteRequest<T> {
  return retry ?? latest();
}

/** An acknowledgement only clears the dirty state if no newer local edit exists. */
export function stateAfterAcknowledgement<T>(
  current: T,
  submitted: T,
  equal: (a: T, b: T) => boolean,
) {
  return equal(current, submitted) ? ('saved' as const) : ('pending' as const);
}

export function writesBlocked(status: string) {
  return status === 'conflict' || status === 'expired';
}
