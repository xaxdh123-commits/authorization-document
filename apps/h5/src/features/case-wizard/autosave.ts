export interface DraftClient { saveDraft(input: unknown): Promise<void>; }
export function createAutosave(client: DraftClient, delayMs = 300) { let timer: ReturnType<typeof setTimeout> | undefined; return (value: unknown) => { if (timer) clearTimeout(timer); timer = setTimeout(() => void client.saveDraft(value), delayMs); }; }
