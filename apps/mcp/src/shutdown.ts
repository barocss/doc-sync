/** Close the local stream, then release the actor only after all edits are confirmed. */
export async function shutdownSession(
    session: {client: {pending: readonly unknown[]; conditionalPending: boolean}; readonly recoveryRequired?: boolean; close(): Promise<void>},
    transport: {leave(): Promise<void>},
): Promise<void> {
    const settled = session.client.pending.length === 0 && !session.client.conditionalPending && !session.recoveryRequired;
    await session.close();
    if (settled) await transport.leave().catch(() => undefined);
}
